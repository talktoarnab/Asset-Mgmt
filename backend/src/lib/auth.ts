import { createHmac, timingSafeEqual } from 'node:crypto';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { env } from './env.js';
import { forbidden, unauthorized } from './errors.js';
import type { AuthContext, Role } from '../domain/types.js';

const SESSION_TTL_SECONDS = 12 * 60 * 60;

interface SessionPayload {
  orgId: string;
  userId: string;
  name: string;
  roles: Role[];
  exp: number;
}

export function pinMatches(presented: string): boolean {
  if (env.authMode === 'dev') return presented.length > 0;
  const expected = env.deskPin;
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function issueSession(auth: AuthContext): string {
  const payload: SessionPayload = {
    orgId: auth.orgId,
    userId: auth.userId,
    name: auth.name,
    roles: auth.roles,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', env.sessionSecret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifySession(token: string): AuthContext {
  const [body, sig] = token.split('.');
  if (!body || !sig) throw unauthorized();

  const expected = createHmac('sha256', env.sessionSecret).update(body).digest('base64url');
  const presented = Buffer.from(sig);
  const wanted = Buffer.from(expected);
  if (presented.length !== wanted.length || !timingSafeEqual(presented, wanted)) {
    throw unauthorized();
  }

  let payload: SessionPayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
  } catch {
    throw unauthorized();
  }

  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw unauthorized('Your session expired. Sign in again.');
  }

  return {
    orgId: payload.orgId,
    userId: payload.userId,
    name: payload.name,
    email: '',
    roles: payload.roles,
  };
}

export function authContextFrom(event: APIGatewayProxyEventV2): AuthContext {
  if (env.authMode === 'dev' && !bearerToken(event)) {
    return deskStaff();
  }

  const header = bearerToken(event);
  if (!header) throw unauthorized();
  return verifySession(header);
}

function bearerToken(event: APIGatewayProxyEventV2): string | undefined {
  const raw =
    event.headers?.authorization ??
    event.headers?.Authorization ??
    Object.entries(event.headers ?? {}).find(([key]) => key.toLowerCase() === 'authorization')?.[1];
  if (!raw) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(raw);
  return match?.[1]?.trim();
}

export function deskStaff(): AuthContext {
  return {
    orgId: env.orgId,
    userId: 'desk',
    email: '',
    name: 'Desk',
    roles: ['admin', 'staff'],
  };
}

export function requireRole(auth: AuthContext, role: Role): void {
  if (!auth.roles.includes(role)) {
    throw forbidden(`This action requires the ${role} role.`);
  }
}

/** Stamped onto records so an audit can answer "who checked this out?". */
export function actorLabel(auth: AuthContext): string {
  return auth.name || auth.userId;
}
