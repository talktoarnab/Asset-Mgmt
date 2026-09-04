export type MemberTier = 'basic' | 'standard' | 'premium' | 'staff';
export type MemberStatus = 'active' | 'suspended';
export type AssetStatus = 'available' | 'checked_out' | 'lost' | 'maintenance' | 'retired';
export type CheckoutStatus = 'open' | 'returned' | 'lost';
export type Channel = 'whatsapp' | 'sms';
export type ReminderChannel = Channel | 'auto';
export type NotificationStatus = 'sent' | 'failed' | 'skipped';
export type Role = 'admin' | 'staff';

/** Defaults applied when a member has no explicit borrow limit. */
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
  reminderChannel: ReminderChannel;
  /** Days before the due date that the first "due soon" nudge goes out. */
  dueSoonLeadDays: number;
  /** Minimum gap between successive overdue nudges for the same loan. */
  overdueReminderIntervalDays: number;
  maxOverdueReminders: number;
  contactPhone?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Member {
  orgId: string;
  memberId: string;
  name: string;
  phone: string;
  email?: string;
  tier: MemberTier;
  /** Explicit override; falls back to the tier limit when unset. */
  borrowLimit?: number;
  status: MemberStatus;
  whatsappOptIn: boolean;
  membershipExpiresAt?: string;
  notes?: string;
  openLoans: number;
  totalLoans: number;
  createdAt: string;
  updatedAt: string;
}

export interface Asset {
  orgId: string;
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
  updatedAt: string;
}

export interface Checkout {
  orgId: string;
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
  checkedInBy?: string;
  renewedBy?: string;
  notes?: string;
  dueSoonSentAt?: string;
  lastReminderAt?: string;
  remindersSent: number;
  markedLostAt?: string;
}

export interface NotificationLog {
  orgId: string;
  notificationId: string;
  memberId: string;
  checkoutId?: string;
  channel: Channel;
  to: string;
  template: string;
  body: string;
  status: NotificationStatus;
  providerMessageId?: string;
  error?: string;
  createdAt: string;
  /** Unix seconds; the table's TTL attribute prunes old logs automatically. */
  expiresAt: number;
}

export interface AuthContext {
  orgId: string;
  userId: string;
  email: string;
  name: string;
  roles: Role[];
}

export function borrowLimitFor(member: Pick<Member, 'tier' | 'borrowLimit'>): number {
  return member.borrowLimit ?? TIER_BORROW_LIMITS[member.tier] ?? 3;
}
