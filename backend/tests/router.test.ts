import { describe, expect, it } from 'vitest';
import { HttpError } from '../src/lib/errors.js';
import { errorResponse, parseBody } from '../src/lib/http.js';
import { Router } from '../src/lib/router.js';
import { memberCreateSchema } from '../src/domain/schemas.js';

const noop = async () => ({ statusCode: 200, body: '' });

describe('Router', () => {
  const router = new Router<null>();
  router.get('/v1/assets', noop);
  router.get('/v1/assets/{assetId}', noop);
  router.get('/v1/members/{memberId}/history', noop);
  router.post('/v1/assets', noop);

  it('matches a static route', () => {
    expect(router.match('GET', '/v1/assets')?.params).toEqual({});
  });

  it('extracts path parameters', () => {
    expect(router.match('GET', '/v1/assets/ast-123')?.params).toEqual({ assetId: 'ast-123' });
    expect(router.match('GET', '/v1/members/mem-9/history')?.params).toEqual({ memberId: 'mem-9' });
  });

  it('distinguishes methods on the same path', () => {
    expect(router.match('POST', '/v1/assets')).toBeDefined();
    expect(router.match('DELETE', '/v1/assets')).toBeUndefined();
  });

  it('does not let a parameter swallow extra segments', () => {
    expect(router.match('GET', '/v1/assets/ast-123/extra')).toBeUndefined();
  });

  it('decodes percent-encoded parameters', () => {
    expect(router.match('GET', '/v1/assets/BK%2F12')?.params).toEqual({ assetId: 'BK/12' });
  });

  it('rejects an unknown path with a 404', async () => {
    await expect(
      router.handle({
        method: 'GET',
        path: '/v1/nope',
        query: {},
        body: undefined,
        isBase64Encoded: false,
        auth: null,
      }),
    ).rejects.toThrow(HttpError);
  });
});

describe('parseBody', () => {
  it('accepts a valid payload', () => {
    const parsed = parseBody(
      memberCreateSchema,
      JSON.stringify({ name: ' Ananya ', phone: '9876543210' }),
    );
    expect(parsed.name).toBe('Ananya');
  });

  it('decodes a base64 body from API Gateway', () => {
    const raw = Buffer.from(JSON.stringify({ name: 'Rohit', phone: '9812345678' })).toString(
      'base64',
    );
    expect(parseBody(memberCreateSchema, raw, true).name).toBe('Rohit');
  });

  it('rejects malformed JSON with a helpful message', () => {
    expect(() => parseBody(memberCreateSchema, '{oops')).toThrow(/valid JSON/);
  });

  it('requires a body at all', () => {
    expect(() => parseBody(memberCreateSchema, undefined)).toThrow(/body is required/);
  });
});

describe('errorResponse', () => {
  it('preserves the status and code of a domain error', () => {
    const response = errorResponse(new HttpError(409, 'ASSET_UNAVAILABLE', 'Already out'));
    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body!).error).toMatchObject({
      code: 'ASSET_UNAVAILABLE',
      message: 'Already out',
    });
  });

  it('turns schema failures into per-field messages', () => {
    let thrown: unknown;
    try {
      parseBody(memberCreateSchema, JSON.stringify({ name: '', phone: '9876543210' }));
    } catch (error) {
      thrown = error;
    }
    const response = errorResponse(thrown);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body!).error.details[0].field).toBe('name');
  });

  it('never leaks internals for an unexpected error', () => {
    const response = errorResponse(new Error('connection string: postgres://secret'));
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('secret');
  });
});
