/**
 * Track the user's currently-live session so the dashboard can surface a
 * "Resume" card even when the server still has the row in `running` status
 * (the `/sessions/recoverable` endpoint only returns sessions in
 * `recoverable` state, so without this we'd otherwise show the framework
 * grid and let the user attempt a second concurrent session — which the
 * server would then 409 on).
 *
 * The stored snapshot is best-effort: if it doesn't match server reality
 * (session was closed in another tab, abrupt loss, etc.) the user just
 * clicks Continue and the session page handles redirects.
 */

import type { CustomizationSelection } from "@/lib/customization";

const STORAGE_KEY = "isb.activeSession";

export interface ActiveSessionSnapshot {
  id: string;
  framework: string;
  customization?: CustomizationSelection;
  /** ISO timestamp captured when the workspace first mounted. */
  enteredAt: string;
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function getActiveSession(): ActiveSessionSnapshot | null {
  if (!isBrowser()) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveSessionSnapshot;
    if (parsed && typeof parsed.id === "string" && parsed.id) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function setActiveSession(snapshot: ActiveSessionSnapshot): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Quota / privacy mode — ignored.
  }
}

export function clearActiveSession(): void {
  if (!isBrowser()) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Convenience: only clear if the stored id matches. Used during close so we
 *  don't accidentally drop a different tab's session pointer. */
export function clearActiveSessionIfMatches(id: string): void {
  const cur = getActiveSession();
  if (cur && cur.id === id) clearActiveSession();
}
