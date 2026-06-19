/**
 * Phase 19 — design-document CRUD. Auth-required, ownership-enforced. NO
 * Docker, NO WS, NO container/port/volume side effects: this track is
 * intentionally independent from the one-session rule.
 *
 * Autosave is just a debounced PATCH from the client.
 */
import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { requireAuth, requireRole } from '@/middleware/auth.js';
import { designDocumentsDal } from '@/dal/index.js';
import { NotFoundError, ValidationError } from '@/errors/index.js';
import { designPresence } from '@/services/designPresence.js';
import { eventBus } from '@/utils/eventBus.js';
import {
  createDesignDocRequest,
  designDocIdParams,
  documentSchemaForKind,
  listDesignDocsQuery,
  updateDesignDocRequest,
  type DesignDocResponse,
  type DeleteDesignDocResponse,
  type ListDesignDocsResponse,
  type EnableDesignShareResponse,
  type OkResponse,
} from '@/contracts/index.js';

export const designDocsRouter = Router();

designDocsRouter.use(requireAuth);

const parseDocId = (id: unknown) => designDocIdParams.parse({ id }).id;

// POST /design-docs — create
designDocsRouter.post('/design-docs', requireRole('interviewer'), async (req, res, next) => {
  try {
    const body = createDesignDocRequest.parse(req.body);

    // Validate the (optional) initial document against the per-kind schema.
    // When the client doesn't supply one, seed an empty-but-valid scaffold
    // per kind — system_design's schema requires `elements`, db_design has
    // no required fields.
    const docSchema = documentSchemaForKind(body.kind);
    const initialDoc =
      body.document ?? (body.kind === 'system_design' ? { elements: [] } : {});
    const document = docSchema.parse(initialDoc);
    const row = await designDocumentsDal.create({
      userId: req.user!.id,
      kind: body.kind,
      title: body.title,
      dbEngine: body.kind === 'db_design' ? body.dbEngine : null,
      document,
      thumbnail: body.thumbnail ?? null,
    });
    req.log.info(
      { designDocId: row.id, kind: row.kind },
      'design doc created',
    );
    const resp: DesignDocResponse = { document: row };
    res.status(201).json(resp);
  } catch (err) {
    next(err);
  }
});

// GET /design-docs?kind= — list mine
designDocsRouter.get('/design-docs', async (req, res, next) => {
  try {
    const q = listDesignDocsQuery.parse(req.query);
    const rows = await designDocumentsDal.listByUser(req.user!.id, { kind: q.kind });
    const resp: ListDesignDocsResponse = { documents: rows };
    res.json(resp);
  } catch (err) {
    next(err);
  }
});

// GET /design-docs/:id
designDocsRouter.get('/design-docs/:id', async (req, res, next) => {
  try {
    const id = parseDocId(req.params.id);
    const row = await designDocumentsDal.getByIdForUser(id, req.user!.id);
    if (!row) throw new NotFoundError(`Design document ${id} not found`);
    const resp: DesignDocResponse = { document: row };
    res.json(resp);
  } catch (err) {
    next(err);
  }
});

// PATCH /design-docs/:id — autosave / rename / thumbnail
designDocsRouter.patch('/design-docs/:id', async (req, res, next) => {
  try {
    const id = parseDocId(req.params.id);
    const body = updateDesignDocRequest.parse(req.body);

    // Look up first so we know the kind (immutable) for per-kind document
    // validation. Ownership is enforced by the same query.
    const existing = await designDocumentsDal.getByIdForUser(id, req.user!.id);
    if (!existing) throw new NotFoundError(`Design document ${id} not found`);

    let validatedDoc: unknown | undefined = undefined;
    if (body.document !== undefined) {
      const parsed = documentSchemaForKind(existing.kind).safeParse(body.document);
      if (!parsed.success) {
        throw new ValidationError('document failed validation for this kind', {
          kind: existing.kind,
          issues: parsed.error.issues,
        });
      }
      validatedDoc = parsed.data;
    }

    const updated = await designDocumentsDal.update(id, req.user!.id, {
      title: body.title,
      document: validatedDoc,
      thumbnail: body.thumbnail,
    });
    if (!updated) throw new NotFoundError(`Design document ${id} not found`);
    const resp: DesignDocResponse = { document: updated };
    res.json(resp);
  } catch (err) {
    next(err);
  }
});

// DELETE /design-docs/:id — soft delete
designDocsRouter.delete('/design-docs/:id', async (req, res, next) => {
  try {
    const id = parseDocId(req.params.id);
    const ok = await designDocumentsDal.softDelete(id, req.user!.id);
    if (!ok) throw new NotFoundError(`Design document ${id} not found`);
    // If guests were live in this doc's room, evict them so they don't keep
    // editing a tombstoned document.
    eventBus.emit('design.closed', { docId: id, reason: 'deleted' });
    designPresence.forget(id);
    const resp: DeleteDesignDocResponse = { ok: true };
    res.json(resp);
  } catch (err) {
    next(err);
  }
});

// POST /design-docs/:id/share — enable sharing, mint a stable token. Owner-only,
// idempotent. Only system_design docs are shareable today (the multi-user
// canvas semantics only apply there); a db_design doc gets a 400.
designDocsRouter.post('/design-docs/:id/share', async (req, res, next) => {
  try {
    const id = parseDocId(req.params.id);
    const existing = await designDocumentsDal.getByIdForUser(id, req.user!.id);
    if (!existing) throw new NotFoundError(`Design document ${id} not found`);
    if (existing.kind !== 'system_design') {
      throw new ValidationError('Only system_design documents can be shared');
    }
    if (existing.shareToken) {
      const resp: EnableDesignShareResponse = { shareToken: existing.shareToken };
      return res.json(resp);
    }
    const token = randomBytes(24).toString('base64url'); // ~32 chars, unguessable
    const updated = await designDocumentsDal.setShareToken(id, req.user!.id, token);
    const resp: EnableDesignShareResponse = {
      shareToken: updated?.shareToken ?? token,
    };
    res.json(resp);
  } catch (err) {
    next(err);
  }
});

// DELETE /design-docs/:id/share — revoke. The existing link stops working
// immediately; live guests get evicted with `design:closed { reason:'revoked' }`.
designDocsRouter.delete('/design-docs/:id/share', async (req, res, next) => {
  try {
    const id = parseDocId(req.params.id);
    const existing = await designDocumentsDal.getByIdForUser(id, req.user!.id);
    if (!existing) throw new NotFoundError(`Design document ${id} not found`);
    if (existing.shareToken) {
      await designDocumentsDal.setShareToken(id, req.user!.id, null);
      eventBus.emit('design.closed', { docId: id, reason: 'revoked' });
      designPresence.forget(id);
    }
    const resp: OkResponse = { ok: true };
    res.json(resp);
  } catch (err) {
    next(err);
  }
});
