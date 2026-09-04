import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { docClient, queryAll, TABLE, toEntity } from '../lib/ddb.js';
import { conflict, notFound } from '../lib/errors.js';
import { newId } from '../lib/ids.js';
import { normalizePhone } from '../lib/phone.js';
import { GSI2, phoneLookupPk, PK, PREFIX, SK } from './keys.js';
import type { Member, MemberStatus, MemberTier } from './types.js';

export interface MemberInput {
  name: string;
  phone: string;
  email?: string;
  tier?: MemberTier;
  borrowLimit?: number;
  status?: MemberStatus;
  whatsappOptIn?: boolean;
  membershipExpiresAt?: string;
  notes?: string;
}

function toItem(member: Member) {
  return {
    PK: PK(member.orgId),
    SK: SK.member(member.memberId),
    entityType: 'Member',
    gsi2pk: phoneLookupPk(member.orgId, member.phone),
    gsi2sk: `MEMBER#${member.memberId}`,
    ...member,
  };
}

export async function listMembers(orgId: string): Promise<Member[]> {
  const items = await queryAll<Member>({
    TableName: TABLE(),
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: { ':pk': PK(orgId), ':sk': PREFIX.member },
  });
  return items.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getMember(orgId: string, memberId: string): Promise<Member> {
  const result = await docClient().send(
    new GetCommand({ TableName: TABLE(), Key: { PK: PK(orgId), SK: SK.member(memberId) } }),
  );
  if (!result.Item) throw notFound('Member not found');
  return toEntity<Member>(result.Item);
}

export async function findMemberByPhone(orgId: string, phone: string): Promise<Member | undefined> {
  const items = await queryAll<Member>({
    TableName: TABLE(),
    IndexName: GSI2,
    KeyConditionExpression: 'gsi2pk = :pk',
    ExpressionAttributeValues: { ':pk': phoneLookupPk(orgId, phone) },
  });
  return items[0];
}

export async function createMember(
  orgId: string,
  input: MemberInput,
  defaultCountryCode: string,
): Promise<Member> {
  const phone = normalizePhone(input.phone, defaultCountryCode);
  const existing = await findMemberByPhone(orgId, phone);
  if (existing) {
    throw conflict(
      'DUPLICATE_PHONE',
      `${existing.name} is already registered with ${phone}.`,
      { memberId: existing.memberId },
    );
  }

  const now = new Date().toISOString();
  const member: Member = {
    orgId,
    memberId: newId(),
    name: input.name.trim(),
    phone,
    email: input.email?.trim() || undefined,
    tier: input.tier ?? 'standard',
    borrowLimit: input.borrowLimit,
    status: input.status ?? 'active',
    whatsappOptIn: input.whatsappOptIn ?? true,
    membershipExpiresAt: input.membershipExpiresAt,
    notes: input.notes,
    openLoans: 0,
    totalLoans: 0,
    createdAt: now,
    updatedAt: now,
  };

  await docClient().send(
    new PutCommand({
      TableName: TABLE(),
      Item: toItem(member),
      ConditionExpression: 'attribute_not_exists(SK)',
    }),
  );
  return member;
}

export async function updateMember(
  orgId: string,
  memberId: string,
  patch: Partial<MemberInput>,
  defaultCountryCode: string,
): Promise<Member> {
  const current = await getMember(orgId, memberId);
  const phone = patch.phone ? normalizePhone(patch.phone, defaultCountryCode) : current.phone;

  if (phone !== current.phone) {
    const clash = await findMemberByPhone(orgId, phone);
    if (clash && clash.memberId !== memberId) {
      throw conflict('DUPLICATE_PHONE', `${clash.name} already uses ${phone}.`);
    }
  }

  const next: Member = {
    ...current,
    ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
    phone,
    orgId,
    memberId,
    openLoans: current.openLoans,
    totalLoans: current.totalLoans,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
  } as Member;

  await docClient().send(new PutCommand({ TableName: TABLE(), Item: toItem(next) }));
  return next;
}

export async function deleteMember(orgId: string, memberId: string): Promise<void> {
  const member = await getMember(orgId, memberId);
  if (member.openLoans > 0) {
    throw conflict(
      'MEMBER_HAS_LOANS',
      `${member.name} still has ${member.openLoans} item(s) checked out. Check them in first.`,
    );
  }
  await docClient().send(
    new DeleteCommand({ TableName: TABLE(), Key: { PK: PK(orgId), SK: SK.member(memberId) } }),
  );
}

/**
 * Repairs the denormalised counter if it ever drifts from reality (for example
 * after a manual console edit). Called by the reconcile endpoint.
 */
export async function setOpenLoanCount(
  orgId: string,
  memberId: string,
  openLoans: number,
): Promise<void> {
  await docClient().send(
    new UpdateCommand({
      TableName: TABLE(),
      Key: { PK: PK(orgId), SK: SK.member(memberId) },
      UpdateExpression: 'SET openLoans = :n, updatedAt = :now',
      ExpressionAttributeValues: { ':n': openLoans, ':now': new Date().toISOString() },
      ConditionExpression: 'attribute_exists(SK)',
    }),
  );
}
