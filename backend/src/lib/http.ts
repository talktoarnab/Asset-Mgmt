import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { ZodError, type ZodSchema } from 'zod';
import { badRequest, HttpError } from './errors.js';

const BASE_HEADERS: Record<string, string> = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

export function json(
  statusCode: number,
  body: unknown,
  headers: Record<string, string> = {},
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: { ...BASE_HEADERS, ...headers },
    body: JSON.stringify(body),
  };
}

export const ok = (body: unknown) => json(200, body);
export const created = (body: unknown) => json(201, body);
export const noContent = (): APIGatewayProxyStructuredResultV2 => ({
  statusCode: 204,
  headers: BASE_HEADERS,
  body: '',
});

export function errorResponse(error: unknown): APIGatewayProxyStructuredResultV2 {
  if (error instanceof HttpError) {
    return json(error.status, {
      error: { code: error.code, message: error.message, details: error.details },
    });
  }

  if (error instanceof ZodError) {
    return json(400, {
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Some fields need attention.',
        details: error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      },
    });
  }

  console.error('unhandled_error', error);
  return json(500, {
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on our side.' },
  });
}

export function parseBody<T>(schema: ZodSchema<T>, raw: string | undefined, isBase64 = false): T {
  if (!raw) throw badRequest('A request body is required');
  const text = isBase64 ? Buffer.from(raw, 'base64').toString('utf8') : raw;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw badRequest('Request body must be valid JSON');
  }
  return schema.parse(parsed);
}
