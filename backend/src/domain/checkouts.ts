import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  GetCommand,
  TransactWriteCommand,
  UpdateCommand,
  type TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { docClient, queryAll, TABLE, toEntity } from '../lib/ddb.js';
import { conflict, notFound, unprocessable } from '../lib/errors.js';
import { newId } from '../lib/ids.js';
import { endOfDayAfter } from '../lib/time.js';
import {
  GSI1,
  GSI3,
  memberHistoryPk,
  openLoansPk,
  openLoansSk,
  PK,
  PREFIX,
  SK,
} from './keys.js';
import { canRenew, computeDueAt, evaluateEligibility } from './rules.js';
import { borrowLimitFor, type Asset, type Checkout, type Member, type Org } from './types.js';

export interface CheckoutRequest {
  org: Org;
  member: Member;
  asset: Asset;
  loanDays?: number;
  notes?: string;
  actor: string;
  now?: Date;
}

function checkoutItem(checkout: Checkout) {
  return {
    PK: PK(checkout.orgId),
    SK: SK.checkout(checkout.checkoutId),
    entityType: 'Checkout',
    gsi1pk: openLoansPk(checkout.orgId),
    gsi1sk: openLoansSk(checkout.dueAt, checkout.checkoutId),
    gsi3pk: memberHistoryPk(checkout.orgId, checkout.memberId),
    gsi3sk: `CHECKOUT#${checkout.checkoutId}`,
    ...checkout,
  };
}

/**
 * Maps a rejected transaction back to the specific rule that failed. The
 * pre-flight eligibility read can go stale between two staff scanning the same
 * item, and this is where that race surfaces as a readable message.
 */
function explainCancellation(
  error: TransactionCanceledException,
  member: Member,
  asset: Asset,
): never {
  const [, assetReason, memberReason] = error.CancellationReasons ?? [];
  if (assetReason?.Code === 'ConditionalCheckFailed') {
    throw conflict(
      'ASSET_UNAVAILABLE',
      `"${asset.title}" was just taken by someone else. Refresh and try again.`,
    );
  }
  if (memberReason?.Code === 'ConditionalCheckFailed') {
    throw conflict(
      'BORROW_LIMIT_REACHED',
      `${member.name} has reached the ${borrowLimitFor(member)} item borrowing limit.`,
    );
  }
  throw conflict('CHECKOUT_FAILED', 'The checkout could not be completed. Please try again.');
}

export async function checkoutAsset(request: CheckoutRequest): Promise<Checkout> {
  const { org, member, asset, actor } = request;
  const now = request.now ?? new Date();

  const blockers = evaluateEligibility({ org, member, asset, now });
  if (blockers.length > 0) {
    throw unprocessable('CHECKOUT_BLOCKED', blockers[0]!.message, { blockers });
  }

  const loanDays = request.loanDays ?? org.defaultLoanDays;
  const checkout: Checkout = {
    orgId: org.orgId,
    checkoutId: newId(),
    assetId: asset.assetId,
    assetCode: asset.code,
    assetTitle: asset.title,
    memberId: member.memberId,
    memberName: member.name,
    memberPhone: member.phone,
    status: 'open',
    loanDays,
    checkedOutAt: now.toISOString(),
    dueAt: computeDueAt(now, loanDays, org.timezone),
    renewals: 0,
    checkedOutBy: actor,
    notes: request.notes,
    remindersSent: 0,
  };

  const input: TransactWriteCommandInput = {
    TransactItems: [
      {
        Put: {
          TableName: TABLE(),
          Item: checkoutItem(checkout),
          ConditionExpression: 'attribute_not_exists(SK)',
        },
      },
      {
        Update: {
          TableName: TABLE(),
          Key: { PK: PK(org.orgId), SK: SK.asset(asset.assetId) },
          UpdateExpression:
            'SET #status = :checkedOut, activeCheckoutId = :cid, activeMemberId = :mid, ' +
            'activeMemberName = :mname, dueAt = :due, updatedAt = :now ADD timesBorrowed :one',
          ConditionExpression: 'attribute_exists(SK) AND #status = :available',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':checkedOut': 'checked_out',
            ':available': 'available',
            ':cid': checkout.checkoutId,
            ':mid': member.memberId,
            ':mname': member.name,
            ':due': checkout.dueAt,
            ':now': checkout.checkedOutAt,
            ':one': 1,
          },
        },
      },
      {
        Update: {
          TableName: TABLE(),
          Key: { PK: PK(org.orgId), SK: SK.member(member.memberId) },
          UpdateExpression: 'SET updatedAt = :now ADD openLoans :one, totalLoans :one',
          ConditionExpression:
            'attribute_exists(SK) AND openLoans < :limit AND #status = :active',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':one': 1,
            ':limit': borrowLimitFor(member),
            ':active': 'active',
            ':now': checkout.checkedOutAt,
          },
        },
      },
    ],
  };

  try {
    await docClient().send(new TransactWriteCommand(input));
  } catch (error) {
    if (error instanceof TransactionCanceledException) explainCancellation(error, member, asset);
    throw error;
  }

  return checkout;
}

export async function getCheckout(orgId: string, checkoutId: string): Promise<Checkout> {
  const result = await docClient().send(
    new GetCommand({ TableName: TABLE(), Key: { PK: PK(orgId), SK: SK.checkout(checkoutId) } }),
  );
  if (!result.Item) throw notFound('Checkout record not found');
  return toEntity<Checkout>(result.Item);
}

export interface CloseOptions {
  actor: string;
  outcome: 'returned' | 'lost';
  condition?: string;
  notes?: string;
  now?: Date;
}

/**
 * Check-in and "declare lost" share one transaction shape: close the loan, free
 * the member's slot, and put the asset into its resulting state.
 */
export async function closeCheckout(
  checkout: Checkout,
  options: CloseOptions,
): Promise<Checkout> {
  if (checkout.status !== 'open') {
    throw conflict(
      'ALREADY_CLOSED',
      `This loan was already ${checkout.status} on ${
        (checkout.returnedAt ?? checkout.markedLostAt ?? '').slice(0, 10)
      }.`,
    );
  }

  const now = (options.now ?? new Date()).toISOString();
  const assetStatus = options.outcome === 'returned' ? 'available' : 'lost';

  await docClient().send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Update: {
            TableName: TABLE(),
            Key: { PK: PK(checkout.orgId), SK: SK.checkout(checkout.checkoutId) },
            UpdateExpression:
              'SET #status = :status, returnedAt = :now, checkedInBy = :actor ' +
              (options.notes ? ', notes = :notes ' : '') +
              (options.outcome === 'lost' ? ', markedLostAt = :now ' : '') +
              'REMOVE gsi1pk, gsi1sk',
            ConditionExpression: '#status = :open',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
              ':status': options.outcome,
              ':open': 'open',
              ':now': now,
              ':actor': options.actor,
              ...(options.notes ? { ':notes': options.notes } : {}),
            },
          },
        },
        {
          Update: {
            TableName: TABLE(),
            Key: { PK: PK(checkout.orgId), SK: SK.asset(checkout.assetId) },
            UpdateExpression:
              'SET #status = :assetStatus, updatedAt = :now' +
              (options.condition ? ', #condition = :condition' : '') +
              ' REMOVE activeCheckoutId, activeMemberId, activeMemberName, dueAt',
            ExpressionAttributeNames: {
              '#status': 'status',
              ...(options.condition ? { '#condition': 'condition' } : {}),
            },
            ExpressionAttributeValues: {
              ':assetStatus': assetStatus,
              ':now': now,
              ...(options.condition ? { ':condition': options.condition } : {}),
            },
          },
        },
        {
          Update: {
            TableName: TABLE(),
            Key: { PK: PK(checkout.orgId), SK: SK.member(checkout.memberId) },
            UpdateExpression: 'SET updatedAt = :now ADD openLoans :minusOne',
            ConditionExpression: 'openLoans > :zero',
            ExpressionAttributeValues: { ':minusOne': -1, ':zero': 0, ':now': now },
          },
        },
      ],
    }),
  );

  return {
    ...checkout,
    status: options.outcome,
    returnedAt: now,
    checkedInBy: options.actor,
    ...(options.outcome === 'lost' ? { markedLostAt: now } : {}),
  };
}

export async function renewCheckout(
  checkout: Checkout,
  org: Org,
  actor: string,
  now = new Date(),
): Promise<Checkout> {
  const blocker = canRenew(checkout, org);
  if (blocker) throw unprocessable(blocker.code, blocker.message);

  // Extend from the later of today or the current due date so an early renewal
  // never shortens the loan the member already has.
  const base = new Date(Math.max(now.getTime(), new Date(checkout.dueAt).getTime()));
  const dueAt = endOfDayAfter(base, org.renewalDays, org.timezone).toISOString();

  await docClient().send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Update: {
            TableName: TABLE(),
            Key: { PK: PK(checkout.orgId), SK: SK.checkout(checkout.checkoutId) },
            UpdateExpression:
              'SET dueAt = :due, gsi1sk = :gsi1sk, remindersSent = :zero, ' +
              'renewedBy = :actor REMOVE dueSoonSentAt, lastReminderAt ADD renewals :one',
            ConditionExpression: '#status = :open',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
              ':due': dueAt,
              ':gsi1sk': openLoansSk(dueAt, checkout.checkoutId),
              ':open': 'open',
              ':one': 1,
              ':zero': 0,
              ':actor': actor,
            },
          },
        },
        {
          Update: {
            TableName: TABLE(),
            Key: { PK: PK(checkout.orgId), SK: SK.asset(checkout.assetId) },
            UpdateExpression: 'SET dueAt = :due, updatedAt = :now',
            ExpressionAttributeValues: { ':due': dueAt, ':now': now.toISOString() },
          },
        },
      ],
    }),
  );

  return { ...checkout, dueAt, renewals: checkout.renewals + 1, remindersSent: 0 };
}

/** Open loans for a branch, sorted by due date (most urgent first). */
export async function listOpenLoans(orgId: string, dueBefore?: string): Promise<Checkout[]> {
  return queryAll<Checkout>({
    TableName: TABLE(),
    IndexName: GSI1,
    KeyConditionExpression: dueBefore
      ? 'gsi1pk = :pk AND gsi1sk < :due'
      : 'gsi1pk = :pk',
    ExpressionAttributeValues: {
      ':pk': openLoansPk(orgId),
      ...(dueBefore ? { ':due': dueBefore } : {}),
    },
    ScanIndexForward: true,
  });
}

export async function listMemberHistory(orgId: string, memberId: string): Promise<Checkout[]> {
  const items = await queryAll<Checkout>({
    TableName: TABLE(),
    IndexName: GSI3,
    KeyConditionExpression: 'gsi3pk = :pk',
    ExpressionAttributeValues: { ':pk': memberHistoryPk(orgId, memberId) },
    ScanIndexForward: false,
  });
  return items;
}

/** Recent activity feed. Checkout ids sort by time, so SK order is time order. */
export async function listRecentCheckouts(orgId: string, limit = 100): Promise<Checkout[]> {
  const items = await queryAll<Checkout>(
    {
      TableName: TABLE(),
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: { ':pk': PK(orgId), ':sk': PREFIX.checkout },
      ScanIndexForward: false,
    },
    limit,
  );
  return items;
}

export async function recordReminderSent(
  orgId: string,
  checkoutId: string,
  kind: 'due_soon' | 'overdue',
  at: Date,
): Promise<void> {
  await docClient().send(
    new UpdateCommand({
      TableName: TABLE(),
      Key: { PK: PK(orgId), SK: SK.checkout(checkoutId) },
      UpdateExpression:
        'SET lastReminderAt = :now' +
        (kind === 'due_soon' ? ', dueSoonSentAt = :now' : '') +
        ' ADD remindersSent :one',
      ConditionExpression: 'attribute_exists(SK)',
      ExpressionAttributeValues: { ':now': at.toISOString(), ':one': kind === 'overdue' ? 1 : 0 },
    }),
  );
}
