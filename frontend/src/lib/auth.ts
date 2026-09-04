const STORAGE_KEY = 'shelfkit.token';

export function readToken(): string | undefined {
  return localStorage.getItem(STORAGE_KEY) ?? undefined;
}

export function writeToken(token: string): void {
  localStorage.setItem(STORAGE_KEY, token);
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function logout(): void {
  clearSession();
  window.location.assign('/');
}
