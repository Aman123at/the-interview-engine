/**
 * Phase 30c — HR-owned candidate management.
 *
 * `requireRole('hr')` on every route. Candidates have a stable internal UUID
 * (joins, FKs) and a separate human-readable `externalId` HR types in and can
 * edit later — the UUID never changes when `externalId` is updated.
 *
 * `external_id` is partial-unique among non-deleted rows (migration 0007),
 * so an edit that collides surfaces 409 CONFLICT — preflighted to give the
 * caller a clear message instead of relying on a raw 23505.
 */
import { Router } from 'express';
import { requireAuth, requireRole } from '@/middleware/auth.js';
import {
  candidateIdParams,
  createCandidateRequest,
  listCandidatesQuery,
  updateCandidateRequest,
  type CandidateDto,
  type CandidateResponse,
  type ListCandidatesResponse,
  type OkResponse,
} from '@/contracts/index.js';
import { candidatesDal, interviewTypesDal } from '@/dal/index.js';
import type { CandidateWithTypes } from '@/dal/candidatesDal.js';
import { ConflictError, NotFoundError, ValidationError } from '@/errors/index.js';

export const candidatesRouter = Router();
candidatesRouter.use(requireAuth, requireRole('hr'));

function toDto(c: CandidateWithTypes): CandidateDto {
  return {
    id: c.id,
    externalId: c.externalId,
    name: c.name,
    createdBy: c.createdBy,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    interviewTypes: c.interviewTypes.map((t) => ({
      id: t.id,
      key: t.key,
      label: t.label,
      isActive: t.isActive,
    })),
  };
}

/** Resolve interview-type keys -> ids, dedup, reject unknowns. */
async function resolveTypeKeys(keys: string[]): Promise<string[]> {
  const dedup = Array.from(new Set(keys));
  const out: string[] = [];
  for (const k of dedup) {
    const t = await interviewTypesDal.findByKey(k);
    if (!t) throw new ValidationError(`Unknown interview type: ${k}`);
    out.push(t.id);
  }
  return out;
}

// POST /candidates
candidatesRouter.post('/', async (req, res, next) => {
  try {
    const body = createCandidateRequest.parse(req.body);
    const existing = await candidatesDal.findByExternalId(body.externalId);
    if (existing) throw new ConflictError(`A candidate with external id ${body.externalId} already exists`);

    const typeIds = await resolveTypeKeys(body.interviewTypeKeys);
    const row = await candidatesDal.create(
      {
        externalId: body.externalId,
        name: body.name,
        createdBy: req.user!.id,
      },
      typeIds,
    );
    const withTypes = await candidatesDal.getByIdWithTypes(row.id);
    req.log.info({ candidateId: row.id, externalId: row.externalId }, 'hr created candidate');
    const resp: CandidateResponse = { candidate: toDto(withTypes!) };
    res.status(201).json(resp);
  } catch (err) {
    next(err);
  }
});

// GET /candidates
candidatesRouter.get('/', async (req, res, next) => {
  try {
    const q = listCandidatesQuery.parse({ search: req.query.search });
    const rows = await candidatesDal.list({ search: q.search });
    const resp: ListCandidatesResponse = { candidates: rows.map(toDto) };
    res.json(resp);
  } catch (err) {
    next(err);
  }
});

// GET /candidates/:id
candidatesRouter.get('/:id', async (req, res, next) => {
  try {
    const { id } = candidateIdParams.parse({ id: req.params.id });
    const row = await candidatesDal.getByIdWithTypes(id);
    if (!row) throw new NotFoundError(`Candidate ${id} not found`);
    const resp: CandidateResponse = { candidate: toDto(row) };
    res.json(resp);
  } catch (err) {
    next(err);
  }
});

// PATCH /candidates/:id
candidatesRouter.patch('/:id', async (req, res, next) => {
  try {
    const { id } = candidateIdParams.parse({ id: req.params.id });
    const body = updateCandidateRequest.parse(req.body);

    const existing = await candidatesDal.findById(id);
    if (!existing) throw new NotFoundError(`Candidate ${id} not found`);

    // Preflight uniqueness if externalId is being changed.
    if (body.externalId !== undefined && body.externalId !== existing.externalId) {
      const collide = await candidatesDal.findByExternalId(body.externalId);
      if (collide) throw new ConflictError(`A candidate with external id ${body.externalId} already exists`);
    }

    const patch: { name?: string; externalId?: string } = {};
    if (body.name !== undefined) patch.name = body.name;
    if (body.externalId !== undefined) patch.externalId = body.externalId;
    if (Object.keys(patch).length > 0) {
      await candidatesDal.updateProfile(id, patch);
    }

    if (body.interviewTypeKeys !== undefined) {
      const typeIds = await resolveTypeKeys(body.interviewTypeKeys);
      await candidatesDal.replaceInterviewTypes(id, typeIds);
    }

    const reloaded = await candidatesDal.getByIdWithTypes(id);
    if (!reloaded) throw new NotFoundError(`Candidate ${id} not found`);
    req.log.info(
      { candidateId: id, patch: Object.keys(patch), replacedTypes: body.interviewTypeKeys !== undefined },
      'hr updated candidate',
    );
    const resp: CandidateResponse = { candidate: toDto(reloaded) };
    res.json(resp);
  } catch (err) {
    next(err);
  }
});

// DELETE /candidates/:id — soft delete
candidatesRouter.delete('/:id', async (req, res, next) => {
  try {
    const { id } = candidateIdParams.parse({ id: req.params.id });
    const existing = await candidatesDal.findById(id);
    if (!existing) throw new NotFoundError(`Candidate ${id} not found`);
    await candidatesDal.softDelete(id);
    req.log.info({ candidateId: id }, 'hr soft-deleted candidate');
    const resp: OkResponse = { ok: true };
    res.json(resp);
  } catch (err) {
    next(err);
  }
});
