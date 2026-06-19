import { Router } from 'express';
import { pingDb } from '@/db/connection.js';
import { pingDocker } from '@/services/containerService.js';

export const healthRouter = Router();

/**
 * Liveness — process is alive. Used by orchestrators to know whether to
 * restart the container; should never fail unless the event loop is wedged.
 */
healthRouter.get('/healthz', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

/**
 * Readiness — process can serve a request RIGHT NOW. Returns 503 if either
 * downstream dependency is unreachable, so load balancers / dashboards know
 * to drain traffic.
 */
healthRouter.get('/readyz', async (_req, res) => {
  const [db, docker] = await Promise.all([pingDb(), pingDocker()]);
  const ok = db && docker;
  res.status(ok ? 200 : 503).json({
    status: ok ? 'ready' : 'not_ready',
    checks: { db, docker },
    uptime: process.uptime(),
  });
});
