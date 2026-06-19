import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '@/db/connection.js';
import { sessionFiles, type SessionFile } from '@/db/schema/index.js';
import { ConflictError } from '@/errors/index.js';

export interface UpsertFileInput {
  sessionId: string;
  path: string;
  content: string;
  /**
   * Optimistic-concurrency version. When provided, the write is only applied if
   * the stored row's `version` matches `expectedVersion`. The new row's version
   * is set to `expectedVersion + 1`. Used by Phase 7's idempotent file sync.
   */
  expectedVersion?: number;
}

export const sessionFilesDal = {
  /**
   * Upsert a file row. If `expectedVersion` is provided, performs a
   * last-write-wins-with-version-check upsert and throws ConflictError on
   * version mismatch. Otherwise increments version unconditionally.
   */
  async upsert(input: UpsertFileInput): Promise<SessionFile> {
    const size = Buffer.byteLength(input.content, 'utf8');

    if (input.expectedVersion === undefined) {
      const [row] = await getDb()
        .insert(sessionFiles)
        .values({
          sessionId: input.sessionId,
          path: input.path,
          content: input.content,
          size,
          version: 1,
        })
        .onConflictDoUpdate({
          target: [sessionFiles.sessionId, sessionFiles.path],
          set: {
            content: input.content,
            size,
            version: sql`${sessionFiles.version} + 1`,
          },
        })
        .returning();
      if (!row) throw new Error('sessionFilesDal.upsert: insert returned no row');
      return row;
    }

    // Versioned path: conditional update wrapped around insert-or-update.
    const expected = input.expectedVersion;
    const nextVersion = expected + 1;

    // Try insert-if-absent first.
    if (expected === 0) {
      try {
        const [row] = await getDb()
          .insert(sessionFiles)
          .values({
            sessionId: input.sessionId,
            path: input.path,
            content: input.content,
            size,
            version: 1,
          })
          .returning();
        if (!row) throw new Error('sessionFilesDal.upsert: insert returned no row');
        return row;
      } catch (err) {
        if (
          typeof err === 'object' &&
          err !== null &&
          'code' in err &&
          (err as { code?: string }).code === '23505'
        ) {
          throw new ConflictError('sessionFiles version conflict (row already exists)', {
            sessionId: input.sessionId,
            path: input.path,
          });
        }
        throw err;
      }
    }

    const [row] = await getDb()
      .update(sessionFiles)
      .set({ content: input.content, size, version: nextVersion })
      .where(
        and(
          eq(sessionFiles.sessionId, input.sessionId),
          eq(sessionFiles.path, input.path),
          eq(sessionFiles.version, expected),
        ),
      )
      .returning();
    if (!row) {
      throw new ConflictError('sessionFiles version conflict', {
        sessionId: input.sessionId,
        path: input.path,
        expectedVersion: expected,
      });
    }
    return row;
  },

  async findByPath(sessionId: string, path: string): Promise<SessionFile | null> {
    const [row] = await getDb()
      .select()
      .from(sessionFiles)
      .where(and(eq(sessionFiles.sessionId, sessionId), eq(sessionFiles.path, path)))
      .limit(1);
    return row ?? null;
  },

  async listForSession(sessionId: string): Promise<SessionFile[]> {
    return getDb()
      .select()
      .from(sessionFiles)
      .where(eq(sessionFiles.sessionId, sessionId));
  },

  async deleteByPath(sessionId: string, path: string): Promise<boolean> {
    const res = await getDb()
      .delete(sessionFiles)
      .where(and(eq(sessionFiles.sessionId, sessionId), eq(sessionFiles.path, path)))
      .returning({ id: sessionFiles.id });
    return res.length > 0;
  },

  async rename(sessionId: string, fromPath: string, toPath: string): Promise<SessionFile | null> {
    const [row] = await getDb()
      .update(sessionFiles)
      .set({ path: toPath })
      .where(and(eq(sessionFiles.sessionId, sessionId), eq(sessionFiles.path, fromPath)))
      .returning();
    return row ?? null;
  },

  async deleteAllForSession(sessionId: string): Promise<number> {
    const res = await getDb()
      .delete(sessionFiles)
      .where(eq(sessionFiles.sessionId, sessionId))
      .returning({ id: sessionFiles.id });
    return res.length;
  },
};
