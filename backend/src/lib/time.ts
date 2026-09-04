/**
 * Loan periods are counted in calendar days in the branch's own timezone: an
 * item lent at 11pm on a 7-day loan is due at the end of the 7th day, not at
 * 11pm. All helpers below work off Intl so no timezone database dependency is
 * bundled into the Lambda.
 */

/** Offset of `tz` from UTC, in ms, at the given instant (DST aware). */
export function timezoneOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts: Record<string, string> = {};
  for (const part of dtf.formatToParts(date)) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - date.getTime();
}

/** Calendar date in `tz` for an instant, as "YYYY-MM-DD". */
export function zonedDateKey(date: Date, timeZone: string): string {
  const shifted = new Date(date.getTime() + timezoneOffsetMs(date, timeZone));
  return shifted.toISOString().slice(0, 10);
}

/** The instant matching a wall-clock time in `tz`. */
export function fromZonedParts(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute, second);
  // Two passes converge even when the first guess lands on a DST boundary.
  let instant = naive - timezoneOffsetMs(new Date(naive), timeZone);
  instant = naive - timezoneOffsetMs(new Date(instant), timeZone);
  return new Date(instant);
}

/** End of the Nth day from `from`, in `tz`. `days: 0` means end of today. */
export function endOfDayAfter(from: Date, days: number, timeZone: string): Date {
  const [year, month, day] = zonedDateKey(from, timeZone).split('-').map(Number);
  const rolled = new Date(Date.UTC(year!, month! - 1, day! + days));
  return fromZonedParts(
    timeZone,
    rolled.getUTCFullYear(),
    rolled.getUTCMonth() + 1,
    rolled.getUTCDate(),
    23,
    59,
    59,
  );
}

export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Whole calendar days between two instants as seen in `tz`. Unlike a raw
 * millisecond division this returns 1 for "11pm today -> 1am tomorrow", which
 * is what "due tomorrow" has to mean to a person holding the book.
 */
export function calendarDaysBetween(from: Date, to: Date, timeZone: string): number {
  const startOfDay = (d: Date) => {
    const [year, month, day] = zonedDateKey(d, timeZone).split('-').map(Number);
    return fromZonedParts(timeZone, year!, month!, day!).getTime();
  };
  return Math.round((startOfDay(to) - startOfDay(from)) / 86_400_000);
}

/** Friendly relative wording used in dashboards and reminder messages. */
export function describeDue(dueAt: string, now: Date, timeZone: string): string {
  const diff = calendarDaysBetween(now, new Date(dueAt), timeZone);
  if (diff === 0) return 'due today';
  if (diff === 1) return 'due tomorrow';
  if (diff > 1) return `due in ${diff} days`;
  if (diff === -1) return 'overdue by 1 day';
  return `overdue by ${Math.abs(diff)} days`;
}
