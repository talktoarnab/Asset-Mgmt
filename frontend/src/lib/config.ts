export interface AppConfig {
  appName: string;
  /** Empty means same-origin `/v1` (CloudFront in prod, Vite proxy in dev). */
  apiBaseUrl: string;
}

const DEV_FALLBACK: AppConfig = {
  appName: 'ShelfKit',
  apiBaseUrl: '',
};

let cached: AppConfig | undefined;

export async function loadConfig(): Promise<AppConfig> {
  if (cached) return cached;

  try {
    const response = await fetch('/config.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(String(response.status));
    const loaded = (await response.json()) as Partial<AppConfig>;
    cached = { ...DEV_FALLBACK, ...loaded };
  } catch {
    cached = DEV_FALLBACK;
  }

  return cached;
}

export function getConfig(): AppConfig {
  if (!cached) throw new Error('Configuration has not been loaded yet');
  return cached;
}
