import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, queryAll, TABLE, toEntity } from '../lib/ddb.js';
import { notFound } from '../lib/errors.js';
import { isValidTimeZone } from '../lib/time.js';
import { GSI2, ORG_REGISTRY_PK, PK, SK } from './keys.js';
import type { Org } from './types.js';

export const ORG_DEFAULTS = {
  timezone: 'Asia/Kolkata',
  defaultCountryCode: '+91',
  defaultLoanDays: 14,
  maxRenewals: 2,
  renewalDays: 7,
  reminderChannel: 'auto' as const,
  dueSoonLeadDays: 1,
  overdueReminderIntervalDays: 3,
  maxOverdueReminders: 4,
};

function toItem(org: Org) {
  return {
    PK: PK(org.orgId),
    SK: SK.org(),
    entityType: 'Org',
    gsi2pk: ORG_REGISTRY_PK,
    gsi2sk: `ORG#${org.orgId}`,
    ...org,
  };
}

export async function getOrg(orgId: string): Promise<Org> {
  const result = await docClient().send(
    new GetCommand({ TableName: TABLE(), Key: { PK: PK(orgId), SK: SK.org() } }),
  );
  if (!result.Item) throw notFound(`Organization ${orgId} has not been set up yet`);
  return toEntity<Org>(result.Item);
}

/**
 * Called on every authenticated request path that needs branch settings. A
 * Cognito user can exist before anyone has opened the app, so the first request
 * for an org materialises it with sensible defaults rather than 404-ing.
 */
export async function ensureOrg(orgId: string, fallbackName?: string): Promise<Org> {
  try {
    return await getOrg(orgId);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('has not been set up')) throw error;
    const now = new Date().toISOString();
    const org: Org = {
      orgId,
      name: fallbackName ?? 'My Library',
      ...ORG_DEFAULTS,
      createdAt: now,
      updatedAt: now,
    };
    await docClient().send(
      new PutCommand({
        TableName: TABLE(),
        Item: toItem(org),
        ConditionExpression: 'attribute_not_exists(PK)',
      }),
    );
    return org;
  }
}

const MUTABLE_FIELDS = [
  'name',
  'timezone',
  'defaultCountryCode',
  'defaultLoanDays',
  'maxRenewals',
  'renewalDays',
  'reminderChannel',
  'dueSoonLeadDays',
  'overdueReminderIntervalDays',
  'maxOverdueReminders',
  'contactPhone',
] as const;

export async function updateOrg(orgId: string, patch: Partial<Org>): Promise<Org> {
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = { ':updatedAt': new Date().toISOString() };
  const sets: string[] = ['#updatedAt = :updatedAt'];
  names['#updatedAt'] = 'updatedAt';

  for (const field of MUTABLE_FIELDS) {
    if (patch[field] === undefined) continue;
    names[`#${field}`] = field;
    values[`:${field}`] = patch[field];
    sets.push(`#${field} = :${field}`);
  }

  const result = await docClient().send(
    new UpdateCommand({
      TableName: TABLE(),
      Key: { PK: PK(orgId), SK: SK.org() },
      UpdateExpression: `SET ${sets.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ConditionExpression: 'attribute_exists(PK)',
      ReturnValues: 'ALL_NEW',
    }),
  );
  return toEntity<Org>(result.Attributes ?? {});
}

/** Tenant registry read by the nightly reminder sweep. */
export async function listOrgs(): Promise<Org[]> {
  return queryAll<Org>({
    TableName: TABLE(),
    IndexName: GSI2,
    KeyConditionExpression: 'gsi2pk = :pk',
    ExpressionAttributeValues: { ':pk': ORG_REGISTRY_PK },
  });
}

export function assertTimezone(timezone: string | undefined): void {
  if (timezone && !isValidTimeZone(timezone)) {
    throw new Error(`Unknown timezone: ${timezone}`);
  }
}
