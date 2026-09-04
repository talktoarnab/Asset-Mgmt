import { calendarDaysBetween, endOfDayAfter } from '../lib/time.js';
import { borrowLimitFor, type Asset, type Checkout, type Member, type Org } from './types.js';

export interface Blocker {
  code: string;
  message: string;
}

export interface EligibilityInput {
  org: Org;
  member: Member;
  asset: Asset;
  now: Date;
}

/**
 * All checkout preconditions in one pure function so the desk staff see every
 * problem at once ("membership expired AND at limit") instead of discovering
 * them one failed scan at a time.
 */
export function evaluateEligibility({ org, member, asset, now }: EligibilityInput): Blocker[] {
  const blockers: Blocker[] = [];

  if (member.status === 'suspended') {
    blockers.push({
      code: 'MEMBER_SUSPENDED',
      message: `${member.name}'s membership is suspended.`,
    });
  }

  if (member.membershipExpiresAt && new Date(member.membershipExpiresAt) < now) {
    blockers.push({
      code: 'MEMBERSHIP_EXPIRED',
      message: `${member.name}'s membership expired on ${member.membershipExpiresAt.slice(0, 10)}.`,
    });
  }

  const limit = borrowLimitFor(member);
  if (member.openLoans >= limit) {
    blockers.push({
      code: 'BORROW_LIMIT_REACHED',
      message: `${member.name} already has ${member.openLoans} of ${limit} items out.`,
    });
  }

  if (asset.status === 'checked_out') {
    blockers.push({
      code: 'ASSET_UNAVAILABLE',
      message: `"${asset.title}" is already checked out${
        asset.activeMemberName ? ` to ${asset.activeMemberName}` : ''
      }.`,
    });
  } else if (asset.status !== 'available') {
    blockers.push({
      code: 'ASSET_UNAVAILABLE',
      message: `"${asset.title}" is marked ${asset.status.replace('_', ' ')}.`,
    });
  }

  void org;
  return blockers;
}

export function computeDueAt(now: Date, loanDays: number, timeZone: string): string {
  return endOfDayAfter(now, loanDays, timeZone).toISOString();
}

export function isOverdue(checkout: Pick<Checkout, 'dueAt' | 'status'>, now: Date): boolean {
  return checkout.status === 'open' && new Date(checkout.dueAt) < now;
}

export type ReminderKind = 'due_soon' | 'overdue';

export interface ReminderDecision {
  checkout: Checkout;
  kind: ReminderKind;
  daysOverdue: number;
}

/**
 * Decides which open loans deserve a message tonight. The rules exist to keep
 * the tool from becoming spam: one nudge before the due date, then overdue
 * nudges no more often than the branch's interval and capped in total.
 */
export function selectReminders(
  checkouts: Checkout[],
  org: Org,
  now: Date,
): ReminderDecision[] {
  const decisions: ReminderDecision[] = [];

  for (const checkout of checkouts) {
    if (checkout.status !== 'open') continue;

    const daysUntilDue = calendarDaysBetween(now, new Date(checkout.dueAt), org.timezone);

    if (new Date(checkout.dueAt) < now) {
      if (checkout.remindersSent >= org.maxOverdueReminders) continue;
      if (checkout.lastReminderAt) {
        const sinceLast = calendarDaysBetween(new Date(checkout.lastReminderAt), now, org.timezone);
        if (sinceLast < org.overdueReminderIntervalDays) continue;
      }
      decisions.push({ checkout, kind: 'overdue', daysOverdue: Math.abs(daysUntilDue) });
      continue;
    }

    if (daysUntilDue <= org.dueSoonLeadDays && !checkout.dueSoonSentAt) {
      decisions.push({ checkout, kind: 'due_soon', daysOverdue: 0 });
    }
  }

  return decisions;
}

export function canRenew(checkout: Checkout, org: Org): Blocker | undefined {
  if (checkout.status !== 'open') {
    return { code: 'NOT_OPEN', message: 'Only an active loan can be renewed.' };
  }
  if (checkout.renewals >= org.maxRenewals) {
    return {
      code: 'RENEWAL_LIMIT',
      message: `This loan has already been renewed ${checkout.renewals} time(s), the branch limit.`,
    };
  }
  return undefined;
}
