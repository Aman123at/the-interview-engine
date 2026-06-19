import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { getDb } from '@/db/connection.js';
import {
  candidates,
  candidateInterviewTypes,
  interviewerSpecializations,
  interviewTypes,
  type Candidate,
  type NewCandidate,
  type InterviewType,
} from '@/db/schema/index.js';

export interface CandidateWithTypes extends Candidate {
  interviewTypes: InterviewType[];
}

async function attachTypes(rows: Candidate[]): Promise<CandidateWithTypes[]> {
  if (rows.length === 0) return [];
  const links = await getDb()
    .select({
      candidateId: candidateInterviewTypes.candidateId,
      type: interviewTypes,
    })
    .from(candidateInterviewTypes)
    .innerJoin(interviewTypes, eq(candidateInterviewTypes.interviewTypeId, interviewTypes.id))
    .where(
      inArray(
        candidateInterviewTypes.candidateId,
        rows.map((r) => r.id),
      ),
    );
  const byId = new Map<string, InterviewType[]>();
  for (const l of links) {
    const arr = byId.get(l.candidateId) ?? [];
    arr.push(l.type);
    byId.set(l.candidateId, arr);
  }
  return rows.map((r) => ({ ...r, interviewTypes: byId.get(r.id) ?? [] }));
}

export const candidatesDal = {
  async create(input: NewCandidate, interviewTypeIds: string[]): Promise<Candidate> {
    const db = getDb();
    const [row] = await db.insert(candidates).values(input).returning();
    if (!row) throw new Error('candidatesDal.create: insert returned no row');
    if (interviewTypeIds.length > 0) {
      await db
        .insert(candidateInterviewTypes)
        .values(interviewTypeIds.map((tid) => ({ candidateId: row.id, interviewTypeId: tid })));
    }
    return row;
  },

  async findByExternalId(externalId: string): Promise<Candidate | null> {
    const [row] = await getDb()
      .select()
      .from(candidates)
      .where(and(eq(candidates.externalId, externalId), isNull(candidates.deletedAt)))
      .limit(1);
    return row ?? null;
  },

  async findById(id: string): Promise<Candidate | null> {
    const [row] = await getDb()
      .select()
      .from(candidates)
      .where(and(eq(candidates.id, id), isNull(candidates.deletedAt)))
      .limit(1);
    return row ?? null;
  },

  async getByIdWithTypes(id: string): Promise<CandidateWithTypes | null> {
    const row = await this.findById(id);
    if (!row) return null;
    const [withTypes] = await attachTypes([row]);
    return withTypes ?? null;
  },

  /**
   * List non-deleted candidates. Optional case-insensitive search across
   * `name` and `external_id`. Most-recently-updated first.
   */
  async list({ search }: { search?: string } = {}): Promise<CandidateWithTypes[]> {
    const where = search
      ? and(
          isNull(candidates.deletedAt),
          or(
            ilike(candidates.name, `%${search}%`),
            ilike(candidates.externalId, `%${search}%`),
          ),
        )
      : isNull(candidates.deletedAt);
    const rows = await getDb()
      .select()
      .from(candidates)
      .where(where)
      .orderBy(desc(candidates.updatedAt), asc(candidates.id));
    return attachTypes(rows);
  },

  async updateProfile(
    id: string,
    patch: { name?: string; externalId?: string },
  ): Promise<Candidate | null> {
    if (Object.keys(patch).length === 0) return this.findById(id);
    const [row] = await getDb()
      .update(candidates)
      .set(patch)
      .where(and(eq(candidates.id, id), isNull(candidates.deletedAt)))
      .returning();
    return row ?? null;
  },

  /** Replace the candidate's full type set. Transactional. */
  async replaceInterviewTypes(candidateId: string, interviewTypeIds: string[]): Promise<void> {
    const db = getDb();
    await db.transaction(async (tx) => {
      await tx
        .delete(candidateInterviewTypes)
        .where(eq(candidateInterviewTypes.candidateId, candidateId));
      if (interviewTypeIds.length > 0) {
        await tx
          .insert(candidateInterviewTypes)
          .values(interviewTypeIds.map((tid) => ({ candidateId, interviewTypeId: tid })));
      }
    });
  },

  /**
   * Interviewer-scoped list. Returns candidates whose interview-type set
   * INTERSECTS the caller's specialization types, deduped. Optional search.
   * Non-deleted only. If the interviewer has zero specializations, returns [].
   */
  async listForInterviewer(
    interviewerId: string,
    { search }: { search?: string } = {},
  ): Promise<CandidateWithTypes[]> {
    const db = getDb();
    const baseWhere = search
      ? and(
          isNull(candidates.deletedAt),
          or(
            ilike(candidates.name, `%${search}%`),
            ilike(candidates.externalId, `%${search}%`),
          ),
        )
      : isNull(candidates.deletedAt);
    const rows = await db
      .selectDistinct({
        id: candidates.id,
        externalId: candidates.externalId,
        name: candidates.name,
        createdBy: candidates.createdBy,
        createdAt: candidates.createdAt,
        updatedAt: candidates.updatedAt,
        deletedAt: candidates.deletedAt,
      })
      .from(candidates)
      .innerJoin(candidateInterviewTypes, eq(candidateInterviewTypes.candidateId, candidates.id))
      .innerJoin(
        interviewerSpecializations,
        eq(interviewerSpecializations.interviewTypeId, candidateInterviewTypes.interviewTypeId),
      )
      .where(and(baseWhere, eq(interviewerSpecializations.userId, interviewerId)))
      .orderBy(desc(candidates.updatedAt), asc(candidates.id));
    return attachTypes(rows as Candidate[]);
  },

  /**
   * True iff candidate has at least one interview type in common with the
   * interviewer's specializations. Cheap probe via existence count.
   */
  async isInInterviewerScope(interviewerId: string, candidateId: string): Promise<boolean> {
    const [row] = await getDb()
      .select({ ok: sql<number>`1` })
      .from(candidateInterviewTypes)
      .innerJoin(
        interviewerSpecializations,
        eq(interviewerSpecializations.interviewTypeId, candidateInterviewTypes.interviewTypeId),
      )
      .where(
        and(
          eq(candidateInterviewTypes.candidateId, candidateId),
          eq(interviewerSpecializations.userId, interviewerId),
        ),
      )
      .limit(1);
    return !!row;
  },

  /**
   * Bulk-insert candidates + their interview-type links in ONE transaction.
   * Rolls back the whole batch on any failure. Returns the created rows in the
   * same order as the input.
   */
  async bulkCreate(
    items: Array<{ name: string; externalId: string; createdBy: string; interviewTypeIds: string[] }>,
  ): Promise<Candidate[]> {
    if (items.length === 0) return [];
    const db = getDb();
    return db.transaction(async (tx) => {
      const inserted = await tx
        .insert(candidates)
        .values(items.map(({ interviewTypeIds: _t, ...rest }) => rest))
        .returning();
      const links: Array<{ candidateId: string; interviewTypeId: string }> = [];
      for (let i = 0; i < inserted.length; i += 1) {
        const row = inserted[i]!;
        const typeIds = items[i]!.interviewTypeIds;
        for (const tid of typeIds) links.push({ candidateId: row.id, interviewTypeId: tid });
      }
      if (links.length > 0) {
        await tx.insert(candidateInterviewTypes).values(links);
      }
      return inserted;
    });
  },

  async softDelete(id: string): Promise<void> {
    await getDb()
      .update(candidates)
      .set({ deletedAt: sql`now()` })
      .where(eq(candidates.id, id));
  },
};
