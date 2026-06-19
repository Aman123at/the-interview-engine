/**
 * Phase 30d — Interviewer-scoped read surfaces.
 *
 *   GET /interviewer/candidates  — returns candidates whose interview-type set
 *                                  INTERSECTS the caller's specializations.
 *
 * The candidate UUID is stable; `externalId` is the editable identifier HR
 * typed in. Soft-deleted rows are excluded. An interviewer with no
 * specializations sees an empty list (DAL returns no rows because the
 * inner join with `interviewer_specializations` matches none).
 *
 * Framework choice is NEVER gated by type — this route only filters candidate
 * visibility.
 */
import { Router } from 'express';
import { requireAuth, requireRole } from '@/middleware/auth.js';
import {
  interviewerCandidatesQuery,
  type CandidateDto,
  type InterviewerCandidatesResponse,
} from '@/contracts/index.js';
import { candidatesDal } from '@/dal/index.js';
import type { CandidateWithTypes } from '@/dal/candidatesDal.js';

export const interviewerRouter = Router();
interviewerRouter.use(requireAuth, requireRole('interviewer'));

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

interviewerRouter.get('/candidates', async (req, res, next) => {
  try {
    const q = interviewerCandidatesQuery.parse({ search: req.query.search });
    const rows = await candidatesDal.listForInterviewer(req.user!.id, { search: q.search });
    const resp: InterviewerCandidatesResponse = { candidates: rows.map(toDto) };
    res.json(resp);
  } catch (err) {
    next(err);
  }
});
