import { describe, expect, it } from 'vitest';
import { buildReport, buildSummary } from '../src/domain/analytics.js';
import { makeAsset, makeCheckout, makeMember, makeOrg } from './factories.js';

const now = new Date('2026-03-10T09:00:00.000Z');
const org = makeOrg();

const assets = [
  makeAsset({ assetId: 'a1', title: 'Sapiens', timesBorrowed: 9, status: 'checked_out' }),
  makeAsset({ assetId: 'a2', title: 'Clean Code', timesBorrowed: 4, status: 'checked_out' }),
  makeAsset({ assetId: 'a3', title: 'Drill', category: 'tool', timesBorrowed: 2 }),
  makeAsset({ assetId: 'a4', title: 'Projector', category: 'equipment', timesBorrowed: 0 }),
  makeAsset({
    assetId: 'a5',
    title: 'Camera',
    category: 'equipment',
    status: 'lost',
    replacementCost: 38000,
    timesBorrowed: 3,
  }),
];

const members = [
  makeMember({ memberId: 'm1', name: 'Ananya', openLoans: 1, totalLoans: 12 }),
  makeMember({ memberId: 'm2', name: 'Rohit', openLoans: 1, totalLoans: 5 }),
  makeMember({ memberId: 'm3', name: 'Meera', status: 'suspended', totalLoans: 0 }),
];

const openLoans = [
  makeCheckout({ checkoutId: 'c1', assetId: 'a1', memberId: 'm1', dueAt: '2026-03-10T18:29:59Z' }),
  makeCheckout({ checkoutId: 'c2', assetId: 'a2', memberId: 'm2', dueAt: '2026-01-20T18:29:59Z' }),
];

describe('buildSummary', () => {
  const summary = buildSummary(org, assets, members, openLoans, openLoans, now);

  it('counts the catalogue by status and derives utilisation', () => {
    expect(summary.assets).toMatchObject({ total: 5, available: 2, checkedOut: 2, lost: 1 });
    expect(summary.assets.utilisationPct).toBe(40);
  });

  it('separates due-today from overdue', () => {
    expect(summary.loans.dueToday).toBe(1);
    expect(summary.loans.overdue).toBe(1);
  });

  it('values long-overdue items alongside declared losses as money at risk', () => {
    expect(summary.shrinkage.longOverdue).toBe(1);
    expect(summary.shrinkage.lostAssets).toBe(1);
    expect(summary.shrinkage.valueAtRisk).toBe(38000);
  });

  it('reports member standing', () => {
    expect(summary.members).toMatchObject({ total: 3, active: 2, suspended: 1 });
  });

  it('handles an empty branch without dividing by zero', () => {
    const empty = buildSummary(org, [], [], [], [], now);
    expect(empty.assets.utilisationPct).toBe(0);
    expect(empty.loans.open).toBe(0);
  });
});

describe('buildReport', () => {
  const report = buildReport(org, assets, members, openLoans, openLoans, now);

  it('ranks the most borrowed items', () => {
    expect(report.mostBorrowed.map((a) => a.title)).toEqual([
      'Sapiens',
      'Clean Code',
      'Camera',
      'Drill',
    ]);
  });

  it('ranks borrowers by lifetime loans', () => {
    expect(report.topBorrowers[0]).toMatchObject({ name: 'Ananya', totalLoans: 12 });
  });

  it('groups the catalogue by category', () => {
    expect(report.categories.find((c) => c.category === 'equipment')).toEqual({
      category: 'equipment',
      total: 2,
      checkedOut: 0,
    });
  });

  it('surfaces stock that has never circulated', () => {
    expect(report.neverBorrowed.map((a) => a.title)).toEqual(['Projector']);
  });

  it('zero-fills a full 30 day activity window', () => {
    expect(report.activityByDay).toHaveLength(30);
    expect(report.activityByDay.at(-1)?.date).toBe('2026-03-10');
    expect(report.activityByDay.every((d) => typeof d.checkouts === 'number')).toBe(true);
  });
});
