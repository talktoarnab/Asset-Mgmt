const STORAGE_KEY = 'shelfkit.token';

const FALLBACK = { appName: 'ShelfKit', apiBaseUrl: '' };

let config = { ...FALLBACK };

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  get fieldErrors() {
    if (!Array.isArray(this.details)) return {};
    return Object.fromEntries(
      this.details.filter((d) => d.field).map((d) => [d.field, d.message ?? 'Invalid value']),
    );
  }
}

export function getConfig() {
  return config;
}

export async function loadConfig() {
  try {
    const response = await fetch('/config.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(String(response.status));
    const loaded = await response.json();
    config = { ...FALLBACK, ...loaded };
  } catch {
    config = { ...FALLBACK };
  }
  return config;
}

export function readToken() {
  return localStorage.getItem(STORAGE_KEY) ?? undefined;
}

export function writeToken(token) {
  localStorage.setItem(STORAGE_KEY, token);
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

export function logout() {
  clearSession();
  location.hash = '#/';
  location.reload();
}

async function request(path, options = {}) {
  const url = new URL(`${config.apiBaseUrl}${path}`, location.origin);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
  }

  const headers = { accept: 'application/json' };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.auth !== false) {
    const token = readToken();
    if (token) headers.authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch (error) {
    throw new ApiError(0, 'NETWORK', 'Could not reach the server. Check your connection.');
  }

  if (response.status === 401 && options.auth !== false) {
    clearSession();
    location.hash = '#/';
    location.reload();
    throw new ApiError(401, 'UNAUTHORIZED', 'Your session expired. Sign in again.');
  }

  if (response.status === 204) return undefined;

  const payload = await response.json().catch(() => undefined);
  if (!response.ok) {
    const error = payload?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'UNKNOWN',
      error?.message ?? `Request failed (${response.status})`,
      error?.details,
    );
  }
  return payload;
}

export const api = {
  login: (pin) => request('/v1/auth/login', { method: 'POST', body: { pin }, auth: false }),
  me: () => request('/v1/me'),
  updateSettings: (patch) => request('/v1/settings', { method: 'PATCH', body: patch }),

  listMembers: (q) => request('/v1/members', { query: { q } }),
  getMember: (memberId) => request(`/v1/members/${memberId}`),
  createMember: (body) => request('/v1/members', { method: 'POST', body }),
  updateMember: (memberId, body) => request(`/v1/members/${memberId}`, { method: 'PATCH', body }),
  deleteMember: (memberId) => request(`/v1/members/${memberId}`, { method: 'DELETE' }),
  memberHistory: (memberId) => request(`/v1/members/${memberId}/history`),

  listAssets: (query = {}) => request('/v1/assets', { query }),
  getAsset: (assetId) => request(`/v1/assets/${assetId}`),
  createAsset: (body) => request('/v1/assets', { method: 'POST', body }),
  createAssets: (assets) => request('/v1/assets/bulk', { method: 'POST', body: { assets } }),
  updateAsset: (assetId, body) => request(`/v1/assets/${assetId}`, { method: 'PATCH', body }),
  deleteAsset: (assetId) => request(`/v1/assets/${assetId}`, { method: 'DELETE' }),

  scan: (ref, memberId) => request('/v1/scan', { method: 'POST', body: { ref, memberId } }),

  listCheckouts: (status = 'open', limit) =>
    request('/v1/checkouts', { query: { status, limit } }),
  checkout: (body) => request('/v1/checkouts', { method: 'POST', body }),
  checkinByRef: (assetRef, body = {}) =>
    request('/v1/checkins', { method: 'POST', body: { assetRef, ...body } }),
  checkin: (checkoutId, body = {}) =>
    request(`/v1/checkouts/${checkoutId}/checkin`, { method: 'POST', body }),
  renew: (checkoutId) => request(`/v1/checkouts/${checkoutId}/renew`, { method: 'POST' }),
  markLost: (checkoutId, notes) =>
    request(`/v1/checkouts/${checkoutId}/lost`, { method: 'POST', body: { notes } }),

  summary: () => request('/v1/analytics/summary'),
  report: () => request('/v1/analytics/report'),
  reconcile: () => request('/v1/maintenance/reconcile', { method: 'POST', body: {} }),
};
