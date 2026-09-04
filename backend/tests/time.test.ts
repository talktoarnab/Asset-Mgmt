import { describe, expect, it } from 'vitest';
import {
  calendarDaysBetween,
  describeDue,
  endOfDayAfter,
  fromZonedParts,
  isValidTimeZone,
  timezoneOffsetMs,
  zonedDateKey,
} from '../src/lib/time.js';

describe('timezoneOffsetMs', () => {
  it('reports a fixed offset zone', () => {
    expect(timezoneOffsetMs(new Date('2026-03-10T00:00:00Z'), 'Asia/Kolkata')).toBe(
      5.5 * 3_600_000,
    );
  });

  it('tracks daylight saving transitions', () => {
    const winter = timezoneOffsetMs(new Date('2026-01-15T12:00:00Z'), 'America/New_York');
    const summer = timezoneOffsetMs(new Date('2026-07-15T12:00:00Z'), 'America/New_York');
    expect(winter).toBe(-5 * 3_600_000);
    expect(summer).toBe(-4 * 3_600_000);
  });
});

describe('zonedDateKey', () => {
  it('rolls to the next local day after the local midnight', () => {
    expect(zonedDateKey(new Date('2026-03-10T19:00:00Z'), 'Asia/Kolkata')).toBe('2026-03-11');
    expect(zonedDateKey(new Date('2026-03-10T18:00:00Z'), 'Asia/Kolkata')).toBe('2026-03-10');
  });
});

describe('fromZonedParts', () => {
  it('round-trips a wall-clock time back to the correct instant', () => {
    expect(fromZonedParts('Asia/Kolkata', 2026, 3, 11, 0, 0, 0).toISOString()).toBe(
      '2026-03-10T18:30:00.000Z',
    );
  });

  it('resolves a time on the spring-forward day', () => {
    const instant = fromZonedParts('America/New_York', 2026, 3, 8, 12, 0, 0);
    expect(instant.toISOString()).toBe('2026-03-08T16:00:00.000Z');
  });
});

describe('endOfDayAfter', () => {
  it('returns the last second of today for zero days', () => {
    expect(endOfDayAfter(new Date('2026-03-10T09:00:00Z'), 0, 'Asia/Kolkata').toISOString()).toBe(
      '2026-03-10T18:29:59.000Z',
    );
  });

  it('crosses month boundaries', () => {
    expect(endOfDayAfter(new Date('2026-03-28T09:00:00Z'), 5, 'Asia/Kolkata').toISOString()).toBe(
      '2026-04-02T18:29:59.000Z',
    );
  });
});

describe('calendarDaysBetween', () => {
  it('counts a night crossing as one day even when hours apart', () => {
    expect(
      calendarDaysBetween(
        new Date('2026-03-10T17:30:00Z'), // 23:00 IST
        new Date('2026-03-10T19:30:00Z'), // 01:00 IST next day
        'Asia/Kolkata',
      ),
    ).toBe(1);
  });

  it('is negative when the target is in the past', () => {
    expect(
      calendarDaysBetween(
        new Date('2026-03-10T09:00:00Z'),
        new Date('2026-03-05T09:00:00Z'),
        'Asia/Kolkata',
      ),
    ).toBe(-5);
  });
});

describe('describeDue', () => {
  const now = new Date('2026-03-10T09:00:00Z');

  it.each([
    ['2026-03-10T18:29:59.000Z', 'due today'],
    ['2026-03-11T18:29:59.000Z', 'due tomorrow'],
    ['2026-03-15T18:29:59.000Z', 'due in 5 days'],
    ['2026-03-09T18:29:59.000Z', 'overdue by 1 day'],
    ['2026-03-01T18:29:59.000Z', 'overdue by 9 days'],
  ])('describes %s as "%s"', (dueAt, expected) => {
    expect(describeDue(dueAt, now, 'Asia/Kolkata')).toBe(expected);
  });
});

describe('isValidTimeZone', () => {
  it('accepts a real zone and rejects a typo', () => {
    expect(isValidTimeZone('Asia/Kolkata')).toBe(true);
    expect(isValidTimeZone('Asia/Kolkat')).toBe(false);
  });
});
