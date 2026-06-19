/**
 * Per-session workspace tree watcher.
 *
 * The file tree in the UI is fed by `file:tree`, and the only thing that
 * pushes incremental updates is the WS `file:write/delete/rename` path. But a
 * candidate also mutates the filesystem from the TERMINAL — `npx shadcn add`,
 * `npm install`, scaffolders, psql/mongosh writing files, etc. Those changes
 * never went through `file:*`, so the tree silently goes stale.
 *
 * This watcher closes that gap. While at least one socket is watching a
 * session, we poll the container's tree (`listTree`) on a short interval and
 * compare the SET OF PATHS against the previous tick. On a structural change
 * (a path added / removed / renamed — NOT a content edit, which doesn't change
 * the tree) we fire `onChange`, which the WS layer relays as `fs:invalidate`
 * to the room so every client refetches the tree.
 *
 * We diff paths only (not sizes) on purpose: editing a file's content must NOT
 * trigger a tree refetch — that would fire on every autosave. Only add/remove/
 * rename changes the path set.
 *
 * Polling (vs inotify) is deliberate: inotify on Docker volumes is unreliable
 * for cross-exec writes on this platform (the same reason HMR needs polling —
 * see Phase 9). Polling is simple and correct; ~1.2s latency is acceptable and
 * matches the rest of the stack's polling cadence.
 */
import { listTree } from './fileSync.js';
import { logger } from '@/utils/logger.js';

const POLL_INTERVAL_MS = 1200;

interface WatchEntry {
  sessionId: string;
  containerId: string;
  /** Sockets currently interested in this session's tree. Watcher stops at 0. */
  watchers: Set<string>;
  timer: ReturnType<typeof setInterval> | null;
  /** Signature of the last observed path set. */
  signature: string | null;
  /** Guards against overlapping ticks if a `listTree` runs long. */
  inFlight: boolean;
  onChange: () => void;
}

const entries = new Map<string, WatchEntry>(); // sessionId → entry

function signatureOf(paths: string[]): string {
  // Sorted join of paths — stable, order-independent. Cheap enough at this
  // scale (a sandbox is hundreds of files once node_modules is excluded).
  return paths.slice().sort().join('\n');
}

async function tick(entry: WatchEntry): Promise<void> {
  if (entry.inFlight) return;
  entry.inFlight = true;
  try {
    const nodes = await listTree(entry.containerId);
    const sig = signatureOf(nodes.map((n) => n.path));
    if (entry.signature === null) {
      // First observation — establish the baseline without firing.
      entry.signature = sig;
      return;
    }
    if (sig !== entry.signature) {
      entry.signature = sig;
      try {
        entry.onChange();
      } catch (err) {
        logger.debug({ err, sessionId: entry.sessionId }, 'treeWatcher onChange threw');
      }
    }
  } catch (err) {
    // Container gone / exec failed — stop quietly. A fresh join restarts it.
    logger.debug({ err, sessionId: entry.sessionId }, 'treeWatcher tick failed; stopping');
    stopTimer(entry);
  } finally {
    entry.inFlight = false;
  }
}

function startTimer(entry: WatchEntry): void {
  if (entry.timer) return;
  entry.timer = setInterval(() => void tick(entry), POLL_INTERVAL_MS);
  // Don't keep the event loop alive just for the poller.
  entry.timer.unref?.();
}

function stopTimer(entry: WatchEntry): void {
  if (entry.timer) {
    clearInterval(entry.timer);
    entry.timer = null;
  }
}

export const treeWatcher = {
  /**
   * Register a socket as watching this session's tree, (re)starting the poller
   * if needed. `onChange` is invoked on each structural change — the WS layer
   * passes a closure that emits `fs:invalidate` to the room.
   */
  watch(sessionId: string, containerId: string, socketId: string, onChange: () => void): void {
    let entry = entries.get(sessionId);
    if (!entry) {
      entry = {
        sessionId,
        containerId,
        watchers: new Set(),
        timer: null,
        signature: null,
        inFlight: false,
        onChange,
      };
      entries.set(sessionId, entry);
    } else {
      // Keep the latest container id + onChange (container id can change on
      // resume; onChange closure is bound to the live io instance).
      entry.containerId = containerId;
      entry.onChange = onChange;
    }
    entry.watchers.add(socketId);
    startTimer(entry);
  },

  /** Drop a socket; stop the poller when the last watcher leaves. */
  unwatch(sessionId: string, socketId: string): void {
    const entry = entries.get(sessionId);
    if (!entry) return;
    entry.watchers.delete(socketId);
    if (entry.watchers.size === 0) {
      stopTimer(entry);
      entries.delete(sessionId);
    }
  },

  /** Drop a socket from EVERY session it was watching (used on disconnect). */
  unwatchAll(socketId: string): void {
    for (const [sessionId, entry] of entries) {
      if (entry.watchers.delete(socketId) && entry.watchers.size === 0) {
        stopTimer(entry);
        entries.delete(sessionId);
      }
    }
  },

  /** Test/introspection hook. */
  activeCount(): number {
    return entries.size;
  },
};
