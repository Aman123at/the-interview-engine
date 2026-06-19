/**
 * Docker daemon event subscriber + periodic stats cache.
 *
 * Persists every container lifecycle transition we care about to
 * `session_events` (the Phase 1 audit log) and updates `sessions.status`
 * when a container dies / OOMs / is destroyed unexpectedly. Stats are kept
 * in-memory (latest snapshot per container) for the inspect endpoint —
 * we deliberately don't write them to the DB on every tick to avoid
 * flooding the events table.
 */
import type { DockerEvent } from './containerService.js';
import {
  LABEL_SESSION,
  snapshotStats,
  streamEvents,
  type ContainerStatsSnapshot,
} from './containerService.js';
import { sessionsDal, sessionEventsDal } from '@/dal/index.js';
import { logger } from '@/utils/logger.js';

/** Internal: how often we sample container stats. */
const STATS_INTERVAL_MS = 30_000;

/** Latest stats snapshot per containerId. */
const statsCache = new Map<string, ContainerStatsSnapshot & { at: number }>();

let cancelEvents: (() => void) | null = null;
let statsTimer: NodeJS.Timeout | null = null;
let started = false;

// ---------------------------------------------------------------------------

export const lifecycleService = {
  /** Subscribe to Docker events + start the stats poller. */
  start(): void {
    if (started) return;
    started = true;
    logger.info('lifecycleService: starting docker event subscription');
    cancelEvents = streamEvents((ev) => {
      void handleEvent(ev);
    });
    statsTimer = setInterval(() => {
      void pollAllStats();
    }, STATS_INTERVAL_MS);
    statsTimer.unref();
  },

  async stop(): Promise<void> {
    if (!started) return;
    started = false;
    if (cancelEvents) cancelEvents();
    cancelEvents = null;
    if (statsTimer) clearInterval(statsTimer);
    statsTimer = null;
    statsCache.clear();
    logger.info('lifecycleService: stopped');
  },

  /** Inspect endpoint helper — latest stats snapshot for a container. */
  getStatsCache(containerId: string): (ContainerStatsSnapshot & { at: number }) | null {
    return statsCache.get(containerId) ?? null;
  },

  /** Surface for tests/orchestrator: process one event synchronously. */
  _handleEvent(ev: DockerEvent): Promise<void> {
    return handleEvent(ev);
  },
};

// ---------------------------------------------------------------------------

async function handleEvent(ev: DockerEvent): Promise<void> {
  if (ev.Type !== 'container') return;
  const sessionId = ev.Actor.Attributes[LABEL_SESSION];
  if (!sessionId) return; // not one of ours

  try {
    const session = await sessionsDal.findById(sessionId);
    if (!session) return;

    const exitCode = ev.Actor.Attributes['exitCode'] ?? ev.Actor.Attributes['exit_code'] ?? null;
    const signal = ev.Actor.Attributes['signal'] ?? null;

    switch (ev.Action) {
      case 'create':
        await append(sessionId, 'container_create', { actorId: ev.Actor.ID }, 'info');
        break;

      case 'start':
        await append(sessionId, 'container_start', { actorId: ev.Actor.ID }, 'info');
        break;

      case 'stop':
        await append(sessionId, 'container_stop', { actorId: ev.Actor.ID, signal }, 'info');
        break;

      case 'destroy':
        await append(sessionId, 'container_destroy', { actorId: ev.Actor.ID }, 'info');
        break;

      case 'oom':
        await append(sessionId, 'container_oom', { actorId: ev.Actor.ID }, 'error');
        // OOM almost always implies the container is dying — handler for `die`
        // will flip the session status. Mark recoverable defensively here in
        // case `die` is delayed/lost.
        await markUnexpectedDeath(session.id, 'oom', 137);
        break;

      case 'die': {
        const code = exitCode != null ? Number(exitCode) : null;
        await append(
          sessionId,
          'container_die',
          { actorId: ev.Actor.ID, exitCode: code, signal },
          code === 0 ? 'info' : 'error',
        );
        // If the session is already terminal (ended/error) the death was
        // initiated by us — nothing to do. Otherwise treat as unexpected.
        const current = await sessionsDal.findById(sessionId);
        if (!current) break;
        if (current.status === 'running' || current.status === 'initializing' || current.status === 'saving') {
          await markUnexpectedDeath(current.id, code === 0 ? 'exited' : 'crash', code);
        }
        break;
      }

      case 'health_status: healthy':
      case 'health_status: unhealthy':
        await append(
          sessionId,
          'container_ready',
          { health: ev.Action.endsWith('healthy') ? 'healthy' : 'unhealthy' },
          ev.Action.endsWith('unhealthy') ? 'warn' : 'info',
        );
        break;

      default:
        // Ignore noisy actions (exec_create, exec_start, attach, etc.)
        break;
    }
  } catch (err) {
    logger.error({ err, sessionId, action: ev.Action }, 'lifecycleService: handler failure');
  }
}

async function append(
  sessionId: string,
  type: string,
  payload: Record<string, unknown>,
  level: 'info' | 'warn' | 'error',
): Promise<void> {
  try {
    await sessionEventsDal.append({ sessionId, type, payload, level });
  } catch (err) {
    logger.warn({ err, sessionId, type }, 'failed to append session_event');
  }
}

async function markUnexpectedDeath(
  sessionId: string,
  reason: 'crash' | 'exited' | 'oom',
  exitCode: number | null,
): Promise<void> {
  // Crashes / OOMs → recoverable so the user can resume from durable state
  // (Phase 11 file restore). A clean exit-0 we treat as `recoverable` too —
  // the candidate may have stopped the dev server themselves and want it back.
  const next = reason === 'oom' ? 'recoverable' : 'recoverable';
  await sessionsDal.updateStatus(sessionId, next);
  await append(
    sessionId,
    'error',
    { reason, exitCode, message: 'container died unexpectedly — session marked recoverable' },
    'error',
  );
  logger.warn({ sessionId, reason, exitCode }, 'session marked recoverable after unexpected death');
}

// ---------------------------------------------------------------------------

async function pollAllStats(): Promise<void> {
  try {
    const active = await sessionsDal.listActive();
    await Promise.all(
      active
        .filter((s) => s.containerId && s.status === 'running')
        .map(async (s) => {
          const snap = await snapshotStats(s.containerId!);
          if (snap) statsCache.set(s.containerId!, { ...snap, at: Date.now() });
        }),
    );
  } catch (err) {
    logger.warn({ err }, 'stats poller error');
  }
}
