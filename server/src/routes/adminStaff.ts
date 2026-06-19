/**
 * Phase 30b/30c — staff management.
 *
 * Split into TWO routers because the audiences differ:
 *
 *   - `hrManagementRouter`     → /admin/hrs/*           (admin only)
 *   - `staffSharedRouter`      → /admin/interviewers/*  (admin OR hr)
 *                                /admin/interview-types  (admin OR hr — catalogue)
 *
 * Mount sites apply the guard:
 *   - admin.ts mounts `hrManagementRouter` under its `requireRole('admin')` chain.
 *   - app.ts mounts `staffSharedRouter` under `requireAuth, requireRole('admin','hr')`.
 *
 * Hard invariants enforced here, in addition to the DB ones:
 *   - The admin role is NEVER granted via these endpoints — onboarding always
 *     sets `role='hr'` or `role='interviewer'`. (The single-admin partial
 *     unique index in migration 0007 is the DB backstop.)
 *   - Updates by id are scoped to the route's role: PATCH /admin/hrs/:id will
 *     refuse to touch a non-HR row, and likewise for interviewers. The admin
 *     account is therefore untouchable through this surface.
 *   - Email uniqueness is preflighted via findByEmail; a race with the unique
 *     index still surfaces 23505 → ConflictError from the global handler.
 */
import { Router } from 'express';
import bcrypt from 'bcrypt';
import { requireAuth, requireRole } from '@/middleware/auth.js';
import {
  adminUserIdParams,
  onboardHrRequest,
  updateHrRequest,
  onboardInterviewerRequest,
  updateInterviewerRequest,
  type AdminListHrsResponse,
  type AdminListInterviewersResponse,
  type AdminStaffUserResponse,
  type AdminInterviewerResponse,
  type AdminStaffUser,
  type AdminInterviewerUser,
  type SpecializationInput,
  type OkResponse,
  type AdminListInterviewTypesResponse,
} from '@/contracts/index.js';
import {
  usersDal,
  interviewTypesDal,
  interviewerSpecializationsDal,
} from '@/dal/index.js';
import type { User } from '@/db/schema/index.js';
import { ConflictError, NotFoundError, ValidationError } from '@/errors/index.js';

const BCRYPT_ROUNDS = 12;

function toStaffUser(u: User): AdminStaffUser {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    role: u.role,
    isActive: u.isActive,
    createdAt: u.createdAt,
  };
}

async function toInterviewerUser(u: User): Promise<AdminInterviewerUser> {
  const specs = await interviewerSpecializationsDal.listForUser(u.id);
  return { ...toStaffUser(u), specializations: specs };
}

/**
 * Resolve `{ interviewTypeKey, level }` inputs to `{ interviewTypeId, level }`
 * via the catalogue. Dedupes by key (last wins) so the caller can't sneak two
 * levels for the same type past the unique constraint. Throws 400 on an
 * unknown key.
 */
async function resolveSpecializations(
  items: SpecializationInput[],
): Promise<Array<{ interviewTypeId: string; level: SpecializationInput['level'] }>> {
  const dedup = new Map<string, SpecializationInput['level']>();
  for (const it of items) dedup.set(it.interviewTypeKey, it.level);
  const out: Array<{ interviewTypeId: string; level: SpecializationInput['level'] }> = [];
  for (const [key, level] of dedup) {
    const t = await interviewTypesDal.findByKey(key);
    if (!t) throw new ValidationError(`Unknown interview type: ${key}`);
    out.push({ interviewTypeId: t.id, level });
  }
  return out;
}

/** Admin-only routes (HR onboarding/update/delete). */
export const hrManagementRouter = Router();
/** Admin OR HR routes (interviewer onboarding/update/delete + type catalogue). */
export const staffSharedRouter = Router();
staffSharedRouter.use(requireAuth, requireRole('admin', 'hr'));

// ---------------- Interview-type catalogue (admin OR hr) ------------------

// GET /admin/interview-types — used to populate the specialization picker.
staffSharedRouter.get('/interview-types', async (_req, res, next) => {
  try {
    const types = await interviewTypesDal.list();
    const body: AdminListInterviewTypesResponse = { types };
    res.json(body);
  } catch (err) {
    next(err);
  }
});

// ---------------- HRs ----------------

// GET /admin/hrs
hrManagementRouter.get('/', async (_req, res, next) => {
  try {
    const rows = await usersDal.listByRole('hr');
    const body: AdminListHrsResponse = { users: rows.map(toStaffUser) };
    res.json(body);
  } catch (err) {
    next(err);
  }
});

// POST /admin/hrs — onboard
hrManagementRouter.post('/', async (req, res, next) => {
  try {
    const body = onboardHrRequest.parse(req.body);
    const email = body.email.trim().toLowerCase();
    const existing = await usersDal.findByEmail(email);
    if (existing) throw new ConflictError(`A user with email ${email} already exists`);

    const passwordHash = await bcrypt.hash(body.password, BCRYPT_ROUNDS);
    const row = await usersDal.create({
      email,
      passwordHash,
      displayName: body.displayName,
      role: 'hr',
      isActive: true,
    });
    req.log.info({ userId: row.id, email: row.email }, 'admin onboarded HR');
    const resp: AdminStaffUserResponse = { user: toStaffUser(row) };
    res.status(201).json(resp);
  } catch (err) {
    next(err);
  }
});

// PATCH /admin/hrs/:id
hrManagementRouter.patch('/:id', async (req, res, next) => {
  try {
    const { id } = adminUserIdParams.parse({ id: req.params.id });
    const body = updateHrRequest.parse(req.body);

    const existing = await usersDal.findById(id);
    if (!existing || existing.role !== 'hr') {
      throw new NotFoundError(`HR ${id} not found`);
    }

    const patch: { displayName?: string; isActive?: boolean; passwordHash?: string } = {};
    if (body.displayName !== undefined) patch.displayName = body.displayName;
    if (body.isActive !== undefined) patch.isActive = body.isActive;
    if (body.password !== undefined) {
      patch.passwordHash = await bcrypt.hash(body.password, BCRYPT_ROUNDS);
    }

    const updated = await usersDal.updateProfile(id, patch);
    if (!updated) throw new NotFoundError(`HR ${id} not found`);
    // Bumping isActive=false or rotating the password should invalidate any
    // outstanding refresh tokens for that user — same path /auth/logout uses.
    if (body.isActive === false || body.password !== undefined) {
      await usersDal.bumpTokenVersion(id);
    }
    req.log.info({ userId: id, patch: Object.keys(patch) }, 'admin updated HR');
    const resp: AdminStaffUserResponse = { user: toStaffUser(updated) };
    res.json(resp);
  } catch (err) {
    next(err);
  }
});

// DELETE /admin/hrs/:id — soft delete
hrManagementRouter.delete('/:id', async (req, res, next) => {
  try {
    const { id } = adminUserIdParams.parse({ id: req.params.id });
    const existing = await usersDal.findById(id);
    if (!existing || existing.role !== 'hr') {
      throw new NotFoundError(`HR ${id} not found`);
    }
    await usersDal.softDelete(id);
    await usersDal.bumpTokenVersion(id);
    req.log.info({ userId: id }, 'admin soft-deleted HR');
    const resp: OkResponse = { ok: true };
    res.json(resp);
  } catch (err) {
    next(err);
  }
});

// ---------------- Interviewers ----------------

// GET /admin/interviewers
staffSharedRouter.get('/interviewers', async (_req, res, next) => {
  try {
    const rows = await usersDal.listByRole('interviewer');
    const users = await Promise.all(rows.map(toInterviewerUser));
    const body: AdminListInterviewersResponse = { users };
    res.json(body);
  } catch (err) {
    next(err);
  }
});

// POST /admin/interviewers — onboard
staffSharedRouter.post('/interviewers', async (req, res, next) => {
  try {
    const body = onboardInterviewerRequest.parse(req.body);
    const email = body.email.trim().toLowerCase();
    const existing = await usersDal.findByEmail(email);
    if (existing) throw new ConflictError(`A user with email ${email} already exists`);

    // Resolve specializations BEFORE creating the user so an unknown type key
    // doesn't leave a half-onboarded row behind.
    const specs = await resolveSpecializations(body.specializations ?? []);

    const passwordHash = await bcrypt.hash(body.password, BCRYPT_ROUNDS);
    const row = await usersDal.create({
      email,
      passwordHash,
      displayName: body.displayName,
      role: 'interviewer',
      isActive: true,
    });
    if (specs.length > 0) {
      await interviewerSpecializationsDal.replaceForUser(row.id, specs);
    }
    req.log.info(
      { userId: row.id, email: row.email, specializationCount: specs.length },
      'admin onboarded interviewer',
    );
    const resp: AdminInterviewerResponse = { user: await toInterviewerUser(row) };
    res.status(201).json(resp);
  } catch (err) {
    next(err);
  }
});

// PATCH /admin/interviewers/:id
staffSharedRouter.patch('/interviewers/:id', async (req, res, next) => {
  try {
    const { id } = adminUserIdParams.parse({ id: req.params.id });
    const body = updateInterviewerRequest.parse(req.body);

    const existing = await usersDal.findById(id);
    if (!existing || existing.role !== 'interviewer') {
      throw new NotFoundError(`Interviewer ${id} not found`);
    }

    const patch: { displayName?: string; isActive?: boolean; passwordHash?: string } = {};
    if (body.displayName !== undefined) patch.displayName = body.displayName;
    if (body.isActive !== undefined) patch.isActive = body.isActive;
    if (body.password !== undefined) {
      patch.passwordHash = await bcrypt.hash(body.password, BCRYPT_ROUNDS);
    }

    const updated = await usersDal.updateProfile(id, patch);
    if (!updated) throw new NotFoundError(`Interviewer ${id} not found`);

    if (body.specializations !== undefined) {
      const specs = await resolveSpecializations(body.specializations);
      await interviewerSpecializationsDal.replaceForUser(id, specs);
    }

    if (body.isActive === false || body.password !== undefined) {
      await usersDal.bumpTokenVersion(id);
    }
    req.log.info(
      {
        userId: id,
        patch: Object.keys(patch),
        replacedSpecializations: body.specializations !== undefined,
      },
      'admin updated interviewer',
    );
    const resp: AdminInterviewerResponse = { user: await toInterviewerUser(updated) };
    res.json(resp);
  } catch (err) {
    next(err);
  }
});

// DELETE /admin/interviewers/:id — soft delete
staffSharedRouter.delete('/interviewers/:id', async (req, res, next) => {
  try {
    const { id } = adminUserIdParams.parse({ id: req.params.id });
    const existing = await usersDal.findById(id);
    if (!existing || existing.role !== 'interviewer') {
      throw new NotFoundError(`Interviewer ${id} not found`);
    }
    await usersDal.softDelete(id);
    await usersDal.bumpTokenVersion(id);
    req.log.info({ userId: id }, 'admin soft-deleted interviewer');
    const resp: OkResponse = { ok: true };
    res.json(resp);
  } catch (err) {
    next(err);
  }
});

