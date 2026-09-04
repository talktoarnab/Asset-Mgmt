import { badRequest } from './errors.js';

/**
 * Members are identified operationally by phone number, so numbers are stored
 * in a single canonical E.164 form. Staff type them in whatever shape they were
 * given ("098765 43210", "+91 98765-43210"), and a branch default country code
 * fills in the rest.
 */
export function normalizePhone(input: string, defaultCountryCode = '+91'): string {
  const trimmed = input.trim();
  if (!trimmed) throw badRequest('Phone number is required');

  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 6) throw badRequest(`"${input}" is not a valid phone number`);

  if (hasPlus) return `+${digits}`;

  const cc = defaultCountryCode.replace(/\D/g, '');
  // Local formats often carry a trunk prefix (0) or the country code already.
  if (digits.startsWith(cc) && digits.length > cc.length + 5) return `+${digits}`;
  const local = digits.replace(/^0+/, '');
  return `+${cc}${local}`;
}

/** Display form: "+91 98765 43210". */
export function formatPhone(e164: string): string {
  const digits = e164.replace(/\D/g, '');
  if (digits.length <= 10) return `+${digits}`;
  const cc = digits.slice(0, digits.length - 10);
  const rest = digits.slice(-10);
  return `+${cc} ${rest.slice(0, 5)} ${rest.slice(5)}`;
}
