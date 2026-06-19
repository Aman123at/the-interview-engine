/**
 * Public (UNAUTHENTICATED) candidate endpoints, keyed by an unguessable share
 * token. A candidate never logs in — the token IS the authorization, scoped to
 * exactly one session. Mounted WITHOUT requireAuth.
 *
 * Surface is deliberately tiny:
 *   GET  /share/:token        → minimal session info + preview, or "ended"
 *   POST /share/:token/proxy  → API-client proxy to THIS session's container
 *
 * Everything else the candidate needs (file tree, editor, terminals, lifecycle)
 * flows over the socket, authorized by the same token at the WS handshake.
 */
import { Router } from 'express';
import { sessionService } from '@/services/sessionService.js';
import { previewForSession } from '@/services/previewService.js';
import {
  proxyRequest as proxyRequestSchema,
  shareTokenParams,
  type ShareGetResponse,
} from '@/contracts/index.js';

export const shareRouter = Router();

const parseToken = (token: unknown) => shareTokenParams.parse({ token }).token;

// GET /share/:token — candidate entry point. A terminal/missing session yields
// 410 { ok:false, reason:'ended' } so the client renders the "session ended" page.
shareRouter.get('/share/:token', async (req, res, next) => {
  try {
    const token = parseToken(req.params.token);
    const s = await sessionService.getByShareToken(token);
    if (!s || s.status === 'ended' || s.status === 'error') {
      const body: ShareGetResponse = { ok: false, reason: 'ended' };
      return res.status(410).json(body);
    }
    const body: ShareGetResponse = {
      ok: true,
      session: { id: s.id, framework: s.framework, status: s.status },
      preview: previewForSession(s),
    };
    res.json(body);
  } catch (err) {
    next(err);
  }
});

// POST /share/:token/proxy — candidate API-client proxy (token-scoped).
shareRouter.post('/share/:token/proxy', async (req, res, next) => {
  try {
    const token = parseToken(req.params.token);
    const p = proxyRequestSchema.parse(req.body);
    const body =
      p.body !== undefined ? Buffer.from(p.body, p.bodyEncoding === 'base64' ? 'base64' : 'utf8') : undefined;
    const result = await sessionService.proxyRequestByToken(token, {
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
