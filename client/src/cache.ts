// On-device cache (localStorage) for the app's essential data — the signed-in
// profile, today's/tomorrow's prayer schedule, the Ramadan calendar, the
// user's own marks and the latest Fitra rates. Every successful fetch is
// written here, so the app opens and works fully offline with the most
// recent data it ever received; whenever the connection returns, TanStack
// Query refetches and the fresh response overwrites the cache in place.

const PREFIX = "rmjaan-cache:";

export function readCache<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return undefined;
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

export function writeCache(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // storage full or unavailable — the app still works from memory
  }
}

export function clearCache(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // nothing to clear
  }
}
