import { clearSession, readToken } from './auth';
import { getConfig } from './config';
import type { Asset, Checkout, Me, Member, Org, Report, ScanResult, Summary } from './types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get fieldErrors(): Record<string, string> {
    if (!Array.isArray(this.details)) return {};
    return Object.fromEntries(
      (this.details as Array<{ field?: string; message?: string }>)
        .filter((d) => d.field)
        .map((d) => [d.field!, d.message ?? 'Invalid value']),
    );
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  signal?: AbortSignal;
  auth?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const config = getConfig();
  const url = new URL(`${config.apiBaseUrl}${path}`, window.location.origin);

  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
  }

  const headers: Record<string, string> = { accept: 'application/json' };
  if (options.body !== undefined) headers['content-type'] = 'application/json';

  if (options.auth !== false) {
    const token = readToken();
    if (token) headers.authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new ApiError(0, 'NETWORK', 'Could not reach the server. Check your connection.');
  }

  if (response.status === 401 && options.auth !== false) {
    clearSession();
    window.location.assign('/');
    throw new ApiError(401, 'UNAUTHORIZED', 'Your session expired. Sign in again.');
  }

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => undefined);

  if (!response.ok) {
    const error = (payload as { error?: { code: string; message: string; details?: unknown } })
      ?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'UNKNOWN',
      error?.message ?? `Request failed (${response.status})`,
      error?.details,
    );
  }

  return payload as T;
}

interface ListResponse<T> {
  items: T[];
  total: number;
}

export const api = {
  login: (pin: string) =>
    request<{ token: string; user: Me['user']; org: Org }>('/v1/auth/login', {
      method: 'POST',
      body: { pin },
      auth: false,
    }),

  me: () => request<Me>('/v1/me'),

  getSettings: () => request<Org>('/v1/settings'),
  updateSettings: (patch: Partial<Org>) =>
    request<Org>('/v1/settings', { method: 'PATCH', body: patch }),

  listMembers: (q?: string) => request<ListResponse<Member>>('/v1/members', { query: { q } }),
  getMember: (memberId: string) => request<Member>(`/v1/members/${memberId}`),
  createMember: (body: Partial<Member>) =>
    request<Member>('/v1/members', { method: 'POST', body }),
  updateMember: (memberId: string, body: Partial<Member>) =>
    request<Member>(`/v1/members/${memberId}`, { method: 'PATCH', body }),
  deleteMember: (memberId: string) =>
    request<void>(`/v1/members/${memberId}`, { method: 'DELETE' }),
  memberHistory: (memberId: string) =>
    request<{ member: Member; items: Checkout[] }>(`/v1/members/${memberId}/history`),

  listAssets: (query: { q?: string; status?: string; category?: string } = {}) =>
    request<ListResponse<Asset>>('/v1/assets', { query }),
  getAsset: (assetId: string) =>
    request<{ asset: Asset; activeCheckout?: Checkout }>(`/v1/assets/${assetId}`),
  createAsset: (body: Partial<Asset>) => request<Asset>('/v1/assets', { method: 'POST', body }),
  createAssets: (assets: Array<Partial<Asset>>) =>
    request<{
      created: number;
      failed: number;
      results: Array<{ ok: boolean; asset?: Asset; title?: string; error?: string }>;
    }>('/v1/assets/bulk', { method: 'POST', body: { assets } }),
  updateAsset: (assetId: string, body: Partial<Asset>) =>
    request<Asset>(`/v1/assets/${assetId}`, { method: 'PATCH', body }),
  deleteAsset: (assetId: string) => request<void>(`/v1/assets/${assetId}`, { method: 'DELETE' }),

  scan: (ref: string, memberId?: string) =>
    request<ScanResult>('/v1/scan', { method: 'POST', body: { ref, memberId } }),

  listCheckouts: (status: 'open' | 'overdue' | 'recent' = 'open', limit?: number) =>
    request<ListResponse<Checkout>>('/v1/checkouts', { query: { status, limit } }),
  checkout: (body: { assetRef: string; memberId: string; loanDays?: number; notes?: string }) =>
    request<{ checkout: Checkout; asset: Asset; member: Member }>('/v1/checkouts', {
      method: 'POST',
      body,
    }),
  checkinByRef: (assetRef: string, body: { condition?: string; notes?: string } = {}) =>
    request<{ checkout: Checkout; asset: Asset }>('/v1/checkins', {
      method: 'POST',
      body: { assetRef, ...body },
    }),
  checkin: (checkoutId: string, body: { condition?: string; notes?: string } = {}) =>
    request<Checkout>(`/v1/checkouts/${checkoutId}/checkin`, { method: 'POST', body }),
  renew: (checkoutId: string) =>
    request<Checkout>(`/v1/checkouts/${checkoutId}/renew`, { method: 'POST' }),
  markLost: (checkoutId: string, notes?: string) =>
    request<Checkout>(`/v1/checkouts/${checkoutId}/lost`, { method: 'POST', body: { notes } }),

  summary: () => request<Summary>('/v1/analytics/summary'),
  report: () => request<Report>('/v1/analytics/report'),
  reconcile: () =>
    request<{ checked: number; repaired: number }>('/v1/maintenance/reconcile', {
      method: 'POST',
      body: {},
    }),
};
