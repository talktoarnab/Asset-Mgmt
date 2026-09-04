export function formatDate(iso: string | undefined, timeZone: string): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}

export function formatDateTime(iso: string | undefined, timeZone: string): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

function dayKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Whole calendar days apart in the branch's timezone. */
export function daysUntil(iso: string, timeZone: string, now = new Date()): number {
  const target = Date.parse(`${dayKey(new Date(iso), timeZone)}T00:00:00Z`);
  const today = Date.parse(`${dayKey(now, timeZone)}T00:00:00Z`);
  return Math.round((target - today) / 86_400_000);
}

export type Tone = 'neutral' | 'positive' | 'warning' | 'danger' | 'info';

export interface DueLabel {
  text: string;
  tone: Tone;
  overdue: boolean;
  days: number;
}

/**
 * The single most-read piece of text in the product. Overdue reads as a count
 * of days late because that is what staff repeat on the phone.
 */
export function dueLabel(dueAt: string, timeZone: string, now = new Date()): DueLabel {
  const days = daysUntil(dueAt, timeZone, now);
  if (days < 0) {
    const late = Math.abs(days);
    return {
      text: `${late} day${late === 1 ? '' : 's'} overdue`,
      tone: 'danger',
      overdue: true,
      days,
    };
  }
  if (days === 0) return { text: 'Due today', tone: 'warning', overdue: false, days };
  if (days === 1) return { text: 'Due tomorrow', tone: 'warning', overdue: false, days };
  if (days <= 3) return { text: `Due in ${days} days`, tone: 'info', overdue: false, days };
  return { text: `Due in ${days} days`, tone: 'neutral', overdue: false, days };
}

export function formatPhone(e164: string): string {
  const digits = e164.replace(/\D/g, '');
  if (digits.length <= 10) return `+${digits}`;
  const cc = digits.slice(0, digits.length - 10);
  const rest = digits.slice(-10);
  return `+${cc} ${rest.slice(0, 5)} ${rest.slice(5)}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('') || '?';
}

export function currency(amount: number | undefined): string {
  if (amount === undefined) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export const STATUS_TONE: Record<string, Tone> = {
  available: 'positive',
  checked_out: 'info',
  lost: 'danger',
  maintenance: 'warning',
  retired: 'neutral',
  active: 'positive',
  suspended: 'danger',
  open: 'info',
  returned: 'positive',
  sent: 'positive',
  failed: 'danger',
  skipped: 'neutral',
};
