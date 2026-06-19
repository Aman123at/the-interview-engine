import { and, desc, eq, gte, ilike, inArray, isNotNull, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { getDb } from '@/db/connection.js';
import { eventBus } from '@/utils/eventBus.js';
import {
  sessions,
  users,
  candidates,
  candidateInterviewTypes,
  interviewTypes,
  NON_TERMINAL_STATUSES,
  type Session,
  type NewSession,
  type SessionStatus,
} from '@/db/schema/index.js';
import { ConflictError, NotFoundError } from '@/errors/index.js';

function encodeHistoryCursor(row: Session): string {
  const ts = (row.endedAt ?? row.lastActiveAt) as Date | string;
  const iso = ts instanceof Date ? ts.toISOString() : new Date(ts).toISOString();
  return Buffer.from(`${iso}|${row.id}`, 'utf8').toString('base64url');
}

function decodeHistoryCursor(cursor: string): { ts: string; id: string } | null {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const idx = decoded.indexOf('|');
    if (idx < 0) return null;
    const ts = decoded.slice(0, idx);
    const id = decoded.slice(idx + 1);
    if (!ts || !id) return null;
    if (Number.isNaN(Date.parse(ts))) return null;
    return { ts, id };
  } catch {
    return null;
  }
}

function publishStatus(row: Session | null | undefined): void {
  if (!row) return;
  eventBus.emit('session.status', { sessionId: row.id, status: row.status });
}

export interface CreateSessionInput {
  userId: string;
  framework: string;
  customization: Record<string, unknown>;
}

export const sessionsDal = {
  /**
   * Returns the user's currently-active or recoverable session, if any.
   * "Active" = any non-terminal status (pending, initializing, running, saving, recoverable).
   * The DB-level partial unique index guarantees at most one row matches.
   */
  async getActiveSessionForUser(userId: string): Promise<Session | null> {
    const [row] = await getDb()
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.userId, userId),
          inArray(sessions.status, [...NON_TERMINAL_STATUSES]),
        ),
      )
      .limit(1);
    return row ?? null;
  },

  /**
   * Most recent recoverable session for a user (used by Phase 11 resume flow).
   */
  async getRecoverableSessionForUser(userId: string): Promise<Session | null> {
    const [row] = await getDb()
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, userId), eq(sessions.status, 'recoverable')))
      .orderBy(desc(sessions.createdAt))
      .limit(1);
    return row ?? null;
  },

  /**
   * Guarded create: enforces the HARD ONE-SESSION RULE.
   *
   * Throws `ConflictError` if the user already has a non-terminal session.
   * The DB partial unique index `sessions_one_active_per_user_uniq` is the
   * authoritative guard against races; we catch its violation and convert it.
   */
  async createSession(input: CreateSessionInput): Promise<Session> {
    const existing = await this.getActiveSessionForUser(input.userId);
    if (existing) {
      throw new ConflictError('User already has an active or recoverable session', {
        sessionId: existing.id,
        status: existing.status,
      });
    }

    const newRow: NewSession = {
      userId: input.userId,
      framework: input.framework,
      customization: input.customization,
      status: 'pending',
    };

    try {
      const [row] = await getDb().insert(sessions).values(newRow).returning();
      if (!row) throw new Error('sessionsDal.createSession: insert returned no row');
      return row;
    } catch (err) {
      // 23505 = unique_violation — the partial unique index caught a race.
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code?: string }).code === '23505'
      ) {
        throw new ConflictError('User already has an active or recoverable session');
      }
      throw err;
    }
  },

  async findById(id: string): Promise<Session | null> {
    const [row] = await getDb().select().from(sessions).where(eq(sessions.id, id)).limit(1);
    return row ?? null;
  },

  async requireById(id: string): Promise<Session> {
    const row = await this.findById(id);
    if (!row) throw new NotFoundError(`Session ${id} not found`);
    return row;
  },

  /** Resolve a session by its (unguessable) share token. */
  async findByShareToken(token: string): Promise<Session | null> {
    const [row] = await getDb()
      .select()
      .from(sessions)
      .where(eq(sessions.shareToken, token))
      .limit(1);
    return row ?? null;
  },

  /** Set (or clear, with null) the share token. */
  async setShareToken(id: string, token: string | null): Promise<Session | null> {
    const [row] = await getDb()
      .update(sessions)
      .set({ shareToken: token })
      .where(eq(sessions.id, id))
      .returning();
    return row ?? null;
  },

  async updateStatus(id: string, status: SessionStatus): Promise<Session | null> {
    const [row] = await getDb()
      .update(sessions)
      .set({ status, lastActiveAt: new Date() })
      .where(eq(sessions.id, id))
      .returning();
    publishStatus(row);
    return row ?? null;
  },

  async update(id: string, patch: Partial<NewSession>): Promise<Session | null> {
    const [row] = await getDb()
      .update(sessions)
      .set({ ...patch })
      .where(eq(sessions.id, id))
      .returning();
    if (patch.status !== undefined) publishStatus(row);
    return row ?? null;
  },

  async markStarted(id: string): Promise<Session | null> {
    return this.update(id, { startedAt: new Date(), status: 'initializing' });
  },

  async markEnded(id: string): Promise<Session | null> {
    return this.update(id, { status: 'ended', endedAt: new Date() });
  },

  async touch(id: string): Promise<void> {
    await getDb()
      .update(sessions)
      .set({ lastActiveAt: new Date() })
      .where(eq(sessions.id, id));
  },

  /**
   * Phase 22: paginated list of the user's TERMINAL/past sessions for the
   * "Past Sessions" page. Includes `ended`, `error`, and `recoverable`
   * (recoverable can be resumed, but it still shows up as a past session
   * until it's either resumed back into running or closed). Soft-deleted
   * rows are excluded. Ordered by COALESCE(ended_at, last_active_at) DESC
   * — matches the index `sessions_history_idx`.
   *
   * Cursor is an opaque base64 of `${iso}|${id}` for keyset pagination.
   */
  async listHistoryForUser(
    userId: string,
    opts: { limit?: number; cursor?: string | null } = {},
  ): Promise<{ items: Session[]; nextCursor: string | null }> {
    const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);

    const sortExpr = sql`COALESCE(${sessions.endedAt}, ${sessions.lastActiveAt})`;

    const where = [
      eq(sessions.userId, userId),
      isNull(sessions.deletedAt),
      inArray(sessions.status, ['ended', 'error', 'recoverable']),
    ];

    if (opts.cursor) {
      const decoded = decodeHistoryCursor(opts.cursor);
      if (decoded) {
        where.push(
          sql`(COALESCE(${sessions.endedAt}, ${sessions.lastActiveAt}), ${sessions.id}) < (${decoded.ts}::timestamptz, ${decoded.id}::uuid)`,
        );
      }
    }

    const rows = await getDb()
      .select()
      .from(sessions)
      .where(and(...where))
      .orderBy(desc(sortExpr), desc(sessions.id))
      .limit(limit + 1);

    const items = rows.slice(0, limit);
    const nextCursor =
      rows.length > limit
        ? encodeHistoryCursor(items[items.length - 1]!)
        : null;
    return { items, nextCursor };
  },

  /**
   * Phase 24: soft-delete a past session so it leaves the user's history.
   * Optionally flips `volumeDeleted=true` in the same UPDATE (we never set
   * `volumeDeleted=true` without also tombstoning the row, so we don't
   * accept it as a separate flag elsewhere).
   *
   * Returns the updated row, or null if nothing matched (already deleted /
   * wrong owner / non-terminal). Caller has already verified guards; this
   * just persists the result atomically.
   */
  async softDeleteHistory(
    id: string,
    opts: { volumeDeleted: boolean },
  ): Promise<Session | null> {
    const [row] = await getDb()
      .update(sessions)
      .set({
        deletedAt: new Date(),
        volumeDeleted: opts.volumeDeleted ? true : undefined,
      })
      .where(eq(sessions.id, id))
      .returning();
    return row ?? null;
  },

  async listForUser(userId: string, limit = 50): Promise<Session[]> {
    return getDb()
      .select()
      .from(sessions)
      .where(eq(sessions.userId, userId))
      .orderBy(desc(sessions.createdAt))
      .limit(limit);
  },

  /**
   * Currently-allocated ports across every non-terminal session. Used to
   * hydrate the in-memory port pool on boot so we don't double-allocate.
   */
  async getAllocatedPorts(): Promise<number[]> {
    const rows = await getDb()
      .select({ port: sessions.hostPreviewPort })
      .from(sessions)
      .where(
        and(
          inArray(sessions.status, [...NON_TERMINAL_STATUSES]),
          // host_preview_port IS NOT NULL — drizzle has `isNotNull`
          // but we can use sql for clarity. Easier: filter in JS.
        ),
      );
    return rows
      .map((r) => r.port)
      .filter((p): p is number => typeof p === 'number');
  },

  /**
   * All non-terminal sessions (used by graceful shutdown to mark them
   * recoverable, and by lifecycleService to reconcile after a server
   * restart).
   */
  async listActive(): Promise<Session[]> {
    return getDb()
      .select()
      .from(sessions)
      .where(inArray(sessions.status, [...NON_TERMINAL_STATUSES]));
  },

  /**
   * Phase 30e — HR cross-interviewer report. Joins each past session to its
   * owning interviewer (users) and (when linked) its candidate row. Returns
   * candidate's interview-type catalogue inline so the report renders without
   * a second roundtrip.
   *
   * Filters (all optional):
   *   - interviewerSearch: ilike on users.display_name OR users.email
   *   - candidateSearch:   ilike on candidates.external_id OR candidates.name
   *   - dateFrom/dateTo:   range on COALESCE(ended_at, started_at, last_active_at)
   *
   * Pagination: keyset on (COALESCE(ended_at, last_active_at) DESC, id DESC) so
   * results match the history surface ordering.
   */
  async listForHr(opts: {
    interviewerSearch?: string;
    candidateSearch?: string;
    dateFrom?: Date;
    dateTo?: Date;
    limit?: number;
    cursor?: string | null;
  } = {}): Promise<{
    items: Array<{
      session: Session;
      interviewer: { id: string; displayName: string; email: string } | null;
      candidate: { id: string; externalId: string; name: string } | null;
      candidateInterviewTypes: Array<{ key: string; label: string }>;
    }>;
    nextCursor: string | null;
  }> {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const db = getDb();

    const where = [
      isNull(sessions.deletedAt),
      inArray(sessions.status, ['ended', 'error', 'recoverable']),
    ];
    if (opts.interviewerSearch) {
      const s = `%${opts.interviewerSearch}%`;
      where.push(or(ilike(users.displayName, s), ilike(users.email, s))!);
    }
    if (opts.candidateSearch) {
      const s = `%${opts.candidateSearch}%`;
      // candidate is left-joined; filtering through it means sessions without
      // a linked candidate are excluded when this filter is set — which is
      // the intended behavior (searching a candidate name implies you want
      // sessions tagged with one).
      where.push(or(ilike(candidates.externalId, s), ilike(candidates.name, s))!);
    }
    const rangeExpr = sql`COALESCE(${sessions.endedAt}, ${sessions.startedAt}, ${sessions.lastActiveAt})`;
    if (opts.dateFrom) where.push(gte(rangeExpr, opts.dateFrom));
    if (opts.dateTo)   where.push(lte(rangeExpr, opts.dateTo));

    if (opts.cursor) {
      const decoded = decodeHistoryCursor(opts.cursor);
      if (decoded) {
        where.push(
          sql`(COALESCE(${sessions.endedAt}, ${sessions.lastActiveAt}), ${sessions.id}) < (${decoded.ts}::timestamptz, ${decoded.id}::uuid)`,
        );
      }
    }

    const sortExpr = sql`COALESCE(${sessions.endedAt}, ${sessions.lastActiveAt})`;
    const rows = await db
      .select({
        session: sessions,
        interviewer: {
          id: users.id,
          displayName: users.displayName,
          email: users.email,
        },
        candidate: {
          id: candidates.id,
          externalId: candidates.externalId,
          name: candidates.name,
        },
      })
      .from(sessions)
      .leftJoin(users, eq(sessions.userId, users.id))
      .leftJoin(candidates, eq(sessions.candidateRecordId, candidates.id))
      .where(and(...where))
      .orderBy(desc(sortExpr), desc(sessions.id))
      .limit(limit + 1);

    const items = rows.slice(0, limit);
    // Fetch interview-type rows for every linked candidate in one query.
    const candidateIds = items
      .map((r) => r.candidate?.id)
      .filter((x): x is string => !!x);
    let typesByCandidate = new Map<string, Array<{ key: string; label: string }>>();
    if (candidateIds.length > 0) {
      const typeRows = await db
        .select({
          candidateId: candidateInterviewTypes.candidateId,
          key: interviewTypes.key,
          label: interviewTypes.label,
        })
        .from(candidateInterviewTypes)
        .innerJoin(interviewTypes, eq(candidateInterviewTypes.interviewTypeId, interviewTypes.id))
        .where(inArray(candidateInterviewTypes.candidateId, candidateIds));
      typesByCandidate = typeRows.reduce((acc, r) => {
        const arr = acc.get(r.candidateId) ?? [];
        arr.push({ key: r.key, label: r.label });
        acc.set(r.candidateId, arr);
        return acc;
      }, new Map<string, Array<{ key: string; label: string }>>());
    }

    const nextCursor =
      rows.length > limit
        ? encodeHistoryCursor(items[items.length - 1]!.session)
        : null;

    return {
      items: items.map((r) => ({
        session: r.session,
        interviewer: r.interviewer?.id ? r.interviewer : null,
        candidate: r.candidate?.id ? r.candidate : null,
        candidateInterviewTypes: r.candidate?.id ? (typesByCandidate.get(r.candidate.id) ?? []) : [],
      })),
      nextCursor,
    };
  },

  /** Phase 12 reaper helper. Soft-deleted rows (Phase 24) are excluded — a
   * user who chose to KEEP the volume on history-delete must not have it
   * reclaimed out from under them. */
  async listErrorOlderThan(maxAgeMs: number): Promise<Session[]> {
    const cutoff = new Date(Date.now() - maxAgeMs);
    return getDb()
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.status, 'error'),
          lt(sessions.updatedAt, cutoff),
          isNotNull(sessions.containerId),
          isNull(sessions.deletedAt),
        ),
      );
  },

  /** Phase 12 reaper helper. Soft-deleted rows excluded (Phase 24). */
  async listRecoverableOlderThan(maxAgeMs: number): Promise<Session[]> {
    const cutoff = new Date(Date.now() - maxAgeMs);
    return getDb()
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.status, 'recoverable'),
          lt(sessions.updatedAt, cutoff),
          isNull(sessions.deletedAt),
        ),
      );
  },

  async findByContainerId(containerId: string): Promise<Session | null> {
    const [row] = await getDb()
      .select()
      .from(sessions)
      .where(eq(sessions.containerId, containerId))
      .limit(1);
    return row ?? null;
  },
};
