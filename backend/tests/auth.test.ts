import { describe, expect, it } from 'vitest';
import { issueSession, pinMatches, verifySession } from '../src/lib/auth.js';
import { HttpError } from '../src/lib/errors.js';

describe('desk PIN', () => {
  it('accepts the configured PIN', () => {
    process.env.AUTH_MODE = 'pin';
    process.env.DESK_PIN = '246810';
    expect(pinMatches('246810')).toBe(true);
    expect(pinMatches('000000')).toBe(false);
  });
});

describe('session tokens', () => {
  it('round-trips staff claims', () => {
    process.env.SESSION_SECRET = 'test-secret-for-hmac';
    const token = issueSession({
      orgId: 'main',
      userId: 'desk',
      email: '',
      name: 'Desk',
      roles: ['admin', 'staff'],
    });
    const auth = verifySession(token);
    expect(auth.orgId).toBe('main');
    expect(auth.roles).toContain('admin');
  });

  it('rejects a tampered token', () => {
    process.env.SESSION_SECRET = 'test-secret-for-hmac';
    const token = issueSession({
      orgId: 'main',
      userId: 'desk',
      email: '',
      name: 'Desk',
      roles: ['staff'],
    });
    expect(() => verifySession(`${token}x`)).toThrow(HttpError);
  });
});
