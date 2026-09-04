import { describe, expect, it } from 'vitest';
import {
  canRenew,
  computeDueAt,
  evaluateEligibility,
  isOverdue,
  selectReminders,
} from '../src/domain/rules.js';
import { makeAsset, makeCheckout, makeMember, makeOrg } from './factories.js';

const now = new Date('2026-03-10T09:00:00.000Z');

describe('evaluateEligibility', () => {
  it('allows an active member within their limit to borrow an available asset', () => {
    const blockers = evaluateEligibility({
      org: makeOrg(),
      member: makeMember({ openLoans: 1 }),
      asset: makeAsset(),
      now,
    });
    expect(blockers).toEqual([]);
  });

  it('blocks a member who has reached the borrow limit for their tier', () => {
    const blockers = evaluateEligibility({
      org: makeOrg(),
      member: makeMember({ tier: 'standard', openLoans: 3 }),
      asset: makeAsset(),
      now,
    });
    expect(blockers.map((b) => b.code)).toContain('BORROW_LIMIT_REACHED');
    expect(blockers[0]?.message).toContain('3 of 3');
  });

  it('honours a per-member override of the tier limit', () => {
    const blockers = evaluateEligibility({
      org: makeOrg(),
      member: makeMember({ tier: 'basic', borrowLimit: 5, openLoans: 4 }),
      asset: makeAsset(),
      now,
    });
    expect(blockers).toEqual([]);
  });

  it('names the current holder when the asset is already out', () => {
    const blockers = evaluateEligibility({
      org: makeOrg(),
      member: makeMember(),
      asset: makeAsset({ status: 'checked_out', activeMemberName: 'Rohit Verma' }),
      now,
    });
    expect(blockers[0]?.code).toBe('ASSET_UNAVAILABLE');
    expect(blockers[0]?.message).toContain('Rohit Verma');
  });

  it('reports every problem at once rather than the first one', () => {
    const blockers = evaluateEligibility({
      org: makeOrg(),
      member: makeMember({
        status: 'suspended',
        openLoans: 9,
        membershipExpiresAt: '2026-01-01T00:00:00.000Z',
      }),
      asset: makeAsset({ status: 'maintenance' }),
      now,
    });
    expect(blockers.map((b) => b.code).sort()).toEqual([
      'ASSET_UNAVAILABLE',
      'BORROW_LIMIT_REACHED',
      'MEMBERSHIP_EXPIRED',
      'MEMBER_SUSPENDED',
    ]);
  });
});

describe('computeDueAt', () => {
  it('lands on the end of the Nth day in the branch timezone', () => {
    // 09:00 UTC on 10 Mar is 14:30 IST; a 3 day loan is due end of 13 Mar IST,
    // which is 18:29:59 UTC.
    const due = computeDueAt(now, 3, 'Asia/Kolkata');
    expect(due).toBe('2026-03-13T18:29:59.000Z');
  });

  it('does not shorten a loan taken out late in the local evening', () => {
    const lateEvening = new Date('2026-03-10T18:00:00.000Z'); // 23:30 IST
    const due = computeDueAt(lateEvening, 1, 'Asia/Kolkata');
    expect(due).toBe('2026-03-11T18:29:59.000Z');
  });

  it('handles a timezone that observes daylight saving', () => {
    const due = computeDueAt(new Date('2026-03-06T12:00:00.000Z'), 10, 'America/New_York');
    expect(due.startsWith('2026-03-17')).toBe(true);
  });
});

describe('isOverdue', () => {
  it('is false on the due day itself', () => {
    expect(isOverdue(makeCheckout({ dueAt: '2026-03-10T18:29:59.000Z' }), now)).toBe(false);
  });

  it('is false for a loan that has already been returned', () => {
    expect(
      isOverdue(makeCheckout({ status: 'returned', dueAt: '2026-01-01T00:00:00.000Z' }), now),
    ).toBe(false);
  });

  it('is true once the due instant has passed', () => {
    expect(isOverdue(makeCheckout({ dueAt: '2026-03-09T18:29:59.000Z' }), now)).toBe(true);
  });
});

describe('selectReminders', () => {
  const org = makeOrg({ dueSoonLeadDays: 1, overdueReminderIntervalDays: 3, maxOverdueReminders: 4 });

  it('nudges once for an item due tomorrow', () => {
    const checkout = makeCheckout({ dueAt: '2026-03-11T18:29:59.000Z' });
    expect(selectReminders([checkout], org, now)).toEqual([
      { checkout, kind: 'due_soon', daysOverdue: 0 },
    ]);
  });

  it('does not repeat the pre-due nudge', () => {
    const checkout = makeCheckout({
      dueAt: '2026-03-11T18:29:59.000Z',
      dueSoonSentAt: '2026-03-09T14:00:00.000Z',
    });
    expect(selectReminders([checkout], org, now)).toEqual([]);
  });

  it('stays quiet for an item that is not due for a while', () => {
    expect(selectReminders([makeCheckout({ dueAt: '2026-03-20T18:29:59.000Z' })], org, now))
      .toEqual([]);
  });

  it('flags overdue items with the number of days late', () => {
    const checkout = makeCheckout({ dueAt: '2026-03-04T18:29:59.000Z' });
    const [decision] = selectReminders([checkout], org, now);
    expect(decision?.kind).toBe('overdue');
    expect(decision?.daysOverdue).toBe(6);
  });

  it('respects the minimum gap between overdue nudges', () => {
    const checkout = makeCheckout({
      dueAt: '2026-03-01T18:29:59.000Z',
      lastReminderAt: '2026-03-09T09:00:00.000Z',
      remindersSent: 1,
    });
    expect(selectReminders([checkout], org, now)).toEqual([]);
  });

  it('sends again once the gap has elapsed', () => {
    const checkout = makeCheckout({
      dueAt: '2026-03-01T18:29:59.000Z',
      lastReminderAt: '2026-03-06T09:00:00.000Z',
      remindersSent: 1,
    });
    expect(selectReminders([checkout], org, now)).toHaveLength(1);
  });

  it('gives up after the cap so members are not harassed indefinitely', () => {
    const checkout = makeCheckout({
      dueAt: '2026-01-01T18:29:59.000Z',
      lastReminderAt: '2026-02-01T09:00:00.000Z',
      remindersSent: 4,
    });
    expect(selectReminders([checkout], org, now)).toEqual([]);
  });

  it('ignores loans that are no longer open', () => {
    const closed = makeCheckout({ status: 'returned', dueAt: '2026-01-01T18:29:59.000Z' });
    expect(selectReminders([closed], org, now)).toEqual([]);
  });
});

describe('canRenew', () => {
  it('permits a renewal below the branch limit', () => {
    expect(canRenew(makeCheckout({ renewals: 1 }), makeOrg({ maxRenewals: 2 }))).toBeUndefined();
  });

  it('refuses once the renewal limit is reached', () => {
    expect(canRenew(makeCheckout({ renewals: 2 }), makeOrg({ maxRenewals: 2 }))?.code).toBe(
      'RENEWAL_LIMIT',
    );
  });

  it('refuses to renew a closed loan', () => {
    expect(canRenew(makeCheckout({ status: 'returned' }), makeOrg())?.code).toBe('NOT_OPEN');
  });
});
