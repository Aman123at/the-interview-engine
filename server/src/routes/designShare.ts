/**
 * Public (UNAUTHENTICATED) design-canvas endpoint, keyed by an unguessable
 * share token. A guest never logs in — the token IS the authorization, scoped
 * to exactly one design document. Mounted WITHOUT requireAuth.
 *
 * Companion routes for owners (mint / revoke the token) live under
 * /design-docs/:id/share with requireAuth.
 *
 * The bulk of the collaboration flow happens over the socket. This HTTP
 * endpoint exists so the client page can render the initial canvas + the
 * "session full / ended" empty states without first opening a socket.
 */
import { Router } from 'express';
import { designDocumentsDal } from '@/dal/index.js';
import { designPresence } from '@/services/designPresence.js';
import {
  designShareTokenParams,
  DESIGN_ROOM_MAX_PEERS,
  type DesignShareGetResponse,
} from '@/contracts/index.js';

export const designShareRouter = Router();

const parseToken = (token: unknown) => designShareTokenParams.parse({ token }).token;

// GET /design-share/:token — guest entry point. Returns the current document
// (so the canvas hydrates instantly) and the max-peer cap. Missing / revoked
// → 410 invalid. Soft-deleted by owner → 410 ended. Room full → 409 full so
// the page renders the friendly "session full" state without churning a socket.
designShareRouter.get('/design-share/:token', async (req, res, next) => {
  try {
    const token = parseToken(req.params.token);
    const doc = await designDocumentsDal.findByShareToken(token);
    if (!doc) {
      const body: DesignShareGetResponse = { ok: false, reason: 'invalid' };
      return res.status(410).json(body);
    }
    if (doc.deletedAt) {
      const body: DesignShareGetResponse = { ok: false, reason: 'ended' };
      return res.status(410).json(body);
    }
    if (designPresence.isFull(doc.id)) {
      const body: DesignShareGetResponse = { ok: false, reason: 'full' };
      return res.status(409).json(body);
    }
    // The Drizzle row is structurally compatible with `designDocumentSchema`
    // (passthrough; date fields accept Date | string).
    const body: DesignShareGetResponse = {
      ok: true,
      document: doc as unknown as Extract<DesignShareGetResponse, { ok: true }>['document'],
      maxPeers: DESIGN_ROOM_MAX_PEERS,
    };
    res.json(body);
  } catch (err) {
    next(err);
  }
});
