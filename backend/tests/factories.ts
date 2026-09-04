import { ORG_DEFAULTS } from '../src/domain/orgs.js';
import type { Asset, Checkout, Member, Org } from '../src/domain/types.js';

export function makeOrg(overrides: Partial<Org> = {}): Org {
  return {
    orgId: 'org-test',
    name: 'Test Branch',
    ...ORG_DEFAULTS,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function makeMember(overrides: Partial<Member> = {}): Member {
  return {
    orgId: 'org-test',
    memberId: 'mem-1',
    name: 'Ananya Sharma',
    phone: '+919876543210',
    tier: 'standard',
    status: 'active',
    whatsappOptIn: true,
    openLoans: 0,
    totalLoans: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    orgId: 'org-test',
    assetId: 'ast-1',
    code: 'BK-ABC123',
    title: 'Sapiens',
    category: 'book',
    status: 'available',
    timesBorrowed: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function makeCheckout(overrides: Partial<Checkout> = {}): Checkout {
  return {
    orgId: 'org-test',
    checkoutId: 'chk-1',
    assetId: 'ast-1',
    assetCode: 'BK-ABC123',
    assetTitle: 'Sapiens',
    memberId: 'mem-1',
    memberName: 'Ananya Sharma',
    memberPhone: '+919876543210',
    status: 'open',
    loanDays: 14,
    checkedOutAt: '2026-03-01T10:00:00.000Z',
    dueAt: '2026-03-15T18:29:59.000Z',
    renewals: 0,
    checkedOutBy: 'desk@branch.org',
    remindersSent: 0,
    ...overrides,
  };
}
