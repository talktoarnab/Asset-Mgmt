import { z } from 'zod';
import { isValidTimeZone } from '../lib/time.js';

const trimmed = (max: number) => z.string().trim().min(1).max(max);

export const memberCreateSchema = z.object({
  name: trimmed(120),
  phone: trimmed(24),
  email: z.string().trim().email().max(160).optional().or(z.literal('')),
  tier: z.enum(['basic', 'standard', 'premium', 'staff']).optional(),
  borrowLimit: z.number().int().min(0).max(100).optional(),
  status: z.enum(['active', 'suspended']).optional(),
  whatsappOptIn: z.boolean().optional(),
  membershipExpiresAt: z.string().datetime().optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const memberUpdateSchema = memberCreateSchema.partial();

export const assetCreateSchema = z.object({
  title: trimmed(200),
  category: z.string().trim().min(1).max(40).optional(),
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{3,32}$/, 'Use letters, numbers and dashes only')
    .optional(),
  creator: z.string().trim().max(160).optional(),
  identifier: z.string().trim().max(80).optional(),
  location: z.string().trim().max(80).optional(),
  condition: z.string().trim().max(40).optional(),
  replacementCost: z.number().min(0).max(10_000_000).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  status: z.enum(['available', 'lost', 'maintenance', 'retired']).optional(),
});

export const assetUpdateSchema = assetCreateSchema.partial();

/** Bulk intake: cataloguing a donated box of books one row at a time is the
 *  single most tedious task for a new branch. */
export const assetBulkSchema = z.object({
  assets: z.array(assetCreateSchema).min(1).max(100),
});

export const checkoutCreateSchema = z.object({
  assetRef: trimmed(300),
  memberId: trimmed(64),
  loanDays: z.number().int().min(1).max(365).optional(),
  notes: z.string().trim().max(500).optional(),
  sendReceipt: z.boolean().optional(),
});

export const checkinSchema = z.object({
  condition: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(500).optional(),
  sendReceipt: z.boolean().optional(),
});

export const checkinByRefSchema = checkinSchema.extend({
  assetRef: trimmed(300),
});

export const scanSchema = z.object({
  ref: trimmed(300),
  memberId: z.string().trim().max(64).optional(),
});

export const settingsSchema = z.object({
  name: trimmed(120).optional(),
  timezone: z
    .string()
    .trim()
    .refine(isValidTimeZone, 'Not a recognised timezone')
    .optional(),
  defaultCountryCode: z
    .string()
    .trim()
    .regex(/^\+\d{1,4}$/, 'Use a form like +91')
    .optional(),
  defaultLoanDays: z.number().int().min(1).max(365).optional(),
  maxRenewals: z.number().int().min(0).max(20).optional(),
  renewalDays: z.number().int().min(1).max(365).optional(),
  reminderChannel: z.enum(['whatsapp', 'sms', 'auto']).optional(),
  dueSoonLeadDays: z.number().int().min(0).max(30).optional(),
  overdueReminderIntervalDays: z.number().int().min(1).max(60).optional(),
  maxOverdueReminders: z.number().int().min(0).max(20).optional(),
  contactPhone: z.string().trim().max(24).optional(),
});

export const loginSchema = z.object({
  pin: z.string().trim().min(4).max(32),
});
