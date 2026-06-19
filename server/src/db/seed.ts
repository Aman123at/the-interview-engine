/**
 * Seed interviewer/admin/HR accounts + sample candidates from env JSON.
 *
 *   SEED_USERS      = [{ email, password, displayName, role?, specializations? }]
 *                     specializations is interviewer-only:
 *                       [{ key: 'javascript' | ..., level: 'L1'|'L2'|'L3' }]
 *   SEED_CANDIDATES = [{ externalId, name, types: string[] }]
 *
 * Idempotent: users upsert by email, specializations upsert by (user, type),
 * candidates upsert by externalId. The starter set of interview_types is
 * seeded by migration 0007 — this script only references their `key`s.
 *
 * If SEED_CANDIDATES is unset, a tiny built-in fallback runs so Phase 30
 * verification has data to work with.
 */
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { config } from '@/config/index.js';
import { logger } from '@/utils/logger.js';
import {
  usersDal,
  interviewTypesDal,
  interviewerSpecializationsDal,
  candidatesDal,
} from '@/dal/index.js';
import { LEVELS } from '@/db/schema/index.js';
import { USER_ROLES } from '@/contracts/enums.js';
import { closeDb } from './connection.js';

const SpecializationSchema = z.object({
  key: z.string().min(1),
  level: z.enum(LEVELS),
});

const SeedUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'seed passwords must be ≥ 8 chars'),
  displayName: z.string().min(1),
  role: z.enum(USER_ROLES).default('interviewer'),
  specializations: z.array(SpecializationSchema).optional(),
});

const SeedListSchema = z.array(SeedUserSchema).min(1, 'SEED_USERS must contain at least one user');

const SeedCandidateSchema = z.object({
  externalId: z.string().min(1).max(120),
  name: z.string().min(1).max(200),
  types: z.array(z.string().min(1)).default([]),
});
const SeedCandidatesList = z.array(SeedCandidateSchema);

const BCRYPT_ROUNDS = 12;

/** Tiny fallback used only when SEED_CANDIDATES is unset. */
const DEFAULT_CANDIDATES: z.infer<typeof SeedCandidatesList> = [
  { externalId: 'CAND-001', name: 'Alice Example', types: ['javascript', 'react'] },
  { externalId: 'CAND-002', name: 'Bob Example', types: ['python'] },
];

async function seedUsers(): Promise<{ ownerByEmail: Map<string, string> }> {
  if (!config.SEED_USERS) {
    logger.warn('SEED_USERS is not set — no users seeded');
    return { ownerByEmail: new Map() };
  }

  let parsed: z.infer<typeof SeedListSchema>;
  try {
    const raw: unknown = JSON.parse(config.SEED_USERS);
    parsed = SeedListSchema.parse(raw);
  } catch (err) {
    logger.error({ err }, 'SEED_USERS is not valid JSON or does not match the expected shape');
    throw err;
  }

  // Enforce "at most one admin" at the seed layer so a misconfigured file fails
  // loudly here instead of hitting the DB unique index mid-run.
  const adminCount = parsed.filter((u) => u.role === 'admin').length;
  if (adminCount > 1) {
    throw new Error(`SEED_USERS contains ${adminCount} admins; exactly one is allowed`);
  }

  const ownerByEmail = new Map<string, string>();
  for (const u of parsed) {
    const passwordHash = await bcrypt.hash(u.password, BCRYPT_ROUNDS);
    const row = await usersDal.upsertByEmail({
      email: u.email,
      passwordHash,
      displayName: u.displayName,
      role: u.role,
      isActive: true,
    });
    ownerByEmail.set(row.email, row.id);
    logger.info({ id: row.id, email: row.email, role: row.role }, 'seeded user');

    if (u.role === 'interviewer' && u.specializations?.length) {
      for (const s of u.specializations) {
        const t = await interviewTypesDal.findByKey(s.key);
        if (!t) {
          logger.warn(
            { email: u.email, key: s.key },
            'specialization references unknown interview_type key — skipping',
          );
          continue;
        }
        await interviewerSpecializationsDal.upsert(row.id, t.id, s.level);
        logger.info(
          { email: u.email, key: s.key, level: s.level },
          'seeded interviewer specialization',
        );
      }
    } else if (u.role !== 'interviewer' && u.specializations?.length) {
      logger.warn(
        { email: u.email, role: u.role },
        'specializations on non-interviewer ignored',
      );
    }
  }
  return { ownerByEmail };
}

async function seedCandidates(ownerByEmail: Map<string, string>): Promise<void> {
  let list: z.infer<typeof SeedCandidatesList>;
  if (config.SEED_CANDIDATES) {
    try {
      const raw: unknown = JSON.parse(config.SEED_CANDIDATES);
      list = SeedCandidatesList.parse(raw);
    } catch (err) {
      logger.error({ err }, 'SEED_CANDIDATES is not valid JSON / shape — skipping candidates');
      return;
    }
  } else {
    list = DEFAULT_CANDIDATES;
  }

  // `created_by` is a required FK; pick the first seeded user as the owner.
  // In a real deployment this would be an HR account — production seed data
  // should put an HR first in SEED_USERS.
  const owner = [...ownerByEmail.values()][0];
  if (!owner) {
    logger.warn('no seeded users — cannot seed candidates (created_by required)');
    return;
  }

  for (const c of list) {
    const existing = await candidatesDal.findByExternalId(c.externalId);
    if (existing) {
      logger.info({ externalId: c.externalId }, 'candidate already exists — skipping');
      continue;
    }
    const typeIds: string[] = [];
    for (const k of c.types) {
      const t = await interviewTypesDal.findByKey(k);
      if (t) typeIds.push(t.id);
      else logger.warn({ candidate: c.externalId, key: k }, 'unknown interview_type key');
    }
    const row = await candidatesDal.create(
      { externalId: c.externalId, name: c.name, createdBy: owner },
      typeIds,
    );
    logger.info(
      { id: row.id, externalId: row.externalId, types: typeIds.length },
      'seeded candidate',
    );
  }
}

async function main(): Promise<void> {
  const { ownerByEmail } = await seedUsers();
  await seedCandidates(ownerByEmail);
  logger.info('seed complete');
}

void (async () => {
  try {
    await main();
  } catch (err) {
    logger.error({ err }, 'seed failed');
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
})();
