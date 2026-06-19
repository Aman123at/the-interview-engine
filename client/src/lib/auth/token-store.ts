// Access-token storage. The server gates every request on
// `Authorization: Bearer <token>` (see `requireAuth` middleware in the
// server repo), so the client has to hold the token in JS. We persist it in
// localStorage so reloads keep the session, with an in-memory cache for hot
// reads. No tokens are written to non-httpOnly cookies — that's a regression
// vector via XSS we want to keep small.

const STORAGE_KEY = "isb.accessToken";

let cached: string | null = null;
let initialized = false;

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function init(): void {
  if (initialized || !isBrowser()) return;
  try {
    cached = localStorage.getItem(STORAGE_KEY);
  } catch {
    cached = null;
  }
  initialized = true;
}

export function getAccessToken(): string | null {
  init();
  return cached;
}

export function setAccessToken(token: string | null): void {
  init();
  cached = token;
  if (!isBrowser()) return;
  try {
    if (token) localStorage.setItem(STORAGE_KEY, token);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Quota / privacy mode — the in-memory cache still works for this tab.
  }
}

export function clearAccessToken(): void {
  setAccessToken(null);
}
