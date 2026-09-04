export type MemberTier = 'basic' | 'standard' | 'premium' | 'staff';
export type MemberStatus = 'active' | 'suspended';
export type AssetStatus = 'available' | 'checked_out' | 'lost' | 'maintenance' | 'retired';
export type CheckoutStatus = 'open' | 'returned' | 'lost';

export const TIER_BORROW_LIMITS: Record<MemberTier, number> = {
  basic: 2,
  standard: 3,
  premium: 6,
  staff: 10,
};

export interface Org {
  orgId: string;
  name: string;
  timezone: string;
  defaultCountryCode: string;
  defaultLoanDays: number;
  maxRenewals: number;
  renewalDays: number;
  reminderChannel: 'whatsapp' | 'sms' | 'auto';
  dueSoonLeadDays: number;
  overdueReminderIntervalDays: number;
  maxOverdueReminders: number;
  contactPhone?: string;
}

export interface Member {
  memberId: string;
  name: string;
  phone: string;
  email?: string;
  tier: MemberTier;
  borrowLimit?: number;
  status: MemberStatus;
  whatsappOptIn: boolean;
  membershipExpiresAt?: string;
  notes?: string;
  openLoans: number;
  totalLoans: number;
  createdAt: string;
}

export interface Asset {
  assetId: string;
  code: string;
  title: string;
  category: string;
  creator?: string;
  identifier?: string;
  location?: string;
  condition?: string;
  replacementCost?: number;
  tags?: string[];
  status: AssetStatus;
  activeCheckoutId?: string;
  activeMemberId?: string;
  activeMemberName?: string;
  dueAt?: string;
  timesBorrowed: number;
  createdAt: string;
}

export interface Checkout {
  checkoutId: string;
  assetId: string;
  assetCode: string;
  assetTitle: string;
  memberId: string;
  memberName: string;
  memberPhone: string;
  status: CheckoutStatus;
  loanDays: number;
  checkedOutAt: string;
  dueAt: string;
  returnedAt?: string;
  renewals: number;
  checkedOutBy: string;
  notes?: string;
  remindersSent: number;
  lastReminderAt?: string;
}

export interface NotificationLog {
  notificationId: string;
  memberId: string;
  checkoutId?: string;
  channel: 'whatsapp' | 'sms';
  to: string;
  template: string;
  body: string;
  status: 'sent' | 'failed' | 'skipped';
  error?: string;
  createdAt: string;
}

export interface Blocker {
  code: string;
  message: string;
}

export interface ScanResult {
  asset: Asset;
  activeCheckout?: Checkout;
  member?: Member;
  blockers: Blocker[];
  suggestedAction: 'checkout' | 'checkin';
}

export interface Summary {
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

export interface Report extends Summary {
  mostBorrowed: Array<{ assetId: string; title: string; code: string; timesBorrowed: number }>;
  topBorrowers: Array<{ memberId: string; name: string; totalLoans: number; openLoans: number }>;
  categories: Array<{ category: string; total: number; checkedOut: number }>;
  activityByDay: Array<{ date: string; checkouts: number; returns: number }>;
  neverBorrowed: Array<{ assetId: string; title: string; code: string }>;
}

export interface Me {
  user: { orgId: string; userId: string; email: string; name: string; roles: string[] };
  org: Org;
}
