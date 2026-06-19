/**
 * Periodic reaper + boot reconciliation.
 *
 * Responsibilities:
 *   1. BOOT — reconcile DB ↔ Docker reality. Containers that disappeared
 *      while the server was down get flipped to `recoverable`; containers
 *      that belong to already-ended sessions get force-removed.
 *   2. PERIODIC (every REAPER_INTERVAL_MS) —
 *      - idle `running` sessions past SESSION_IDLE_TIMEOUT_MS → recoverable
 *      - `error` sessions past REAPER_ERROR_TTL_MS → release port + drop volume
 *      - `recoverable` sessions past REAPER_RECOVERABLE_TTL_MS → force ended
 *      - orphan containers with no live DB session → removed
 *
 * All actions are append-only to `session_events` so the inspect view shows
 * who reaped what and when.
 */
import { config } from '@/config/index.js';
import { logger } from '@/utils/logger.js';
import { sessionsDal, sessionEventsDal } from '@/dal/index.js';
import {
  getDocker,
  inspectContainer,
  removeContainer,
  removeVolume,
  stopContainer,
  LABEL_MANAGED,
  LABEL_SESSION,
} from './containerService.js';
import { portPool } from './portPool.js';
import { terminalManager } from './terminalManager.js';

let timer: NodeJS.Timeout | null = null;
let inFlight = false;
let started = false;

async function listManagedContainers(): Promise<Array<{ id: string; sessionId: string; state: string }>> {
  try {
    const all = await getDocker().listContainers({
      all: true,
      filters: { label: [`${LABEL_MANAGED}=true`] },
    });
    return all.map((c) => ({
      id: c.Id,
      sessionId: c.Labels[LABEL_SESSION] ?? '',
      state: c.State,
    }));
  } catch (err) {
    logger.warn({ err }, 'reaper: listContainers failed');
    return [];
  }
}

// ---------------------------------------------------------------------------

export const reaperService = {
  async start(): Promise<void> {
    if (started) return;
    started = true;
    try {
      await this.reconcile();
    } catch (err) {
      logger.error({ err }, 'reaper: boot reconcile failed');
    }
    timer = setInterval(() => {
      void this.tick();
    }, config.REAPER_INTERVAL_MS);
    timer.unref();
    logger.info(
      {
        intervalMs: config.REAPER_INTERVAL_MS,
        errorTtlMs: config.REAPER_ERROR_TTL_MS,
        recoverableTtlMs: config.REAPER_RECOVERABLE_TTL_MS,
        idleMs: config.SESSION_IDLE_TIMEOUT_MS,
      },
      'reaperService started',
    );
  },

  async stop(): Promise<void> {
    if (!started) return;
    started = false;
    if (timer) clearInterval(timer);
    timer = null;
  },

  async tick(): Promise<void> {
    if (inFlight) return;
    inFlight = true;
    const t0 = Date.now();
    let counts = { idle: 0, error: 0, recoverable: 0, orphan: 0 };
    try {
      counts = {
        idle: await this.reapIdleRunning(),
        error: await this.reapErrorTtl(),
        recoverable: await this.reapStaleRecoverable(),
        orphan: await this.reapOrphanContainers(),
      };
    } catch (err) {
      logger.error({ err }, 'reaper: tick failed');
    } finally {
      inFlight = false;
      const dt = Date.now() - t0;
      if (counts.idle + counts.error + counts.recoverable + counts.orphan > 0 || dt > 1000) {
        logger.info({ dt, ...counts }, 'reaper tick complete');
      }
    }
  },

  /**
   * Walk DB ↔ Docker reality at boot. A session whose container is missing
   * but row is still `running`/`initializing`/`saving` is treated as if it
   * died while the server was down → mark `recoverable`.
   */
  async reconcile(): Promise<void> {
    const active = await sessionsDal.listActive();
    const containers = await listManagedContainers();
    const containersBySession = new Map<string, { id: string; state: string }>();
    for (const c of containers) {
      if (c.sessionId) containersBySession.set(c.sessionId, { id: c.id, state: c.state });
    }

    let recovered = 0;
    let removedOrphans = 0;

    for (const s of active) {
      const c = containersBySession.get(s.id);
      // If our row references a container that doesn't exist anymore, OR the
      // container is in a non-running state and we think it's running.
      if (s.status === 'running' || s.status === 'initializing' || s.status === 'saving') {
        if (!c || c.state !== 'running') {
          await sessionsDal.updateStatus(s.id, 'recoverable');
          await sessionEventsDal.append({
            sessionId: s.id,
            type: 'error',
            level: 'warn',
            payload: { reason: 'boot_reconcile', containerState: c?.state ?? 'missing' },
          });
          recovered++;
        }
      }
    }

    // Orphans: containers whose session is ended/error or doesn't exist in DB.
    const activeIds = new Set(active.map((s) => s.id));
    for (const c of containers) {
      if (!c.sessionId) continue;
      if (activeIds.has(c.sessionId)) continue;
      try {
        await removeContainer(c.id);
        removedOrphans++;
      } catch (err) {
        logger.warn({ err, containerId: c.id }, 'reaper: orphan remove failed');
      }
    }

    logger.info({ active: active.length, containers: containers.length, recovered, removedOrphans }, 'reaper: reconcile complete');
  },

  /** Mark long-idle `running` sessions as `recoverable` and stop their containers. */
  async reapIdleRunning(): Promise<number> {
    const active = await sessionsDal.listActive();
    const cutoff = Date.now() - config.SESSION_IDLE_TIMEOUT_MS;
    let n = 0;
    for (const s of active) {
      if (s.status !== 'running') continue;
      if (!s.lastActiveAt) continue;
      if (s.lastActiveAt.getTime() > cutoff) continue;
      try {
        await terminalManager.closeAllForSession(s.id);
        if (s.containerId) await stopContainer(s.containerId, 10);
        await sessionsDal.updateStatus(s.id, 'recoverable');
        await sessionEventsDal.append({
          sessionId: s.id,
          type: 'session_close',
          level: 'info',
          payload: { initiated_by: 'reaper', reason: 'idle' },
        });
        n++;
      } catch (err) {
        logger.warn({ err, sessionId: s.id }, 'reaper: idle reap failed');
      }
    }
    return n;
  },

  /**
   * `error` sessions past TTL: container/volume/port reclaimed.
   * (Sessions are ALREADY flagged terminal — we just clean local resources.)
   */
  async reapErrorTtl(): Promise<number> {
    // listActive returns NON-TERMINAL — `error` is terminal already, so the
    // resources may already be released. Defensive: look for error sessions
    // with a still-allocated port and free it.
    const stuck = await sessionsDal.listErrorOlderThan(config.REAPER_ERROR_TTL_MS);
    let n = 0;
    for (const s of stuck) {
      try {
        if (s.containerId) {
          await stopContainer(s.containerId, 5).catch(() => undefined);
          await removeContainer(s.containerId).catch(() => undefined);
        }
        if (s.volumeName) await removeVolume(s.volumeName).catch(() => undefined);
        portPool.release(s.hostPreviewPort);
        await sessionEventsDal.append({
          sessionId: s.id,
          type: 'session_close',
          level: 'info',
          payload: { initiated_by: 'reaper', reason: 'error_ttl' },
        });
        n++;
      } catch (err) {
        logger.warn({ err, sessionId: s.id }, 'reaper: error TTL reap failed');
      }
    }
    return n;
  },

  /** Force-end `recoverable` sessions older than the TTL — volume KEPT (audit). */
  async reapStaleRecoverable(): Promise<number> {
    const stuck = await sessionsDal.listRecoverableOlderThan(config.REAPER_RECOVERABLE_TTL_MS);
    let n = 0;
    for (const s of stuck) {
      try {
        portPool.release(s.hostPreviewPort);
        await sessionsDal.markEnded(s.id);
        await sessionEventsDal.append({
          sessionId: s.id,
          type: 'session_close',
          level: 'info',
          payload: { initiated_by: 'reaper', reason: 'recoverable_ttl' },
        });
        n++;
      } catch (err) {
        logger.warn({ err, sessionId: s.id }, 'reaper: recoverable TTL reap failed');
      }
    }
    return n;
  },

  /** Remove any container whose session is ended/error/missing. */
  async reapOrphanContainers(): Promise<number> {
    const containers = await listManagedContainers();
    let n = 0;
    for (const c of containers) {
      if (!c.sessionId) continue;
      const session = await sessionsDal.findById(c.sessionId);
      if (!session || session.status === 'ended' || session.status === 'error') {
        try {
          await removeContainer(c.id);
          n++;
        } catch (err) {
          logger.warn({ err, containerId: c.id }, 'reaper: orphan remove failed');
        }
      }
    }
    return n;
  },

  /** Test/inspect surface. */
  async _stats(): Promise<{ runningInDb: number; managedContainers: number }> {
    const active = await sessionsDal.listActive();
    const containers = await listManagedContainers();
    return { runningInDb: active.length, managedContainers: containers.length };
  },
};
