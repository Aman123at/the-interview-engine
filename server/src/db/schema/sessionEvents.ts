import { pgTable, pgEnum, uuid, varchar, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { sessions } from './sessions.js';

export const sessionEventLevelEnum = pgEnum('session_event_level', ['info', 'warn', 'error']);

export type SessionEventLevel = (typeof sessionEventLevelEnum.enumValues)[number];

/**
 * Known event types. Stored as varchar (not an enum) because Phase 6/7/12 keep
 * adding more — extending a Postgres enum is awkward, and an append-only audit
 * log shouldn't constrain new lifecycle additions. The TS union below is the
 * canonical list — the DAL writes through it for type safety.
 */
export const SESSION_EVENT_TYPES = [
  'ws_init',
  'ws_reconnect',
  'ws_disconnect',
  'container_create',
  'container_start',
  'container_ready',
  'container_stop',
  'container_destroy',
  'container_die',
  'container_oom',
  'preview_ready',
  'session_resume',
  'session_close',
  'error',
] as const;

export type SessionEventType = (typeof SESSION_EVENT_TYPES)[number] | (string & {});

export const sessionEvents = pgTable(
  'session_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 64 }).notNull(),
    payload: jsonb('payload').notNull().default({}),
    level: sessionEventLevelEnum('level').notNull().default('info'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    bySession: index('session_events_session_idx').on(t.sessionId, t.createdAt),
    byType: index('session_events_type_idx').on(t.type),
  }),
);

export type SessionEvent = typeof sessionEvents.$inferSelect;
export type NewSessionEvent = typeof sessionEvents.$inferInsert;
