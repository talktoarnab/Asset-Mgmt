import { describe, expect, it } from 'vitest';
import { formatPhone, normalizePhone } from '../src/lib/phone.js';

describe('normalizePhone', () => {
  it.each([
    ['9876543210', '+919876543210'],
    ['09876543210', '+919876543210'],
    ['98765 43210', '+919876543210'],
    ['+91 98765-43210', '+919876543210'],
    ['919876543210', '+919876543210'],
    ['(0)98765.43210', '+919876543210'],
  ])('normalises %s to %s', (input, expected) => {
    expect(normalizePhone(input, '+91')).toBe(expected);
  });

  it('respects a different branch country code', () => {
    expect(normalizePhone('07700 900123', '+44')).toBe('+447700900123');
  });

  it('keeps an explicit international number untouched', () => {
    expect(normalizePhone('+1 415 555 0134', '+91')).toBe('+14155550134');
  });

  it('rejects input that cannot be a phone number', () => {
    expect(() => normalizePhone('n/a', '+91')).toThrow(/not a valid phone number/);
    expect(() => normalizePhone('   ', '+91')).toThrow(/required/);
  });
});

describe('formatPhone', () => {
  it('groups the national portion for display', () => {
    expect(formatPhone('+919876543210')).toBe('+91 98765 43210');
  });
});
