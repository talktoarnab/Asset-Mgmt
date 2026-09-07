export function formatDate(iso, timeZone) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}

function dayKey(date, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function daysUntil(iso, timeZone, now = new Date()) {
  const target = Date.parse(`${dayKey(new Date(iso), timeZone)}T00:00:00Z`);
  const today = Date.parse(`${dayKey(now, timeZone)}T00:00:00Z`);
  return Math.round((target - today) / 86_400_000);
}

export function dueLabel(dueAt, timeZone, now = new Date()) {
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

export function formatPhone(e164) {
  const digits = String(e164 ?? '').replace(/\D/g, '');
  if (!digits) return '—';
  if (digits.length <= 10) return `+${digits}`;
  const cc = digits.slice(0, digits.length - 10);
  const rest = digits.slice(-10);
  return `+${cc} ${rest.slice(0, 5)} ${rest.slice(5)}`;
}

export function initials(name) {
  const parts = String(name ?? '')
    .trim()
    .split(/\s+/)
    .slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('') || '?';
}

export function currency(amount) {
  if (amount === undefined || amount === null || amount === '') return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(amount));
}

export function titleCase(value) {
  return String(value ?? '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export const STATUS_TONE = {
  available: 'positive',
  checked_out: 'info',
  lost: 'danger',
  maintenance: 'warning',
  retired: 'neutral',
  active: 'positive',
  suspended: 'danger',
  open: 'info',
  returned: 'positive',
};

export const TIER_LIMITS = {
  basic: 2,
  standard: 3,
  premium: 6,
  staff: 10,
};
