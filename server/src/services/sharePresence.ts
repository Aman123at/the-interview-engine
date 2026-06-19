/**
 * In-memory candidate-presence registry for shared sessions.
 *
 * A shared session has at most ONE candidate connected at a time. While a
 * candidate is present the interviewer becomes a read-only observer; when the
 * candidate leaves (explicit "leave" or tab close) the interviewer regains
 * edit access. This module is the SINGLE SOURCE OF TRUTH for that swap — both
 * the WS layer (file/terminal writes) and the HTTP API-client proxy consult
 * `isCandidatePresent` / `canEdit` before allowing a mutation.
 *
 * Single-process (v1). A `@socket.io/redis-adapter` migration would move this
 * to a shared store, but the call sites stay the same.
 *
 * Disconnects get a short GRACE period before the interviewer is unlocked, so a
 * brief network blip doesn't thrash the lock. An explicit "leave" skips it.
 */
import { eventBus } from '@/utils/eventBus.js';
import { logger } from '@/utils/logger.js';

const GRACE_MS = 8_000;

interface Entry {
  /** The candidate socket id currently holding the slot, or null. */
  candidateSocketId: string | null;
  /** Pending unlock timer after a disconnect (cleared if they reconnect). */
  graceTimer: ReturnType<typeof setTimeout> | null;
}

const sessions = new Map<string, Entry>();

function entry(sessionId: string): Entry {
  let e = sessions.get(sessionId);
  if (!e) {
    e = { candidateSocketId: null, graceTimer: null };
    sessions.set(sessionId, e);
  }
  return e;
}

function publish(sessionId: string, candidatePresent: boolean): void {
  eventBus.emit('share.state', { sessionId, candidatePresent });
}

export const sharePresence = {
  /** True if a candidate currently holds the session (no pending grace expiry). */
  isCandidatePresent(sessionId: string): boolean {
    const e = sessions.get(sessionId);
    return !!e && e.candidateSocketId !== null;
  },

  /** The socket id of the present candidate, or null. */
  candidateSocketId(sessionId: string): string | null {
    return sessions.get(sessionId)?.candidateSocketId ?? null;
  },

  /**
   * Whether a socket may EDIT (write files / type in terminals / drive the API
   * client) given its role and the current presence:
   *   - candidate  → only the one holding the slot, while present
   *   - interviewer→ only when NO candidate is present
   */
  canEdit(sessionId: string, role: 'interviewer' | 'candidate', socketId: string): boolean {
    const present = this.isCandidatePresent(sessionId);
    if (role === 'candidate') return present && this.candidateSocketId(sessionId) === socketId;
    return !present;
  },

  /**
   * A candidate claims the session slot. Returns false if another candidate
   * already holds it (single-occupancy) — the caller should refuse the join.
   */
  claim(sessionId: string, socketId: string): boolean {
    const e = entry(sessionId);
    if (e.candidateSocketId && e.candidateSocketId !== socketId) {
      return false; // slot taken by a different live candidate
    }
    if (e.graceTimer) {
      clearTimeout(e.graceTimer);
      e.graceTimer = null;
    }
    const wasAbsent = e.candidateSocketId === null;
    e.candidateSocketId = socketId;
    if (wasAbsent) {
      logger.debug({ sessionId, socketId }, 'sharePresence: candidate claimed');
      publish(sessionId, true);
    }
    return true;
  },

  /**
   * Release the slot held by `socketId`. `immediate` (explicit leave) unlocks
   * the interviewer right away; otherwise a short grace lets a reconnect re-claim
   * before the interviewer is unlocked. No-op if `socketId` isn't the holder.
   */
  release(sessionId: string, socketId: string, immediate = false): void {
    const e = sessions.get(sessionId);
    if (!e || e.candidateSocketId !== socketId) return;
    const finish = () => {
      e.graceTimer = null;
      // Only unlock if nobody re-claimed in the meantime.
      if (e.candidateSocketId === socketId) {
        e.candidateSocketId = null;
        logger.debug({ sessionId, socketId }, 'sharePresence: candidate released');
        publish(sessionId, false);
      }
    };
    if (immediate) {
      if (e.graceTimer) clearTimeout(e.graceTimer);
      finish();
      return;
    }
    if (e.graceTimer) clearTimeout(e.graceTimer);
    e.graceTimer = setTimeout(finish, GRACE_MS);
  },

  /** Forget a session entirely (on close/cleanup). */
  forget(sessionId: string): void {
    const e = sessions.get(sessionId);
    if (e?.graceTimer) clearTimeout(e.graceTimer);
    sessions.delete(sessionId);
  },
};
