/**
 * Orchestration brain. All session lifecycle decisions flow through here.
 *
 * Hard rule: every DB read/write goes through the DAL; every Docker call
 * goes through containerService. This file is the only place that touches
 * BOTH.
 */
import { config } from '@/config/index.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ContainerError,
  ValidationError,
} from '@/errors/index.js';
import { logger } from '@/utils/logger.js';
import { sessionsDal, sessionEventsDal, candidatesDal } from '@/dal/index.js';
import type { Session } from '@/db/schema/index.js';
import {
  containerDevPort,
  containerName,
  createContainer,
  createVolume,
  imageTag,
  inspectContainer,
  removeContainer,
  removeContainerByName,
  removeVolume,
  startContainer,
  stopContainer,
  streamLogs,
  tailLogs,
  volumeExists,
  volumeName,
  getDocker,
  execBestEffort,
} from './containerService.js';
import { randomBytes } from 'node:crypto';
import { dbKindFor } from './dbShell.js';
import { sharePresence } from './sharePresence.js';
import { forwardToContainer, type ProxyMethod, type ProxyResult } from './apiProxy.js';
import { persistAllFiles, pruneHeavyDirs } from './fileSync.js';
import { validateCustomization } from './frameworkConfig.js';
import { portPool } from './portPool.js';
import { lifecycleService } from './lifecycleService.js';
import { terminalManager } from './terminalManager.js';
import { previewForSession, type PreviewInfo } from './previewService.js';

export interface CreateSessionRequest {
  framework: string;
  customization: unknown;
  /**
   * Phase 30d: optional link to a candidates row. Must be within the
   * interviewer's specialization-type scope; rejected with ForbiddenError
   * otherwise. NEVER constrains framework/customization choices.
   */
  candidateRecordId?: string;
}

/**
 * Resolve a candidate for the given interviewer and snapshot the fields the
 * history surface depends on. Throws NotFoundError if the row is missing or
 * soft-deleted; throws ForbiddenError if the candidate's interview-type set
 * does not intersect the interviewer's specializations.
 */
async function resolveCandidateForInterviewer(
  interviewerId: string,
  candidateRecordId: string,
): Promise<{ candidateRecordId: string; candidateId: string }> {
  const cand = await candidatesDal.findById(candidateRecordId);
  if (!cand) throw new NotFoundError(`Candidate ${candidateRecordId} not found`);
  const ok = await candidatesDal.isInInterviewerScope(interviewerId, candidateRecordId);
  if (!ok) throw new ForbiddenError('Candidate is outside your specialization types');
  return { candidateRecordId: cand.id, candidateId: cand.externalId };
}

export const sessionService = {
  /**
   * POST /sessions handler core.
   * Enforces the HARD one-session rule and validates the customization
   * BEFORE allocating any host resources (port, volume, container).
   */
  async createSession(userId: string, req: CreateSessionRequest): Promise<Session> {
    // 1. Validate customization first — cheap, no side effects.
    const { framework, selection } = validateCustomization(req.framework, req.customization);

    // 1b. If a candidate is being attached at create-time, validate it now
    // BEFORE we allocate any host resources. Frameworks are NEVER gated by
    // interviewer type — only candidate visibility is.
    let candidateSnapshot: { candidateRecordId: string; candidateId: string } | null = null;
    if (req.candidateRecordId) {
      candidateSnapshot = await resolveCandidateForInterviewer(userId, req.candidateRecordId);
    }

    // 2. Concurrency cap (defense-in-depth alongside per-user 1-session rule).
    const active = await sessionsDal.listActive();
    if (active.length >= config.MAX_CONCURRENT_SESSIONS) {
      throw new ConflictError(
        `Host concurrency cap reached (${config.MAX_CONCURRENT_SESSIONS}) — wait for sessions to free up`,
      );
    }

    // 3. Make sure the image exists. We want a clean 400 here instead of a
    // dockerode "image not found" surfacing as a 500 later.
    try {
      await getDocker().getImage(imageTag(framework.id)).inspect();
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode === 404) {
        throw new ValidationError(
          `Base image for framework=${framework.id} is not built. Run: bash docker/scripts/build-all.sh ${framework.id}`,
        );
      }
      throw err;
    }

    // 4. Allocate a host preview port — ONLY in localhost mode. In subdomain
    // mode the container is reached via Traefik over the sandbox network, so
    // no host port is published. Cpp has no preview either way.
    const hasPreview = containerDevPort(framework.id, selection) != null;
    const needsPort = hasPreview && config.PREVIEW_MODE === 'localhost';
    let hostPort: number | null = null;
    if (needsPort) {
      hostPort = portPool.allocate();
      if (hostPort == null) {
        throw new ConflictError('No free host preview ports — please retry shortly');
      }
    }

    // 5. Create the session row. `sessionsDal.createSession` enforces the
    // hard one-session-per-user rule at BOTH the DAL pre-check AND the DB
    // partial unique index (race-proof).
    let session: Session;
    try {
      session = await sessionsDal.createSession({
        userId,
        framework: framework.id,
        customization: selection as Record<string, unknown>,
      });
    } catch (err) {
      // Pre-allocated resources must be returned on failure.
      portPool.release(hostPort);
      throw err;
    }

    // 6. Stamp metadata that we now know.
    const vol = volumeName(session.id);
    const stamp: Parameters<typeof sessionsDal.update>[1] = {
      volumeName: vol,
      hostPreviewPort: hostPort,
    };
    if (candidateSnapshot) {
      stamp.candidateRecordId = candidateSnapshot.candidateRecordId;
      stamp.candidateId = candidateSnapshot.candidateId;
    }
    session = (await sessionsDal.update(session.id, stamp)) ?? session;

    // 7. Kick off async init. We do NOT await it — the route returns 201
    // immediately with the pending row; the client polls /sessions/:id and
    // /sessions/:id/events (and later subscribes via socket).
    void runInitPipeline(session).catch((err) => {
      logger.error({ err, sessionId: session.id }, 'runInitPipeline crashed');
    });

    return session;
  },

  // -------------------------------------------------------------------------

  async getSession(userId: string, sessionId: string): Promise<Session> {
    const s = await sessionsDal.requireById(sessionId);
    if (s.userId !== userId) throw new ForbiddenError();
    return s;
  },

  /**
   * Phase 30d — PATCH /sessions/:id/candidate. Attaches/clears a candidate
   * link on a live session. `null` clears both `candidateRecordId` AND the
   * snapshot `candidateId`. Setting a uuid validates the candidate is within
   * the interviewer's specialization scope (same gate as create-time).
   */
  async attachCandidate(
    userId: string,
    sessionId: string,
    candidateRecordId: string | null,
  ): Promise<Session> {
    const s = await sessionsDal.requireById(sessionId);
    if (s.userId !== userId) throw new ForbiddenError();
    if (candidateRecordId == null) {
      return (
        (await sessionsDal.update(sessionId, {
          candidateRecordId: null,
          candidateId: null,
        })) ?? s
      );
    }
    const snap = await resolveCandidateForInterviewer(userId, candidateRecordId);
    return (
      (await sessionsDal.update(sessionId, {
        candidateRecordId: snap.candidateRecordId,
        candidateId: snap.candidateId,
      })) ?? s
    );
  },

  /** Computed once-per-request preview metadata. Pure on the session row. */
  getPreview(session: Session): PreviewInfo {
    return previewForSession(session);
  },

  /**
   * Proxy an API-client request to THIS session's container dev server over
   * loopback (no CORS). The caller controls only method/path/headers/body — the
   * target host:port is fixed to the session's own preview port, so this is not
   * a general-purpose (SSRF) proxy.
   */
  async proxyRequest(
    userId: string,
    sessionId: string,
    payload: { method: ProxyMethod; path: string; headers: Array<{ name: string; value: string }>; body?: Buffer },
  ): Promise<ProxyResult> {
    const s = await this.getSession(userId, sessionId); // ownership check
    // The API-client tab is part of the read-only set: while a candidate holds
    // the shared session, the interviewer can't drive it.
    if (sharePresence.isCandidatePresent(s.id)) {
      throw new ConflictError('Session is read-only — a candidate is currently editing');
    }
    return forwardToSession(s, payload);
  },

  /** Candidate (unauthenticated) variant — resolves the session by share token. */
  async proxyRequestByToken(
    token: string,
    payload: { method: ProxyMethod; path: string; headers: Array<{ name: string; value: string }>; body?: Buffer },
  ): Promise<ProxyResult> {
    const s = await sessionsDal.findByShareToken(token);
    if (!s) throw new NotFoundError('Invalid or expired share link');
    return forwardToSession(s, payload);
  },

  /**
   * Enable sharing: mint (once) an unguessable token the interviewer hands to a
   * candidate. Only the owner of a LIVE (non-terminal) session can share it.
   * Idempotent — returns the existing token if already shared.
   */
  async enableSharing(userId: string, sessionId: string): Promise<{ shareToken: string }> {
    const s = await this.getSession(userId, sessionId); // ownership check
    if (s.status === 'ended' || s.status === 'error') {
      throw new ConflictError('Cannot share a session that has already ended');
    }
    if (s.shareToken) return { shareToken: s.shareToken };
    const token = randomBytes(24).toString('base64url'); // ~32 chars, unguessable
    const updated = await sessionsDal.setShareToken(sessionId, token);
    return { shareToken: updated?.shareToken ?? token };
  },

  /** Revoke sharing — the existing link stops working immediately. */
  async disableSharing(userId: string, sessionId: string): Promise<void> {
    const s = await this.getSession(userId, sessionId); // ownership check
    if (s.shareToken) await sessionsDal.setShareToken(sessionId, null);
  },

  /** Resolve a session by share token (candidate path — no auth). */
  async getByShareToken(token: string): Promise<Session | null> {
    return sessionsDal.findByShareToken(token);
  },

  async getEvents(userId: string, sessionId: string) {
    await this.getSession(userId, sessionId); // ownership check
    return sessionEventsDal.listForSession(sessionId, 1_000);
  },

  /**
   * Inspect endpoint: latest stats + recent container logs + key fields from
   * `docker inspect`. Used by the loader UI and the admin inspect view.
   */
  async inspectSession(userId: string, sessionId: string) {
    const s = await this.getSession(userId, sessionId);
    if (!s.containerId) {
      return { session: s, container: null, stats: null, logs: '' };
    }
    const [inspect, logs] = await Promise.all([
      inspectContainer(s.containerId),
      tailLogs(s.containerId, 200),
    ]);
    return {
      session: s,
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
          }
        : null,
      stats: s.containerId ? lifecycleService.getStatsCache(s.containerId) : null,
      logs,
    };
  },

  /**
   * DELETE /sessions/:id — explicit close.
   *
   * Order matters. We persist files BEFORE pruning + stopping so a crash
   * mid-close still leaves the volume intact AND the durable copy current.
   *
   *  1. status = saving (broadcasts via lifecycle event)
   *  2. persistAllFiles  → ensure session_files matches the volume
   *  3. pruneHeavyDirs   → reclaim disk (node_modules, .venv, vendor, dist, …)
   *  4. closeAllForSession terminals → unblocks PTY streams cleanly
   *  5. stopContainer / removeContainer
   *  6. release port
   *  7. status = ended, ended_at = now
   *
   * For a session already in `recoverable` (container gone), steps 2–5 are
   * skipped — the durable copy from earlier WS writes is the source of
   * truth and we just need to tidy the row and release the port.
   *
   * Volumes are KEPT (per spec — local-disk storage, forensic / re-resume).
   * Phase 12's reaper can age them out separately.
   */
  async closeSession(
    userId: string,
    sessionId: string,
    closeInput: { candidateRating?: number; candidateId?: string } = {},
  ): Promise<Session> {
    const s = await this.getSession(userId, sessionId);
    if (s.status === 'ended') return s;

    // Sharing ends with the session: drop the token so a stale link can't be
    // reused, and forget any candidate presence.
    sharePresence.forget(s.id);
    if (s.shareToken) await sessionsDal.setShareToken(s.id, null);

    // Phase 25: persist the candidate rating + id BEFORE any teardown so the
    // values survive even if save/prune/destroy throws mid-close. Both
    // fields are optional; absent leaves the column untouched.
    const closeMeta: Partial<{ candidateRating: number; candidateId: string }> = {};
    if (closeInput.candidateRating !== undefined) closeMeta.candidateRating = closeInput.candidateRating;
    if (closeInput.candidateId !== undefined) closeMeta.candidateId = closeInput.candidateId;
    if (Object.keys(closeMeta).length > 0) {
      await sessionsDal.update(s.id, closeMeta);
    }

    // Recoverable → container already gone; simplified close.
    if (s.status === 'recoverable') {
      await sessionEventsDal.append({
        sessionId: s.id,
        type: 'session_close',
        level: 'info',
        payload: { initiated_by: 'user', from: 'recoverable' },
      });
      portPool.release(s.hostPreviewPort);
      const updated = await sessionsDal.markEnded(s.id);
      return updated ?? s;
    }

    // ---- 1. mark saving ----
    await sessionsDal.update(s.id, { status: 'saving' });
    await sessionEventsDal.append({
      sessionId: s.id,
      type: 'session_close',
      level: 'info',
      payload: { initiated_by: 'user', phase: 'saving' },
    });

    // ---- 2. persist files ----
    let saveCounts = { scanned: 0, persisted: 0, skipped: 0, failed: 0 };
    if (s.containerId) {
      try {
        saveCounts = await persistAllFiles(s.id, s.containerId);
      } catch (err) {
        logger.warn({ err, sessionId: s.id }, 'persistAllFiles failed — proceeding with close');
        await sessionEventsDal.append({
          sessionId: s.id,
          type: 'error',
          level: 'warn',
          payload: { step: 'persistAllFiles', message: (err as Error).message },
        });
      }
    }
    await sessionEventsDal.append({
      sessionId: s.id,
      type: 'session_close',
      level: 'info',
      payload: { phase: 'persisted', ...saveCounts },
    });

    // ---- 3. prune heavy dirs (best effort) ----
    if (s.containerId) {
      try {
        const prune = await pruneHeavyDirs(s.containerId);
        await sessionEventsDal.append({
          sessionId: s.id,
          type: 'session_close',
          level: 'info',
          payload: { phase: 'pruned', ...prune },
        });
      } catch (err) {
        logger.warn({ err, sessionId: s.id }, 'pruneHeavyDirs failed — continuing');
      }
    }

    // ---- 3.5 stop the in-container database cleanly (flush before kill) ----
    if (s.containerId) {
      await stopDatabases(s.containerId, s.framework, s.customization as Record<string, unknown>);
    }

    // ---- 4–5. terminals + container ----
    try {
      await terminalManager.closeAllForSession(s.id);
      if (s.containerId) {
        await stopContainer(s.containerId, 10);
        await removeContainer(s.containerId);
      }
    } catch (err) {
      logger.warn({ err, sessionId: s.id }, 'container stop/remove during close failed');
    }

    // ---- 6. release port ----
    portPool.release(s.hostPreviewPort);

    // ---- 7. status = ended ----
    const updated = await sessionsDal.markEnded(s.id);
    await sessionEventsDal.append({
      sessionId: s.id,
      type: 'session_close',
      level: 'info',
      payload: { phase: 'ended' },
    });
    return updated ?? s;
  },

  /**
   * GET /sessions/recoverable — dashboard surfaces the user's **current**
   * non-terminal session, if any. Returns null only when the user has no
   * active or recoverable session.
   *
   * The endpoint name is historical (Phase 11 originally targeted only the
   * `recoverable` state). The hard one-session rule guarantees AT MOST ONE
   * non-terminal session per user, so "current" and "recoverable" collapse
   * to the same row whenever they exist.
   *
   * The dashboard chooses its UX by branching on `session.status`:
   *   - `pending` / `initializing`        → "Loading…" (in-flight create)
   *   - `running`                          → "Continue session" (rejoin live)
   *   - `saving`                           → "Closing…" (in-flight DELETE)
   *   - `recoverable`                      → "Resume previous session"
   *
   * Either way, the one-session rule means the dashboard must hide
   * "Start new session" while this returns non-null.
   */
  async getRecoverableForUser(userId: string) {
    const s = await sessionsDal.getActiveSessionForUser(userId);
    if (!s) return null;
    return { session: s, preview: this.getPreview(s) };
  },

  /**
   * POST /sessions/:id/resume — rehydrate a `recoverable` session.
   *
   *  1. Verify status === recoverable AND ownership.
   *  2. Verify the named volume still exists (local-disk durable state).
   *     If it's gone → 410: mark ended, tell the user the workspace was lost.
   *  3. Allocate a fresh host preview port.
   *  4. Tear down any stale container with our name (lifecycle may have left
   *     a stopped one behind on `die`).
   *  5. Reset the row → status=pending, new port, container_id=null.
   *  6. Kick off the same init pipeline as createSession. Init scripts'
   *     "existing project detected" branch runs `npm install` / `pip install`
   *     / `go mod download` to rehydrate the heavy deps that close pruned.
   */
  async resumeSession(userId: string, sessionId: string): Promise<Session> {
    const s = await sessionsDal.requireById(sessionId);
    if (s.userId !== userId) throw new ForbiddenError();
    // Already-live statuses: resume is a no-op. The dashboard's "Continue
    // session" path on a `running` row, or a double-click while init is
    // still in flight, both land here — the right answer is "the session is
    // already what you want", not 409. Only `recoverable` actually needs to
    // re-run the resume pipeline; ended/error are terminal and stay 409.
    if (
      s.status === 'running' ||
      s.status === 'initializing' ||
      s.status === 'pending' ||
      s.status === 'saving'
    ) {
      return s;
    }
    if (s.status !== 'recoverable') {
      throw new ConflictError(`Session is not recoverable (status=${s.status})`);
    }
    if (!s.volumeName) {
      throw new ConflictError('Session has no volume — cannot resume');
    }

    if (!(await volumeExists(s.volumeName))) {
      logger.error({ sessionId, volume: s.volumeName }, 'resume: volume missing');
      await sessionsDal.update(s.id, { status: 'error', endedAt: new Date() });
      throw new NotFoundError('Session data was lost — volume missing');
    }

    // Allocate fresh port if the framework has one — localhost mode only.
    const hasPreview = containerDevPort(s.framework, s.customization as Record<string, unknown>) != null;
    const needsPort = hasPreview && config.PREVIEW_MODE === 'localhost';
    let hostPort: number | null = null;
    if (needsPort) {
      hostPort = portPool.allocate();
      if (hostPort == null) throw new ConflictError('No free preview ports — please retry shortly');
    }

    // Remove any stale container with our name (Phase 6 lifecycle may have
    // left a dead one behind on `die`).
    await removeContainerByName(containerName(s.id));

    // Reset row to pending + new port. endedAt cleared so the row reads as alive again.
    const updated = await sessionsDal.update(s.id, {
      status: 'pending',
      hostPreviewPort: hostPort,
      containerId: null,
      endedAt: null,
    });
    if (!updated) throw new NotFoundError('Session disappeared mid-resume');

    await sessionEventsDal.append({
      sessionId: s.id,
      type: 'session_resume',
      level: 'info',
      payload: { hostPort, initiated_by: 'user' },
    });

    // Same init pipeline as createSession — init script's resume branch
    // handles the existing-project case.
    void runInitPipeline(updated).catch((err) => {
      logger.error({ err, sessionId: s.id }, 'resume init pipeline crashed');
    });

    return updated;
  },

  // -------------------------------------------------------------------------
  // Graceful shutdown
  // -------------------------------------------------------------------------

  /**
   * Called from utils/shutdown.ts. For each non-terminal session:
   *   - mark status='recoverable'
   *   - docker stop the container (SIGTERM, 10s timeout)
   *   - LEAVE the volume + container intact so resume can pick up
   *
   * Volumes stay because they hold the candidate's source. Containers stay
   * (stopped) so the orchestrator can identify previously-owned containers
   * by label on the next boot.
   */
  async handleShutdown(): Promise<void> {
    const active = await sessionsDal.listActive();
    logger.info({ count: active.length }, 'handleShutdown: stopping running containers');
    for (const s of active) {
      try {
        await sessionsDal.updateStatus(s.id, 'recoverable');
        await sessionEventsDal.append({
          sessionId: s.id,
          type: 'session_close',
          level: 'info',
          payload: { initiated_by: 'shutdown', reason: 'server shutting down' },
        });
        if (s.containerId) {
          await stopDatabases(s.containerId, s.framework, s.customization as Record<string, unknown>);
          await stopContainer(s.containerId, 10);
        }
      } catch (err) {
        logger.warn({ err, sessionId: s.id }, 'shutdown: container stop failed');
      }
    }
  },
};

/**
 * Shared forwarder for both proxy entry points (authed + token). Validates the
 * session is live + has a preview port, then forwards over loopback.
 */
function forwardToSession(
  s: Session,
  payload: { method: ProxyMethod; path: string; headers: Array<{ name: string; value: string }>; body?: Buffer },
): Promise<ProxyResult> {
  if (s.status !== 'running') {
    throw new ConflictError(`Session is not running (status=${s.status}) — start it before sending requests`);
  }
  const devPort = containerDevPort(s.framework, s.customization as Record<string, unknown>);
  if (devPort == null) {
    throw new ValidationError('This session has no HTTP preview port to send requests to');
  }
  if (config.PREVIEW_MODE === 'localhost' && s.hostPreviewPort == null) {
    throw new ValidationError('This session has no HTTP preview port to send requests to');
  }
  return forwardToContainer({
    hostPort: config.PREVIEW_MODE === 'localhost' ? s.hostPreviewPort : null,
    containerName: containerName(s.id),
    containerPort: devPort,
    method: payload.method,
    path: payload.path,
    headers: payload.headers,
    body: payload.body,
  });
}

/**
 * Best-effort clean shutdown of an in-container database engine before the
 * container is stopped — flushes a checkpoint so the next resume starts without
 * crash recovery. Never throws (the container is going away regardless).
 */
async function stopDatabases(
  containerId: string,
  framework: string,
  customization: Record<string, unknown>,
): Promise<void> {
  const kind = dbKindFor(framework, customization);
  if (kind === 'postgres') {
    await execBestEffort(containerId, ['pg_ctl', '-D', '/sandbox/.pgdata', '-m', 'fast', '-w', '-t', '20', 'stop']);
  } else if (kind === 'mongo') {
    await execBestEffort(containerId, ['mongod', '--dbpath', '/sandbox/.mongo', '--shutdown']);
  } else if (kind === 'mysql') {
    await execBestEffort(containerId, ['mariadb-admin', '-h', '127.0.0.1', '-u', 'root', 'shutdown']);
  }
}

// ---------------------------------------------------------------------------
// Init pipeline (private)
// ---------------------------------------------------------------------------

async function runInitPipeline(session: Session): Promise<void> {
  let containerId: string | null = null;

  try {
    // ---- 1. volume ----
    await createVolume(volumeName(session.id));
    await event(session.id, 'container_create', { step: 'volume' }, 'info');

    // ---- 2. create container ----
    const c = await createContainer({
      sessionId: session.id,
      userId: session.userId,
      framework: session.framework,
      customization: session.customization as Record<string, unknown>,
      hostPort: session.hostPreviewPort,
    });
    containerId = c.id;
    await sessionsDal.update(session.id, { containerId });
    await event(session.id, 'container_create', { containerId, name: containerName(session.id) }, 'info');

    // ---- 3. start ----
    await startContainer(c);
    await sessionsDal.markStarted(session.id); // → initializing
    await event(session.id, 'container_start', { containerId }, 'info');

    // ---- 4. stream init progress ----
    const ready = waitForInitReady(session.id, containerId);
    await ready;

    // ---- 5. mark running ----
    const updated = await sessionsDal.update(session.id, { status: 'running' });
    await event(session.id, 'container_ready', { containerId }, 'info');
    const preview = previewForSession(updated ?? session);
    if (preview.kind !== 'none') {
      await event(
        session.id,
        'preview_ready',
        {
          hostPort: session.hostPreviewPort,
          url: preview.url,
          kind: preview.kind,
          hint: preview.hint,
        },
        'info',
      );
    }
    logger.info({ sessionId: session.id, containerId }, 'session running');
  } catch (err) {
    logger.error({ err, sessionId: session.id }, 'init pipeline failed — cleaning up');
    await event(
      session.id,
      'error',
      {
        step: 'init',
        message: err instanceof Error ? err.message : String(err),
      },
      'error',
    );
    await cleanupFailedInit(session, containerId);
  }
}

function waitForInitReady(sessionId: string, containerId: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new ContainerError(`init timed out after ${config.INIT_TIMEOUT_MS}ms`));
    }, config.INIT_TIMEOUT_MS);
    timer.unref();

    let resolved = false;

    const cancel = streamLogs(containerId, (line) => {
      if (!line.startsWith('PROGRESS ')) return;
      const blob = line.slice('PROGRESS '.length);
      let parsed: { step?: string; status?: string; pct?: number; msg?: string };
      try {
        parsed = JSON.parse(blob);
      } catch {
        return;
      }
      // Persist each PROGRESS line as a session_event so the UI can replay.
      void sessionEventsDal
        .append({
          sessionId,
          type: parsed.step === 'ready' && parsed.status === 'done' ? 'preview_ready' : 'ws_init',
          payload: { ...parsed, raw: blob },
          level: parsed.status === 'error' ? 'error' : 'info',
        })
        .catch(() => undefined);

      if (parsed.status === 'error') {
        cleanup();
        reject(new ContainerError(`init script reported error: ${parsed.msg ?? 'unknown'}`));
        return;
      }
      if (parsed.step === 'ready' && parsed.status === 'done' && !resolved) {
        resolved = true;
        cleanup();
        resolve();
      }
    });

    function cleanup(): void {
      clearTimeout(timer);
      cancel();
    }
  });
}

async function cleanupFailedInit(session: Session, containerId: string | null): Promise<void> {
  // Update status first so the route handler / events listener see the right state.
  await sessionsDal.update(session.id, { status: 'error', endedAt: new Date() });

  if (containerId) {
    try {
      await stopContainer(containerId, 5);
    } catch (err) {
      logger.warn({ err, containerId }, 'cleanup: stop failed');
    }
    try {
      await removeContainer(containerId);
    } catch (err) {
      logger.warn({ err, containerId }, 'cleanup: remove failed');
    }
  }
  try {
    await removeVolume(volumeName(session.id));
  } catch (err) {
    logger.warn({ err, sessionId: session.id }, 'cleanup: volume remove failed');
  }
  portPool.release(session.hostPreviewPort);
}

async function event(
  sessionId: string,
  type: string,
  payload: Record<string, unknown>,
  level: 'info' | 'warn' | 'error',
): Promise<void> {
  await sessionEventsDal
    .append({ sessionId, type, payload, level })
    .catch((err) => logger.warn({ err, sessionId, type }, 'event append failed'));
}
