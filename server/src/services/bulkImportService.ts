/**
 * Phase 35 — HR bulk-import validation + transactional insert.
 *
 * Validates EVERY row before touching the DB. Collects all problems as
 * `BulkRowError[]` so the HR can fix the spreadsheet in one pass. If any error
 * is found, the route returns 422 and NOTHING is inserted. On an all-valid
 * batch the actual insert happens inside a single DAL transaction — the whole
 * batch rolls back on any DB failure.
 *
 * The request envelope passes rows as `unknown[]` (see `bulkImportRequest`)
 * so this layer can `safeParse` each row against the strict schema and report
 * row-level zod problems instead of failing the whole call with a 400.
 */
import bcrypt from 'bcrypt';
import { nanoid } from 'nanoid';
import {
  BULK_MAX_TYPE_COLUMNS,
  bulkCandidateRowSchema,
  bulkInterviewerRowSchema,
  type BulkImportRequest,
  type BulkRowError,
  type CandidateDto,
  type AdminInterviewerUser,
} from '@/contracts/index.js';
import { candidatesDal, interviewTypesDal, usersDal } from '@/dal/index.js';
import type { InterviewType, Level } from '@/db/schema/index.js';

const BCRYPT_ROUNDS = 12;

export interface BulkImportSuccess {
  ok: true;
  kind: BulkImportRequest['kind'];
  inserted: number;
  created: CandidateDto[] | AdminInterviewerUser[];
  generatedPasswords?: Array<{ email: string; tempPassword: string }>;
}

export interface BulkImportFailure {
  ok: false;
  rowErrors: BulkRowError[];
}

export type BulkImportResult = BulkImportSuccess | BulkImportFailure;

function buildTypeKeyIndex(types: InterviewType[]): Map<string, InterviewType> {
  const m = new Map<string, InterviewType>();
  for (const t of types) if (t.isActive) m.set(t.key, t);
  return m;
}

function generateTempPassword(): string {
  return nanoid(16);
}

export async function runBulkImport(
  req: BulkImportRequest,
  hrUserId: string,
): Promise<BulkImportResult> {
  const types = await interviewTypesDal.list();
  const typeByKey = buildTypeKeyIndex(types);

  if (req.kind === 'candidates') {
    return importCandidates(req.rows, hrUserId, typeByKey);
  }
  return importInterviewers(req.rows, typeByKey);
}

// --------------------------- candidates -----------------------------------

async function importCandidates(
  rawRows: unknown[],
  hrUserId: string,
  typeByKey: Map<string, InterviewType>,
): Promise<BulkImportResult> {
  const errors: BulkRowError[] = [];

  // Phase 1: structural validation per row.
  const rows: Array<ReturnType<typeof bulkCandidateRowSchema.parse> | null> = rawRows.map((raw, i) => {
    const parsed = bulkCandidateRowSchema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push({
          rowIndex: i,
          field: issue.path.length > 0 ? String(issue.path[0]) : 'row',
          message: issue.message,
        });
      }
      return null;
    }
    return parsed.data;
  });

  // Phase 2: semantic checks on rows that parsed (unknown types, cross-row dups).
  const seenExternalIds = new Map<string, number>();
  rows.forEach((r, i) => {
    if (r == null) return;
    const prev = seenExternalIds.get(r.externalId);
    if (prev !== undefined) {
      errors.push({
        rowIndex: i,
        field: 'externalId',
        message: `Duplicates row ${prev + 1} in this upload`,
      });
    } else {
      seenExternalIds.set(r.externalId, i);
    }
    if (r.interviewTypeKeys.length > BULK_MAX_TYPE_COLUMNS) {
      errors.push({
        rowIndex: i,
        field: 'interviewTypeKeys',
        message: `At most ${BULK_MAX_TYPE_COLUMNS} types per row`,
      });
    }
    const seenTypes = new Set<string>();
    for (const key of r.interviewTypeKeys) {
      if (!typeByKey.has(key)) {
        errors.push({ rowIndex: i, field: 'interviewTypeKeys', message: `Unknown interview type "${key}"` });
      }
      if (seenTypes.has(key)) {
        errors.push({
          rowIndex: i,
          field: 'interviewTypeKeys',
          message: `Duplicate interview type "${key}" in this row`,
        });
      }
      seenTypes.add(key);
    }
  });

  // Phase 3: against-DB external_id collisions.
  for (const [externalId, rowIndex] of seenExternalIds) {
    const collide = await candidatesDal.findByExternalId(externalId);
    if (collide) {
      errors.push({
        rowIndex,
        field: 'externalId',
        message: `A candidate with Candidate ID "${externalId}" already exists`,
      });
    }
  }

  if (errors.length > 0) return { ok: false, rowErrors: errors };

  // All rows parsed (no nulls) and passed semantic checks. Narrow to non-null.
  const goodRows = rows.filter((r): r is NonNullable<typeof r> => r !== null);

  const inserted = await candidatesDal.bulkCreate(
    goodRows.map((r) => ({
      name: r.name,
      externalId: r.externalId,
      createdBy: hrUserId,
      interviewTypeIds: dedup(r.interviewTypeKeys).map((k) => typeByKey.get(k)!.id),
    })),
  );

  const created: CandidateDto[] = inserted.map((row, i) => ({
    id: row.id,
    externalId: row.externalId,
    name: row.name,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    interviewTypes: dedup(goodRows[i]!.interviewTypeKeys).map((k) => {
      const t = typeByKey.get(k)!;
      return { id: t.id, key: t.key, label: t.label, isActive: t.isActive };
    }),
  }));

  return { ok: true, kind: 'candidates', inserted: created.length, created };
}

// --------------------------- interviewers ---------------------------------

async function importInterviewers(
  rawRows: unknown[],
  typeByKey: Map<string, InterviewType>,
): Promise<BulkImportResult> {
  const errors: BulkRowError[] = [];

  const rows: Array<ReturnType<typeof bulkInterviewerRowSchema.parse> | null> = rawRows.map((raw, i) => {
    const parsed = bulkInterviewerRowSchema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push({
          rowIndex: i,
          field: issue.path.length > 0 ? String(issue.path[0]) : 'row',
          message: issue.message,
        });
      }
      return null;
    }
    return parsed.data;
  });

  const seenEmails = new Map<string, number>();
  rows.forEach((r, i) => {
    if (r == null) return;
    const emailNorm = r.email.trim().toLowerCase();
    const prev = seenEmails.get(emailNorm);
    if (prev !== undefined) {
      errors.push({
        rowIndex: i,
        field: 'email',
        message: `Duplicates row ${prev + 1} in this upload`,
      });
    } else {
      seenEmails.set(emailNorm, i);
    }
    if (r.specializations.length > BULK_MAX_TYPE_COLUMNS) {
      errors.push({
        rowIndex: i,
        field: 'specializations',
        message: `At most ${BULK_MAX_TYPE_COLUMNS} (type + level) pairs per row`,
      });
    }
    const seenTypes = new Set<string>();
    for (const s of r.specializations) {
      if (!typeByKey.has(s.interviewTypeKey)) {
        errors.push({
          rowIndex: i,
          field: 'specializations',
          message: `Unknown interview type "${s.interviewTypeKey}"`,
        });
      }
      if (seenTypes.has(s.interviewTypeKey)) {
        errors.push({
          rowIndex: i,
          field: 'specializations',
          message: `Duplicate interview type "${s.interviewTypeKey}" in this row`,
        });
      }
      seenTypes.add(s.interviewTypeKey);
    }
  });

  for (const [email, rowIndex] of seenEmails) {
    const collide = await usersDal.findByEmail(email);
    if (collide) {
      errors.push({
        rowIndex,
        field: 'email',
        message: `A user with email "${email}" already exists`,
      });
    }
  }

  if (errors.length > 0) return { ok: false, rowErrors: errors };

  const goodRows = rows.filter((r): r is NonNullable<typeof r> => r !== null);

  const generatedPasswords: Array<{ email: string; tempPassword: string }> = [];
  const items = await Promise.all(
    goodRows.map(async (r) => {
      const tempPassword = generateTempPassword();
      const email = r.email.trim().toLowerCase();
      generatedPasswords.push({ email, tempPassword });
      const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);
      const specs = dedupBy(r.specializations, (s) => s.interviewTypeKey).map((s) => ({
        interviewTypeId: typeByKey.get(s.interviewTypeKey)!.id,
        level: s.level as Level,
      }));
      return {
        email,
        passwordHash,
        displayName: r.displayName,
        specializations: specs,
      };
    }),
  );

  const inserted = await usersDal.bulkCreateInterviewers(items);

  const typesById = new Map(Array.from(typeByKey.values()).map((t) => [t.id, t]));
  const created: AdminInterviewerUser[] = inserted.map((u, i) => ({
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    role: u.role,
    isActive: u.isActive,
    createdAt: u.createdAt,
    specializations: items[i]!.specializations.map((s) => {
      const t = typesById.get(s.interviewTypeId)!;
      return {
        interviewTypeId: t.id,
        interviewType: { id: t.id, key: t.key, label: t.label, isActive: t.isActive },
        level: s.level,
      };
    }),
  }));

  return {
    ok: true,
    kind: 'interviewers',
    inserted: created.length,
    created,
    generatedPasswords,
  };
}

function dedup<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function dedupBy<T, K>(arr: T[], by: (t: T) => K): T[] {
  const seen = new Set<K>();
  const out: T[] = [];
  for (const it of arr) {
    const k = by(it);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}
