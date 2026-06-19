/**
 * Data access for Phase 19 design documents. Container-free: no port/volume/
 * Docker concerns and NOT subject to the hard one-session rule. Mirrors the
 * shape of the other DALs (one file per entity, all queries flow through here).
 */
import { and, desc, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/db/connection.js';
import {
  designDocuments,
  type DesignDocument,
  type DesignDocKind,
  type DesignDbEngine,
} from '@/db/schema/index.js';

export interface CreateDesignDocInput {
  userId: string;
  kind: DesignDocKind;
  title: string;
  /** Required when kind='db_design'; must be null for kind='system_design'. */
  dbEngine: DesignDbEngine | null;
  document: unknown;
  thumbnail?: string | null;
}

export interface UpdateDesignDocFields {
  title?: string;
  document?: unknown;
  thumbnail?: string | null;
}

export const designDocumentsDal = {
  async create(input: CreateDesignDocInput): Promise<DesignDocument> {
    const [row] = await getDb()
      .insert(designDocuments)
      .values({
        userId: input.userId,
        kind: input.kind,
        title: input.title,
        dbEngine: input.dbEngine,
        document: (input.document ?? {}) as object,
        thumbnail: input.thumbnail ?? null,
      })
      .returning();
    if (!row) throw new Error('designDocumentsDal.create: insert returned no row');
    return row;
  },

  /**
   * Resolve a doc by id, ignoring ownership. The WS design-room layer uses
   * this to hydrate the canvas for the owner (already authorized by JWT) and
   * for the share-token endpoint to look up by id once the token is matched.
   */
  async findById(id: string): Promise<DesignDocument | null> {
    const [row] = await getDb()
      .select()
      .from(designDocuments)
      .where(and(eq(designDocuments.id, id), isNull(designDocuments.deletedAt)))
      .limit(1);
    return row ?? null;
  },

  async getByIdForUser(id: string, userId: string): Promise<DesignDocument | null> {
    const [row] = await getDb()
      .select()
      .from(designDocuments)
      .where(
        and(
          eq(designDocuments.id, id),
          eq(designDocuments.userId, userId),
          isNull(designDocuments.deletedAt),
        ),
      )
      .limit(1);
    return row ?? null;
  },

  async listByUser(
    userId: string,
    opts: { kind?: DesignDocKind } = {},
  ): Promise<DesignDocument[]> {
    const where = opts.kind
      ? and(
          eq(designDocuments.userId, userId),
          eq(designDocuments.kind, opts.kind),
          isNull(designDocuments.deletedAt),
        )
      : and(eq(designDocuments.userId, userId), isNull(designDocuments.deletedAt));

    return getDb()
      .select()
      .from(designDocuments)
      .where(where)
      .orderBy(desc(designDocuments.updatedAt));
  },

  async update(
    id: string,
    userId: string,
    fields: UpdateDesignDocFields,
  ): Promise<DesignDocument | null> {
    // Build the update set narrowly so untouched columns aren't overwritten
    // with undefined (Drizzle would otherwise set them to null).
    const patch: Record<string, unknown> = {};
    if (fields.title !== undefined) patch.title = fields.title;
    if (fields.document !== undefined) patch.document = fields.document as object;
    if (fields.thumbnail !== undefined) patch.thumbnail = fields.thumbnail;
    if (Object.keys(patch).length === 0) {
      // Nothing to write — return the current row so callers get a fresh copy.
      return this.getByIdForUser(id, userId);
    }
    const [row] = await getDb()
      .update(designDocuments)
      .set(patch)
      .where(
        and(
          eq(designDocuments.id, id),
          eq(designDocuments.userId, userId),
          isNull(designDocuments.deletedAt),
        ),
      )
      .returning();
    return row ?? null;
  },

  /**
   * Resolve a doc by its (unguessable) share token. Used by the public
   * unauthenticated share endpoint and the WS handshake; ignores ownership.
   * Soft-deleted docs are excluded so a revoked-then-deleted doc never leaks.
   */
  async findByShareToken(token: string): Promise<DesignDocument | null> {
    const [row] = await getDb()
      .select()
      .from(designDocuments)
      .where(
        and(eq(designDocuments.shareToken, token), isNull(designDocuments.deletedAt)),
      )
      .limit(1);
    return row ?? null;
  },

  /**
   * Set or clear the share token. Pass `null` to revoke; the partial unique
   * index on `(share_token) WHERE share_token IS NOT NULL` keeps tokens
   * collision-free without rejecting many simultaneously-unshared rows.
   */
  async setShareToken(
    id: string,
    userId: string,
    token: string | null,
  ): Promise<DesignDocument | null> {
    const [row] = await getDb()
      .update(designDocuments)
      .set({ shareToken: token })
      .where(
        and(
          eq(designDocuments.id, id),
          eq(designDocuments.userId, userId),
          isNull(designDocuments.deletedAt),
        ),
      )
      .returning();
    return row ?? null;
  },

  /**
   * Update only the `document` field of a doc, bypassing the per-user
   * ownership check. The caller (collaborative WS layer) authorizes via room
   * membership instead: any peer admitted to the design room may persist
   * scene updates.
   */
  async updateDocumentById(
    id: string,
    document: unknown,
  ): Promise<DesignDocument | null> {
    const [row] = await getDb()
      .update(designDocuments)
      .set({ document: document as object })
      .where(and(eq(designDocuments.id, id), isNull(designDocuments.deletedAt)))
      .returning();
    return row ?? null;
  },

  async softDelete(id: string, userId: string): Promise<boolean> {
    const result = await getDb()
      .update(designDocuments)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(designDocuments.id, id),
          eq(designDocuments.userId, userId),
          isNull(designDocuments.deletedAt),
        ),
      )
      .returning({ id: designDocuments.id });
    return result.length > 0;
  },
};
