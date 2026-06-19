import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sessions } from './sessions.js';

/**
 * Durable copy of source files for recovery — EXCLUDES node_modules.
 * Written via the file-sync layer (Phase 7); restored on resume (Phase 11).
 */
export const sessionFiles = pgTable(
  'session_files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    path: varchar('path', { length: 1024 }).notNull(),
    content: text('content').notNull().default(''),
    size: integer('size').notNull().default(0),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqSessionPath: uniqueIndex('session_files_session_path_uniq').on(t.sessionId, t.path),
  }),
);

export type SessionFile = typeof sessionFiles.$inferSelect;
export type NewSessionFile = typeof sessionFiles.$inferInsert;
