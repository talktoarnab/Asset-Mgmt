import { calendarDaysBetween, zonedDateKey } from '../lib/time.js';
import type { Asset, Checkout, Member, Org } from './types.js';

export interface DashboardSummary {
  generatedAt: string;
  assets: {
    total: number;
    available: number;
    checkedOut: number;
    lost: number;
    maintenance: number;
    utilisationPct: number;
  };
  members: { total: number; active: number; suspended: number; atLimit: number };
  loans: {
    open: number;
    overdue: number;
    dueToday: number;
    dueSoon: number;
    returnedLast30Days: number;
    checkoutsLast30Days: number;
  };
  shrinkage: { lostAssets: number; valueAtRisk: number; longOverdue: number };
}

export interface AnalyticsReport extends DashboardSummary {
  mostBorrowed: Array<{ assetId: string; title: string; code: string; timesBorrowed: number }>;
  topBorrowers: Array<{ memberId: string; name: string; totalLoans: number; openLoans: number }>;
  categories: Array<{ category: string; total: number; checkedOut: number }>;
  activityByDay: Array<{ date: string; checkouts: number; returns: number }>;
  neverBorrowed: Array<{ assetId: string; title: string; code: string }>;
}

/** An item this far past due is treated as probable shrinkage, not a late return. */
const LONG_OVERDUE_DAYS = 30;

export function buildSummary(
  org: Org,
  assets: Asset[],
  members: Member[],
  openLoans: Checkout[],
  recentCheckouts: Checkout[],
  now = new Date(),
): DashboardSummary {
  const byStatus = (status: string) => assets.filter((a) => a.status === status).length;
  const total = assets.length;
  const checkedOut = byStatus('checked_out');

  let overdue = 0;
  let dueToday = 0;
  let dueSoon = 0;
  let longOverdue = 0;
  let valueAtRisk = 0;
  const assetById = new Map(assets.map((a) => [a.assetId, a]));

  for (const loan of openLoans) {
    const days = calendarDaysBetween(now, new Date(loan.dueAt), org.timezone);
    if (new Date(loan.dueAt) < now) {
      overdue += 1;
      if (Math.abs(days) >= LONG_OVERDUE_DAYS) {
        longOverdue += 1;
        valueAtRisk += assetById.get(loan.assetId)?.replacementCost ?? 0;
      }
    } else if (days === 0) {
      dueToday += 1;
    } else if (days <= 3) {
      dueSoon += 1;
    }
  }

  const lostAssets = assets.filter((a) => a.status === 'lost');
  valueAtRisk += lostAssets.reduce((sum, a) => sum + (a.replacementCost ?? 0), 0);

  const cutoff = new Date(now.getTime() - 30 * 86_400_000);
  const inWindow = recentCheckouts.filter((c) => new Date(c.checkedOutAt) >= cutoff);

  return {
    generatedAt: now.toISOString(),
    assets: {
      total,
      available: byStatus('available'),
      checkedOut,
      lost: lostAssets.length,
      maintenance: byStatus('maintenance'),
      utilisationPct: total === 0 ? 0 : Math.round((checkedOut / total) * 100),
    },
    members: {
      total: members.length,
      active: members.filter((m) => m.status === 'active').length,
      suspended: members.filter((m) => m.status === 'suspended').length,
      atLimit: members.filter((m) => m.openLoans > 0 && m.openLoans >= (m.borrowLimit ?? 99))
        .length,
    },
    loans: {
      open: openLoans.length,
      overdue,
      dueToday,
      dueSoon,
      returnedLast30Days: recentCheckouts.filter(
        (c) => c.returnedAt && new Date(c.returnedAt) >= cutoff && c.status === 'returned',
      ).length,
      checkoutsLast30Days: inWindow.length,
    },
    shrinkage: { lostAssets: lostAssets.length, valueAtRisk, longOverdue },
  };
}

export function buildReport(
  org: Org,
  assets: Asset[],
  members: Member[],
  openLoans: Checkout[],
  recentCheckouts: Checkout[],
  now = new Date(),
): AnalyticsReport {
  const summary = buildSummary(org, assets, members, openLoans, recentCheckouts, now);

  const mostBorrowed = [...assets]
    .filter((a) => a.timesBorrowed > 0)
    .sort((a, b) => b.timesBorrowed - a.timesBorrowed)
    .slice(0, 10)
    .map((a) => ({
      assetId: a.assetId,
      title: a.title,
      code: a.code,
      timesBorrowed: a.timesBorrowed,
    }));

  const topBorrowers = [...members]
    .filter((m) => m.totalLoans > 0)
    .sort((a, b) => b.totalLoans - a.totalLoans)
    .slice(0, 10)
    .map((m) => ({
      memberId: m.memberId,
      name: m.name,
      totalLoans: m.totalLoans,
      openLoans: m.openLoans,
    }));

  const categoryMap = new Map<string, { total: number; checkedOut: number }>();
  for (const asset of assets) {
    const entry = categoryMap.get(asset.category) ?? { total: 0, checkedOut: 0 };
    entry.total += 1;
    if (asset.status === 'checked_out') entry.checkedOut += 1;
    categoryMap.set(asset.category, entry);
  }

  // Fixed 30-day window with zero-filled days so the chart never implies a
  // quiet day was a missing day.
  const activity = new Map<string, { checkouts: number; returns: number }>();
  for (let i = 29; i >= 0; i -= 1) {
    activity.set(zonedDateKey(new Date(now.getTime() - i * 86_400_000), org.timezone), {
      checkouts: 0,
      returns: 0,
    });
  }
  for (const checkout of recentCheckouts) {
    const outDay = zonedDateKey(new Date(checkout.checkedOutAt), org.timezone);
    const outEntry = activity.get(outDay);
    if (outEntry) outEntry.checkouts += 1;
    if (checkout.returnedAt) {
      const inDay = zonedDateKey(new Date(checkout.returnedAt), org.timezone);
      const inEntry = activity.get(inDay);
      if (inEntry) inEntry.returns += 1;
    }
  }

  return {
    ...summary,
    mostBorrowed,
    topBorrowers,
    categories: [...categoryMap.entries()]
      .map(([category, value]) => ({ category, ...value }))
      .sort((a, b) => b.total - a.total),
    activityByDay: [...activity.entries()].map(([date, value]) => ({ date, ...value })),
    neverBorrowed: assets
      .filter((a) => a.timesBorrowed === 0)
      .slice(0, 25)
      .map((a) => ({ assetId: a.assetId, title: a.title, code: a.code })),
  };
}
