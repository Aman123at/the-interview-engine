/**
 * Admin-only inspect surface.
 *
 *   GET /admin/sessions/:id  — full inspect view for ANY session
 *   GET /admin/sessions      — list recent sessions across all users
 *
 * Permission gating uses Phase 2's requireRole('admin'). Bumping a user to
 * admin is a one-line UPDATE on `users.role` (no UI for it in v1).
 */
import { Router } from 'express';
import { adminListSessionsQuery, sessionIdParams } from '@/contracts/index.js';
import { requireAuth, requireRole } from '@/middleware/auth.js';
import { sessionsDal, sessionEventsDal } from '@/dal/index.js';
import {
  inspectContainer,
  tailLogs,
} from '@/services/containerService.js';
import { lifecycleService } from '@/services/lifecycleService.js';
import { sessionService } from '@/services/sessionService.js';
import { reaperService } from '@/services/reaperService.js';
import { portPool } from '@/services/portPool.js';
import { NotFoundError } from '@/errors/index.js';
import { hrManagementRouter } from '@/routes/adminStaff.js';

/**
 * Admin-only routes, mounted at /admin in app.ts. Guards are attached PER ROUTE
 * (not via `router.use`) so the router only enforces requireRole('admin') for
 * paths it actually handles — otherwise the chain would also reject HR users
 * trying to reach the staffSharedRouter (interviewer mgmt) mounted at the
 * same /admin prefix.
 */
const adminGuards = [requireAuth, requireRole('admin')] as const;

export const adminRouter = Router();
// Phase 30b — HR management routes (admin only). Mount path-scoped under
// /hrs so its guards run ONLY for /admin/hrs* requests — otherwise they'd
// fire on HR's /admin/interview-types and 403 them.
adminRouter.use('/hrs', ...adminGuards, hrManagementRouter);

// GET /admin/sessions — recent sessions for any user
adminRouter.get('/sessions', ...adminGuards, async (req, res, next) => {
  try {
    const q = adminListSessionsQuery.parse({ limit: req.query.limit ?? 50 });
    const limit = q.limit ?? 50;
    // We don't have a "listAll" today; sessionsDal.listActive + a sample of ended.
    const active = await sessionsDal.listActive();
    res.json({
      active: active.map((s) => ({
        ...s,
        preview: sessionService.getPreview(s),
      })),
      limit,
    });
  } catch (err) {
    next(err);
  }
});

// GET /admin/sessions/:id — full inspect for ANY session
adminRouter.get('/sessions/:id', ...adminGuards, async (req, res, next) => {
  try {
    const { id } = sessionIdParams.parse({ id: req.params.id });
    const session = await sessionsDal.findById(id);
    if (!session) throw new NotFoundError(`Session ${id} not found`);

    const [events, inspect, logs] = await Promise.all([
      sessionEventsDal.listForSession(session.id, 500),
      session.containerId ? inspectContainer(session.containerId) : Promise.resolve(null),
      session.containerId ? tailLogs(session.containerId, 200) : Promise.resolve(''),
    ]);

    res.json({
      session,
      preview: sessionService.getPreview(session),
      events,
      container: inspect
        ? {
            id: inspect.Id,
            state: inspect.State.Status,
            running: inspect.State.Running,
            exitCode: inspect.State.ExitCode,
            startedAt: inspect.State.StartedAt,
            finishedAt: inspect.State.FinishedAt,
            health: inspect.State.Health?.Status ?? null,
            oomKilled: inspect.State.OOMKilled ?? false,
            restartCount: inspect.RestartCount,
            error: inspect.State.Error || null,
          }
        : null,
      stats: session.containerId ? lifecycleService.getStatsCache(session.containerId) : null,
      logs,
    });
  } catch (err) {
    next(err);
  }
});

// GET /admin/health — full picture of host state
adminRouter.get('/health', ...adminGuards, async (_req, res, next) => {
  try {
    const reaper = await reaperService._stats();
    res.json({
      reaper,
      portPool: { allocated: portPool.snapshot() },
    });
  } catch (err) {
    next(err);
  }
});
