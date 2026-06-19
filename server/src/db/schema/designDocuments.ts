import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const designDocKindEnum = pgEnum('design_doc_kind', ['db_design', 'system_design']);
export type DesignDocKind = (typeof designDocKindEnum.enumValues)[number];

export const designDbEngineEnum = pgEnum('design_db_engine', ['postgresql', 'mysql', 'mongodb']);
export type DesignDbEngine = (typeof designDbEngineEnum.enumValues)[number];

/**
 * Phase 19 — design-interview documents (Database Design + System Design).
 *
 * Independent from the `sessions` track: no container, no port, no volume,
 * and NOT subject to the partial-unique one-session index. A user can hold
 * any number of design docs concurrently with a code session.
 */
export const designDocuments = pgTable(
  'design_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    kind: designDocKindEnum('kind').notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    /** Only set for kind='db_design'. CHECK constraint enforces in the DB. */
    dbEngine: designDbEngineEnum('db_engine'),
    /** Per-kind canvas model. Shape validated by the contract; jsonb here. */
    document: jsonb('document').notNull().default({}),
    /** Optional small preview image (data URL or ref). */
    thumbnail: text('thumbnail'),
    /**
     * Unguessable token that grants UNAUTHENTICATED guests live access to this
     * doc's collaborative canvas. NULL = sharing disabled. Unique-while-non-null
     * at the DB via `design_documents_share_token_uniq`.
     */
    shareToken: varchar('share_token', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    byUser: index('design_documents_user_idx').on(t.userId),
    byUserKind: index('design_documents_user_kind_idx').on(t.userId, t.kind, t.updatedAt),
  }),
);

export type DesignDocument = typeof designDocuments.$inferSelect;
export type NewDesignDocument = typeof designDocuments.$inferInsert;
