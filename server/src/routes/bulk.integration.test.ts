/**
 * Phase 35 — integration tests for the HR bulk template + import surface.
 *
 * These talk to the real Postgres pointed at by `DATABASE_URL` (the dev DB by
 * default — see `src/test/setupEnv.ts`). Migrations and the standard seed
 * (admin / hr / interviewer + `interview_types`) must already be applied; run
 * `pnpm migrate && pnpm seed` if not.
 *
 * Rows the suite creates are namespaced under a per-process unique prefix and
 * hard-deleted in `afterAll` so the DB looks untouched after a run.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import bcrypt from 'bcrypt';
import { eq, inArray, like, sql } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { createApp } from '@/app.js';
import { getDb, closeDb } from '@/db/connection.js';
import {
  candidates,
  candidateInterviewTypes,
  interviewerSpecializations,
  users,
} from '@/db/schema/index.js';
import { interviewTypesDal, candidatesDal } from '@/dal/index.js';

const HR_EMAIL = 'hr@interviewme.local';
const HR_PASSWORD = 'Hr12345678!';
const INTERVIEWER_EMAIL = 'interviewer@interviewme.local';
const INTERVIEWER_PASSWORD = 'Interviewer12345!';
const ADMIN_EMAIL = 'admin@interviewme.local';
const ADMIN_PASSWORD = 'Admin12345!';

// Unique-per-run prefix; the cleanup hooks at the end use it to LIKE-delete
// only the rows this suite touched.
const RUN_ID = `it-${process.pid}-${Date.now().toString(36)}`;
const candidateTag = (label: string): string => `${RUN_ID}-${label}`;
const interviewerEmail = (label: string): string => `${RUN_ID}-${label}@example.test`;

const app = createApp();

async function login(email: string, password: string): Promise<string> {
  const r = await request(app).post('/auth/login').send({ email, password });
  if (r.status !== 200) {
    throw new Error(`login(${email}) failed: ${r.status} ${r.text}`);
  }
  return (r.body as { accessToken: string }).accessToken;
}

async function countCandidates(): Promise<number> {
  const [row] = await getDb().select({ c: sql<number>`count(*)::int` }).from(candidates);
  return row?.c ?? 0;
}
async function countCandidateLinks(): Promise<number> {
  const [row] = await getDb()
    .select({ c: sql<number>`count(*)::int` })
    .from(candidateInterviewTypes);
  return row?.c ?? 0;
}
async function countInterviewers(): Promise<number> {
  const [row] = await getDb()
    .select({ c: sql<number>`count(*)::int` })
    .from(users)
    .where(eq(users.role, 'interviewer'));
  return row?.c ?? 0;
}
async function countSpecializations(): Promise<number> {
  const [row] = await getDb()
    .select({ c: sql<number>`count(*)::int` })
    .from(interviewerSpecializations);
  return row?.c ?? 0;
}

let hrToken = '';
let interviewerToken = '';
let adminToken = '';

beforeAll(async () => {
  hrToken = await login(HR_EMAIL, HR_PASSWORD);
  interviewerToken = await login(INTERVIEWER_EMAIL, INTERVIEWER_PASSWORD);
  adminToken = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
}, 30_000);

afterAll(async () => {
  const db = getDb();
  // Clean any candidates created by this run (cascade removes link rows).
  await db.delete(candidates).where(like(candidates.externalId, `${RUN_ID}-%`));
  // Clean any interviewers created by this run. Specializations get cleared
  // first via DELETE on the FK target — we look up the ids and remove rows
  // in both tables explicitly so we don't depend on a cascade we didn't set.
  const u = await db.select({ id: users.id }).from(users).where(like(users.email, `${RUN_ID}-%`));
  if (u.length > 0) {
    const ids = u.map((r) => r.id);
    await db.delete(interviewerSpecializations).where(inArray(interviewerSpecializations.userId, ids));
    await db.delete(users).where(inArray(users.id, ids));
  }
  await closeDb();
});

// ---------------------------------------------------------------------------
// Template
// ---------------------------------------------------------------------------

describe('GET /hr/bulk/template', () => {
  it('returns a candidates xlsx with the expected header columns + type dropdowns', async () => {
    const types = await interviewTypesDal.list();
    const activeTypeKeys = types.filter((t) => t.isActive).map((t) => t.key).sort();

    const r = await request(app)
      .get('/hr/bulk/template?kind=candidates')
      .set('authorization', `Bearer ${hrToken}`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(Buffer.from(c)));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(r.headers['content-disposition']).toMatch(/bulk-candidates-template_/);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Uint8Array.from(r.body as Buffer).buffer);

    const data = wb.getWorksheet('Data');
    expect(data).toBeDefined();
    const headers = (data!.getRow(1).values as Array<string | undefined>).filter(
      (v): v is string => typeof v === 'string',
    );
    expect(headers).toEqual([
      'Candidate Name',
      'Candidate ID',
      'Interview Type 1 (required)',
      'Interview Type 2',
      'Interview Type 3',
    ]);

    // Reference sheet exists, is hidden, and lists exactly the active type keys.
    const ref = wb.getWorksheet('Reference');
    expect(ref).toBeDefined();
    expect(ref!.state).toBe('hidden');
    const refKeys: string[] = [];
    ref!.eachRow((row, rowNum) => {
      if (rowNum === 1) return;
      const v = row.getCell('A').value;
      if (typeof v === 'string' && v.length > 0) refKeys.push(v);
    });
    expect(refKeys.sort()).toEqual(activeTypeKeys);

    // Data validation: type columns (C/D/E) carry a list validation pointing
    // at the Reference sheet's A column range.
    const typeRange = `=Reference!$A$2:$A$${activeTypeKeys.length + 1}`;
    for (const letter of ['C', 'D', 'E']) {
      const dv = data!.getCell(`${letter}2`).dataValidation;
      expect(dv?.type).toBe('list');
      expect(dv?.formulae?.[0]).toBe(typeRange);
    }
  });

  it('returns an interviewers xlsx with type+level dropdowns', async () => {
    const r = await request(app)
      .get('/hr/bulk/template?kind=interviewers')
      .set('authorization', `Bearer ${hrToken}`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(Buffer.from(c)));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(r.status).toBe(200);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Uint8Array.from(r.body as Buffer).buffer);
    const data = wb.getWorksheet('Data')!;
    const headers = (data.getRow(1).values as Array<string | undefined>).filter(
      (v): v is string => typeof v === 'string',
    );
    expect(headers).toEqual([
      'Display Name',
      'Email',
      'Interview Type 1 (required)',
      'Level 1 (required)',
      'Interview Type 2',
      'Level 2',
      'Interview Type 3',
      'Level 3',
    ]);

    // Type cols are C, E, G and Level cols are D, F, H.
    const types = await interviewTypesDal.list();
    const activeCount = types.filter((t) => t.isActive).length;
    const typeRange = `=Reference!$A$2:$A$${activeCount + 1}`;
    const levelRange = '=Reference!$C$2:$C$4';

    for (const letter of ['C', 'E', 'G']) {
      const dv = data.getCell(`${letter}2`).dataValidation;
      expect(dv?.type).toBe('list');
      expect(dv?.formulae?.[0]).toBe(typeRange);
    }
    for (const letter of ['D', 'F', 'H']) {
      const dv = data.getCell(`${letter}2`).dataValidation;
      expect(dv?.type).toBe('list');
      expect(dv?.formulae?.[0]).toBe(levelRange);
    }
  });

  it('403s for non-HR callers', async () => {
    for (const token of [interviewerToken, adminToken]) {
      const r = await request(app)
        .get('/hr/bulk/template?kind=candidates')
        .set('authorization', `Bearer ${token}`);
      expect(r.status).toBe(403);
    }
  });
});

// ---------------------------------------------------------------------------
// Import — happy paths
// ---------------------------------------------------------------------------

describe('POST /hr/bulk/import — candidates happy path', () => {
  it('inserts every row + every type link in a single transaction', async () => {
    const candidatesBefore = await countCandidates();
    const linksBefore = await countCandidateLinks();

    const payload = {
      kind: 'candidates',
      rows: [
        { name: 'Alpha', externalId: candidateTag('A'), interviewTypeKeys: ['javascript', 'react'] },
        { name: 'Bravo', externalId: candidateTag('B'), interviewTypeKeys: ['python'] },
      ],
    };

    const r = await request(app)
      .post('/hr/bulk/import')
      .set('authorization', `Bearer ${hrToken}`)
      .send(payload);

    expect(r.status).toBe(201);
    const body = r.body as {
      kind: string;
      inserted: number;
      created: Array<{ id: string; externalId: string; interviewTypes: Array<{ key: string }> }>;
    };
    expect(body.kind).toBe('candidates');
    expect(body.inserted).toBe(2);

    expect(await countCandidates()).toBe(candidatesBefore + 2);
    // 2 + 1 = 3 link rows added.
    expect(await countCandidateLinks()).toBe(linksBefore + 3);

    // Round-trip the rows + their joined types so the DB state is verified
    // against the request, not the response.
    const aliceId = body.created.find((c) => c.externalId === candidateTag('A'))!.id;
    const bobId = body.created.find((c) => c.externalId === candidateTag('B'))!.id;
    const alice = await candidatesDal.getByIdWithTypes(aliceId);
    const bob = await candidatesDal.getByIdWithTypes(bobId);
    expect(alice?.interviewTypes.map((t) => t.key).sort()).toEqual(['javascript', 'react']);
    expect(bob?.interviewTypes.map((t) => t.key).sort()).toEqual(['python']);
  });
});

describe('POST /hr/bulk/import — interviewers happy path', () => {
  it('inserts users + specializations and returns valid bcrypt temp passwords', async () => {
    const usersBefore = await countInterviewers();
    const specsBefore = await countSpecializations();

    const e1 = interviewerEmail('h1');
    const e2 = interviewerEmail('h2');
    const payload = {
      kind: 'interviewers',
      rows: [
        {
          displayName: 'Hire One',
          email: e1,
          specializations: [
            { interviewTypeKey: 'javascript', level: 'L2' },
            { interviewTypeKey: 'react', level: 'L3' },
          ],
        },
        {
          displayName: 'Hire Two',
          email: e2,
          specializations: [{ interviewTypeKey: 'python', level: 'L1' }],
        },
      ],
    };

    const r = await request(app)
      .post('/hr/bulk/import')
      .set('authorization', `Bearer ${hrToken}`)
      .send(payload);

    expect(r.status).toBe(201);
    const body = r.body as {
      inserted: number;
      created: Array<{ email: string; specializations: Array<{ level: string; interviewType: { key: string } }> }>;
      generatedPasswords: Array<{ email: string; tempPassword: string }>;
    };
    expect(body.inserted).toBe(2);
    expect(body.generatedPasswords).toHaveLength(2);
    expect(new Set(body.generatedPasswords.map((p) => p.email))).toEqual(new Set([e1, e2]));

    expect(await countInterviewers()).toBe(usersBefore + 2);
    // 2 + 1 = 3 specialization rows added.
    expect(await countSpecializations()).toBe(specsBefore + 3);

    // Temp password must bcrypt-match the stored hash for the row.
    const [row] = await getDb().select().from(users).where(eq(users.email, e1));
    expect(row).toBeDefined();
    const tempForE1 = body.generatedPasswords.find((p) => p.email === e1)!.tempPassword;
    expect(await bcrypt.compare(tempForE1, row!.passwordHash)).toBe(true);

    // And the new interviewer can complete a real /auth/login with it.
    const loginR = await request(app).post('/auth/login').send({ email: e1, password: tempForE1 });
    expect(loginR.status).toBe(200);
    expect(typeof (loginR.body as { accessToken: string }).accessToken).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// Import — validation failures
// ---------------------------------------------------------------------------

describe('POST /hr/bulk/import — validation failures', () => {
  it('candidates: missing name + unknown type + in-sheet dup externalId → 422, no inserts', async () => {
    const beforeC = await countCandidates();
    const beforeL = await countCandidateLinks();

    const dup = candidateTag('VDUP');
    const r = await request(app)
      .post('/hr/bulk/import')
      .set('authorization', `Bearer ${hrToken}`)
      .send({
        kind: 'candidates',
        rows: [
          { name: 'Good Row', externalId: candidateTag('V-good'), interviewTypeKeys: ['javascript'] },
          { name: '   ', externalId: candidateTag('V-blank'), interviewTypeKeys: ['javascript'] },
          { name: 'Bad Type', externalId: candidateTag('V-badtype'), interviewTypeKeys: ['quantum-flux'] },
          { name: 'Dup A', externalId: dup, interviewTypeKeys: ['react'] },
          { name: 'Dup B', externalId: dup, interviewTypeKeys: ['python'] },
        ],
      });

    expect(r.status).toBe(422);
    const body = r.body as {
      error: { code: string; details: { rowErrors: Array<{ rowIndex: number; field: string; message: string }> } };
    };
    expect(body.error.code).toBe('VALIDATION');
    const errs = body.error.details.rowErrors;
    expect(errs.some((e) => e.rowIndex === 1 && e.field === 'name')).toBe(true);
    expect(errs.some((e) => e.rowIndex === 2 && e.field === 'interviewTypeKeys' && /Unknown/.test(e.message))).toBe(true);
    expect(errs.some((e) => e.rowIndex === 4 && e.field === 'externalId' && /Duplicates row/.test(e.message))).toBe(true);

    // ZERO inserts.
    expect(await countCandidates()).toBe(beforeC);
    expect(await countCandidateLinks()).toBe(beforeL);
  });

  it('candidates: against-DB externalId collision → 422, no new inserts', async () => {
    // Seed one candidate, then try to import the same externalId.
    const existing = candidateTag('DB-COL');
    const [hr] = await getDb().select({ id: users.id }).from(users).where(eq(users.email, HR_EMAIL));
    await candidatesDal.create(
      { externalId: existing, name: 'Existing', createdBy: hr!.id },
      [],
    );
    const beforeC = await countCandidates();

    const r = await request(app)
      .post('/hr/bulk/import')
      .set('authorization', `Bearer ${hrToken}`)
      .send({
        kind: 'candidates',
        rows: [{ name: 'Re-attempt', externalId: existing, interviewTypeKeys: ['javascript'] }],
      });
    expect(r.status).toBe(422);
    const body = r.body as { error: { details: { rowErrors: Array<{ field: string; message: string }> } } };
    expect(body.error.details.rowErrors.some((e) => e.field === 'externalId' && /already exists/.test(e.message))).toBe(true);
    expect(await countCandidates()).toBe(beforeC);
  });

  it('interviewers: invalid level + dup email (sheet) + dup email (DB) → 422, no inserts', async () => {
    // Pre-seed an HR-known existing email collision.
    const dbEmail = interviewerEmail('preexisting');
    await getDb().insert(users).values({
      email: dbEmail,
      passwordHash: await bcrypt.hash('whatever', 4),
      displayName: 'Pre-existing',
      role: 'interviewer',
      isActive: true,
    });

    const beforeU = await countInterviewers();
    const beforeS = await countSpecializations();
    const sheetDup = interviewerEmail('sheet-dup');

    const r = await request(app)
      .post('/hr/bulk/import')
      .set('authorization', `Bearer ${hrToken}`)
      .send({
        kind: 'interviewers',
        rows: [
          // Invalid level — fails strict per-row parse.
          {
            displayName: 'BadLevel',
            email: interviewerEmail('badlevel'),
            specializations: [{ interviewTypeKey: 'javascript', level: 'L9' }],
          },
          // Cross-row dup.
          {
            displayName: 'DupA',
            email: sheetDup,
            specializations: [{ interviewTypeKey: 'python', level: 'L1' }],
          },
          {
            displayName: 'DupB',
            email: sheetDup,
            specializations: [{ interviewTypeKey: 'react', level: 'L2' }],
          },
          // Against-DB email collision.
          {
            displayName: 'DBDup',
            email: dbEmail,
            specializations: [{ interviewTypeKey: 'react', level: 'L3' }],
          },
        ],
      });

    expect(r.status).toBe(422);
    const body = r.body as {
      error: { details: { rowErrors: Array<{ rowIndex: number; field: string; message: string }> } };
    };
    const errs = body.error.details.rowErrors;
    expect(errs.some((e) => e.rowIndex === 0 && e.field === 'specializations')).toBe(true);
    expect(errs.some((e) => e.rowIndex === 2 && e.field === 'email' && /Duplicates row/.test(e.message))).toBe(true);
    expect(errs.some((e) => e.rowIndex === 3 && e.field === 'email' && /already exists/.test(e.message))).toBe(true);

    // No new rows on top of the pre-existing seed.
    expect(await countInterviewers()).toBe(beforeU);
    expect(await countSpecializations()).toBe(beforeS);
  });
});

// ---------------------------------------------------------------------------
// DAL-level transaction rollback
// ---------------------------------------------------------------------------

describe('candidatesDal.bulkCreate — transaction rollback', () => {
  it('rolls back the entire batch when the partial unique index trips mid-insert', async () => {
    const [hr] = await getDb().select({ id: users.id }).from(users).where(eq(users.email, HR_EMAIL));
    const dup = candidateTag('ROLLBACK');
    const beforeC = await countCandidates();
    const beforeL = await countCandidateLinks();

    // Two rows with the SAME externalId. The route layer catches this via
    // semantic validation, so we exercise the DAL directly to prove the
    // transaction rolls everything back when the unique index trips.
    await expect(
      candidatesDal.bulkCreate([
        { name: 'First', externalId: dup, createdBy: hr!.id, interviewTypeIds: [] },
        { name: 'Second', externalId: dup, createdBy: hr!.id, interviewTypeIds: [] },
      ]),
    ).rejects.toThrow();

    expect(await countCandidates()).toBe(beforeC);
    expect(await countCandidateLinks()).toBe(beforeL);
  });
});

// ---------------------------------------------------------------------------
// AuthZ
// ---------------------------------------------------------------------------

describe('POST /hr/bulk/import — authz', () => {
  it('returns 403 for non-HR callers', async () => {
    for (const token of [interviewerToken, adminToken]) {
      const r = await request(app)
        .post('/hr/bulk/import')
        .set('authorization', `Bearer ${token}`)
        .send({
          kind: 'candidates',
          rows: [{ name: 'X', externalId: candidateTag('authz'), interviewTypeKeys: ['javascript'] }],
        });
      expect(r.status).toBe(403);
    }
  });
});
