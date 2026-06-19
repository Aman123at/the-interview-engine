import { Router } from 'express';
import { requireAuth, requireRole } from '@/middleware/auth.js';
import { sessionService } from '@/services/sessionService.js';
import {
  attachCandidateRequest,
  closeSessionRequest,
  createSessionRequest,
  proxyRequest as proxyRequestSchema,
  sessionIdParams,
  sessionsHistoryQuery,
  type SessionHistoryItem,
  type SessionsHistoryResponse,
} from '@/contracts/index.js';
import { sessionsDal } from '@/dal/sessionsDal.js';
import { sessionEventsDal } from '@/dal/sessionEventsDal.js';
import { summarizeCustomization } from '@/services/frameworkConfig.js';
import { volumeExists, getDocker, removeVolume } from '@/services/containerService.js';
import { streamCodeZip, EXPORT_HELPER_IMAGE } from '@/services/codeExportService.js';
import { ConflictError, NotFoundError, VolumeUnavailableError } from '@/errors/index.js';
import {
  deleteSessionFromHistoryRequest,
  type DeleteSessionFromHistoryResponse,
} from '@/contracts/index.js';

export const sessionsRouter = Router();

sessionsRouter.use(requireAuth);

const parseSessionId = (id: unknown) => sessionIdParams.parse({ id }).id;

// GET /sessions/history — past code sessions for this user (Phase 22).
// MUST come before /sessions/:id so the literal segment doesn't parse as an id.
sessionsRouter.get('/sessions/history', async (req, res, next) => {
  try {
    const q = sessionsHistoryQuery.parse(req.query);
    const { items, nextCursor } = await sessionsDal.listHistoryForUser(req.user!.id, {
      limit: q.limit,
      cursor: q.cursor ?? null,
    });
    const out: SessionHistoryItem[] = items.map((s) => ({
      id: s.id,
      framework: s.framework,
      customizationSummary: summarizeCustomization(s.framework, s.customization),
      status: s.status,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      lastActiveAt: s.lastActiveAt,
      candidateRating: s.candidateRating,
      candidateId: s.candidateId,
      // Metadata-level flag only; Phase 23's download endpoint does the
      // live Docker volume existence check + fallback to session_files.
      downloadable: !!s.volumeName && !s.volumeDeleted,
    }));
    const body: SessionsHistoryResponse = { items: out, nextCursor };
    res.json(body);
  } catch (err) {
    next(err);
  }
});

// GET /sessions/recoverable — must come BEFORE /sessions/:id so the path
// segment isn't parsed as a sessionId.
sessionsRouter.get('/sessions/recoverable', async (req, res, next) => {
  try {
    console.log("USERIDDD", req.user!.id)
    const r = await sessionService.getRecoverableForUser(req.user!.id);
    res.json(r ?? { session: null, preview: null });
  } catch (err) {
    next(err);
  }
});

// POST /sessions/:id/resume — rehydrate a recoverable session
sessionsRouter.post('/sessions/:id/resume', async (req, res, next) => {
  try {
    const id = parseSessionId(req.params.id);
    const session = await sessionService.resumeSession(req.user!.id, id);
    req.log.info({ sessionId: session.id }, 'session resume initiated');
    res.status(202).json({ session, preview: sessionService.getPreview(session) });
  } catch (err) {
    next(err);
  }
});

// POST /sessions
sessionsRouter.post('/sessions', requireRole('interviewer'), async (req, res, next) => {
  try {
    const body = createSessionRequest.parse(req.body);
    const session = await sessionService.createSession(req.user!.id, {
      framework: body.framework,
      customization: body.customization,
      candidateRecordId: body.candidateRecordId,
    });
    req.log.info(
      { sessionId: session.id, framework: session.framework },
      'session created (init started)',
    );
    res.status(201).json({ session, preview: sessionService.getPreview(session) });
  } catch (err) {
    next(err);
  }
});

// PATCH /sessions/:id/candidate — Phase 30d: attach/clear a candidate link.
// Interviewer + ownership enforced inside the service.
sessionsRouter.patch('/sessions/:id/candidate', requireRole('interviewer'), async (req, res, next) => {
  try {
    const id = parseSessionId(req.params.id);
    const body = attachCandidateRequest.parse(req.body);
    const session = await sessionService.attachCandidate(req.user!.id, id, body.candidateRecordId);
    res.json({ session, preview: sessionService.getPreview(session) });
  } catch (err) {
    next(err);
  }
});

// GET /sessions/:id
sessionsRouter.get('/sessions/:id', async (req, res, next) => {
  try {
    const id = parseSessionId(req.params.id);
    const session = await sessionService.getSession(req.user!.id, id);
    res.json({ session, preview: sessionService.getPreview(session) });
  } catch (err) {
    next(err);
  }
});

// GET /sessions/:id/events
sessionsRouter.get('/sessions/:id/events', async (req, res, next) => {
  try {
    const id = parseSessionId(req.params.id);
    const events = await sessionService.getEvents(req.user!.id, id);
    res.json({ events });
  } catch (err) {
    next(err);
  }
});

// POST /sessions/:id/share — enable sharing; returns the candidate token.
sessionsRouter.post('/sessions/:id/share', async (req, res, next) => {
  try {
    const id = parseSessionId(req.params.id);
    const { shareToken } = await sessionService.enableSharing(req.user!.id, id);
    res.json({ shareToken });
  } catch (err) {
    next(err);
  }
});

// DELETE /sessions/:id/share — revoke sharing (existing link stops working).
sessionsRouter.delete('/sessions/:id/share', async (req, res, next) => {
  try {
    const id = parseSessionId(req.params.id);
    await sessionService.disableSharing(req.user!.id, id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /sessions/:id/proxy — forward an API-client request to the session's
// container dev server over loopback (avoids the browser CORS block).
sessionsRouter.post('/sessions/:id/proxy', async (req, res, next) => {
  try {
    const id = parseSessionId(req.params.id);
    const p = proxyRequestSchema.parse(req.body);
    const body =
      p.body !== undefined ? Buffer.from(p.body, p.bodyEncoding === 'base64' ? 'base64' : 'utf8') : undefined;
    const result = await sessionService.proxyRequest(req.user!.id, id, {
      method: p.method,
      path: p.path,
      headers: p.headers,
      body,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /sessions/:id/container (inspect)
sessionsRouter.get('/sessions/:id/container', async (req, res, next) => {
  try {
    const id = parseSessionId(req.params.id);
    const data = await sessionService.inspectSession(req.user!.id, id);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /sessions/:id/download — stream the past session's code as .zip.
// Extracted from the Docker volume via a short-lived helper container.
// Returns 410 VOLUME_UNAVAILABLE if the volume is gone (no partial files).
sessionsRouter.get('/sessions/:id/download', async (req, res, next) => {
  try {
    const id = parseSessionId(req.params.id);
    const session = await sessionsDal.findById(id);

    // Guard 1: existence + ownership + not soft-deleted + is a code session.
    // (All rows in `sessions` are code sessions today; design docs live in a
    // separate table. The check is here so the contract holds if a session
    // kind column lands later.)
    if (
      !session ||
      session.userId !== req.user!.id ||
      session.deletedAt !== null
    ) {
      throw new NotFoundError(`Session ${id} not found`);
    }

    // Guard 2: volume metadata says it should exist.
    if (!session.volumeName || session.volumeDeleted) {
      throw new VolumeUnavailableError(
        'The code for this session is no longer available. The session\'s storage volume has been deleted.',
      );
    }

    // Guard 3: live Docker check — the volume might have been removed out
    // of band (manual `docker volume rm`, prune, host reset).
    const exists = await volumeExists(session.volumeName);
    if (!exists) {
      throw new VolumeUnavailableError(
        'The code for this session is no longer available. The session\'s storage volume has been deleted.',
      );
    }

    // Make sure the helper image is available — pull on first use so the
    // operator doesn't have to pre-stage it.
    await ensureExportImage();

    // Filename: framework + short id + ended timestamp (or last_active fallback).
    const filename = buildDownloadFilename(session);

    let aborted = false;
    const onAbort = (cb: () => void) => {
      const fire = () => {
        if (aborted) return;
        aborted = true;
        cb();
      };
      req.on('close', () => {
        // Express fires 'close' even on normal completion — only treat it
        // as an abort if the response wasn't fully written.
        if (!res.writableEnded) fire();
      });
      req.on('aborted', fire);
    };

    await streamCodeZip({
      sessionId: session.id,
      volumeName: session.volumeName,
      filename,
      res,
      onAbort,
    });

    // Audit trail — fire-and-forget so a logging failure can't break the
    // already-completed download.
    sessionEventsDal
      .append({
        sessionId: session.id,
        type: 'code_downloaded',
        payload: { filename, userId: req.user!.id },
      })
      .catch((err) => req.log.warn({ err }, 'failed to log code_downloaded'));
  } catch (err) {
    next(err);
  }
});

// DELETE /sessions/:id/history — Phase 24 remove-from-history (NOT close).
// Soft-deletes the row so the volume (if kept) isn't reaped as an orphan;
// optionally removes the Docker volume permanently.
sessionsRouter.delete('/sessions/:id/history', async (req, res, next) => {
  try {
    const id = parseSessionId(req.params.id);
    const { deleteVolume } = deleteSessionFromHistoryRequest.parse(req.body);
    const session = await sessionsDal.findById(id);

    // Guard 1: existence + ownership + not already soft-deleted.
    if (
      !session ||
      session.userId !== req.user!.id ||
      session.deletedAt !== null
    ) {
      throw new NotFoundError(`Session ${id} not found`);
    }

    // Guard 2: must be a past/terminal status — ended | error | recoverable.
    // (TERMINAL_SESSION_STATUSES in the contract is just ended|error today,
    // and `recoverable` is intentionally treated as past for the history
    // surface — it has no live container.)
    const past = session.status === 'ended' || session.status === 'error' || session.status === 'recoverable';
    if (!past) {
      throw new ConflictError('Close the session before deleting it from history.', {
        status: session.status,
      });
    }

    // Remove the volume FIRST when requested — if removeVolume throws, we
    // don't want a soft-deleted row pointing at a still-present volume that
    // the reaper has been told to ignore.
    if (deleteVolume && session.volumeName) {
      await removeVolume(session.volumeName); // idempotent: already-gone is fine
    }

    const updated = await sessionsDal.softDeleteHistory(id, {
      volumeDeleted: deleteVolume,
    });
    if (!updated) {
      // Lost a race with another deleter — treat as 404 so the client refreshes.
      throw new NotFoundError(`Session ${id} not found`);
    }

    await sessionEventsDal
      .append({
        sessionId: id,
        type: 'session_deleted',
        payload: { deleteVolume, userId: req.user!.id },
      })
      .catch((err) => req.log.warn({ err }, 'failed to log session_deleted'));

    const body: DeleteSessionFromHistoryResponse = {
      id,
      removedFromHistory: true,
      volumeDeleted: updated.volumeDeleted,
    };
    res.json(body);
  } catch (err) {
    next(err);
  }
});

// DELETE /sessions/:id (close — full save+destroy logic in Phase 11; Phase 25
// added the optional candidateRating + candidateId capture). Empty/missing
// body = skipped.
sessionsRouter.delete('/sessions/:id', async (req, res, next) => {
  try {
    const id = parseSessionId(req.params.id);
    const body = closeSessionRequest.parse(req.body ?? {});
    const session = await sessionService.closeSession(req.user!.id, id, body);
    res.json({ session });
  } catch (err) {
    next(err);
  }
});

/** Helper: ensure the alpine export image exists locally. Idempotent. */
let exportImagePullPromise: Promise<void> | null = null;
async function ensureExportImage(): Promise<void> {
  const docker = getDocker();
  try {
    await docker.getImage(EXPORT_HELPER_IMAGE).inspect();
    return;
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode !== 404) throw err;
  }
  if (!exportImagePullPromise) {
    exportImagePullPromise = new Promise<void>((resolve, reject) => {
      docker.pull(EXPORT_HELPER_IMAGE, (err: Error | null, stream: NodeJS.ReadableStream) => {
        if (err) return reject(err);
        docker.modem.followProgress(
          stream,
          (e) => (e ? reject(e) : resolve()),
        );
      });
    }).finally(() => {
      exportImagePullPromise = null;
    });
  }
  await exportImagePullPromise;
}

/** Filename: `<framework>-<short-id>-<YYYY-MM-DDTHHMM>.zip`. */
function buildDownloadFilename(session: {
  id: string;
  framework: string;
  endedAt: Date | string | null;
  lastActiveAt: Date | string;
}): string {
  const short = session.id.slice(0, 6);
  const tsSource = session.endedAt ?? session.lastActiveAt;
  const ts = tsSource instanceof Date ? tsSource : new Date(tsSource);
  // YYYY-MM-DDTHHMM — no seconds, no colons (Windows-friendly filenames).
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp =
    `${ts.getUTCFullYear()}-${pad(ts.getUTCMonth() + 1)}-${pad(ts.getUTCDate())}` +
    `T${pad(ts.getUTCHours())}${pad(ts.getUTCMinutes())}`;
  const safeFw = session.framework.replace(/[^a-z0-9_-]/gi, '');
  return `${safeFw}-${short}-${stamp}.zip`;
}
