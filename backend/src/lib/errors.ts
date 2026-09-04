export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new HttpError(400, 'BAD_REQUEST', message, details);

export const unauthorized = (message = 'Authentication required') =>
  new HttpError(401, 'UNAUTHORIZED', message);

export const forbidden = (message = 'You do not have access to this action') =>
  new HttpError(403, 'FORBIDDEN', message);

export const notFound = (message = 'Resource not found') =>
  new HttpError(404, 'NOT_FOUND', message);

export const conflict = (code: string, message: string, details?: unknown) =>
  new HttpError(409, code, message, details);

export const unprocessable = (code: string, message: string, details?: unknown) =>
  new HttpError(422, code, message, details);
