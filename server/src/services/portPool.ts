/**
 * Tiny in-memory host-preview port pool.
 *
 * Phase 6 placeholder — Phase 9 will harden this (e.g. cross-process safety
 * via Postgres advisory locks, range re-checking after restart). For now,
 * single-process, hydrated from DB on boot so we never double-allocate after
 * a server restart.
 */
import { config } from '@/config/index.js';
import { sessionsDal } from '@/dal/index.js';
import { logger } from '@/utils/logger.js';

let taken = new Set<number>();
let initialized = false;

export const portPool = {
  /** Read currently-allocated ports out of `sessions` and seed the set. */
  async hydrate(): Promise<void> {
    const used = await sessionsDal.getAllocatedPorts();
    taken = new Set(used);
    initialized = true;
    logger.info(
      { used: used.length, range: `${config.PREVIEW_PORT_MIN}-${config.PREVIEW_PORT_MAX}` },
      'portPool hydrated',
    );
  },

  /** Lowest free port in [PREVIEW_PORT_MIN, PREVIEW_PORT_MAX], or null if exhausted. */
  allocate(): number | null {
    if (!initialized) throw new Error('portPool.allocate called before hydrate()');
    for (let p = config.PREVIEW_PORT_MIN; p <= config.PREVIEW_PORT_MAX; p++) {
      if (!taken.has(p)) {
        taken.add(p);
        return p;
      }
    }
    return null;
  },

  release(port: number | null | undefined): void {
    if (port == null) return;
    taken.delete(port);
  },

  /** Test-only: snapshot of current allocations. */
  snapshot(): number[] {
    return [...taken].sort((a, b) => a - b);
  },
};
