import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  jsonb,
  integer,
  smallint,
  boolean,
  text,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { candidates } from './candidates.js';

export const sessionStatusEnum = pgEnum('session_status', [
  'pending',
  'initializing',
  'running',
  'saving',
  'ended',
  'error',
  'recoverable',
]);

export type SessionStatus = (typeof sessionStatusEnum.enumValues)[number];

/** Non-terminal states for the hard one-session rule. */
export const NON_TERMINAL_STATUSES = [
  'pending',
  'initializing',
  'running',
  'saving',
  'recoverable',
] as const satisfies readonly SessionStatus[];

export const TERMINAL_STATUSES = ['ended', 'error'] as const satisfies readonly SessionStatus[];

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    framework: varchar('framework', { length: 40 }).notNull(),
    customization: jsonb('customization').notNull().default({}),
    status: sessionStatusEnum('status').notNull().default('pending'),
    containerId: varchar('container_id', { length: 128 }),
    volumeName: varchar('volume_name', { length: 128 }),
    hostPreviewPort: integer('host_preview_port'),
    /** Unguessable token granting an unauthenticated candidate access to THIS
     * session. NULL until the interviewer enables sharing. */
    shareToken: varchar('share_token', { length: 64 }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    lastActiveAt: timestamp('last_active_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    /** Phase 25: candidate rating (1..5), set at close. */
    candidateRating: smallint('candidate_rating'),
    /** Phase 25: free-text interviewer-supplied identifier for the candidate. */
    candidateId: text('candidate_id'),
    /** Phase 24: flips true when the Docker volume is removed. */
    volumeDeleted: boolean('volume_deleted').notNull().default(false),
    /** Phase 24: soft-delete for "remove from history". */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    /** Phase 30: stable FK to candidates(id). Free-text candidateId stays as snapshot/fallback. */
    candidateRecordId: uuid('candidate_record_id').references(() => candidates.id, {
      onDelete: 'set null',
    }),
  },
  (t) => ({
    byUser: index('sessions_user_id_idx').on(t.userId),
    byStatus: index('sessions_status_idx').on(t.status),
    byUserCreated: index('sessions_user_created_idx').on(t.userId, t.createdAt),
  }),
);

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
