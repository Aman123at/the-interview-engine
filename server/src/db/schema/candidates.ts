import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  index,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { interviewTypes } from './interviewTypes.js';

export const candidates = pgTable(
  'candidates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /**
     * HR-typed identifier. EDITABLE later, so NOT the primary key. A partial
     * unique index in the migration enforces non-deleted uniqueness.
     */
    externalId: varchar('external_id', { length: 120 }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    byCreatedBy: index('candidates_created_by_idx').on(t.createdBy),
  }),
);

export type Candidate = typeof candidates.$inferSelect;
export type NewCandidate = typeof candidates.$inferInsert;

export const candidateInterviewTypes = pgTable(
  'candidate_interview_types',
  {
    candidateId: uuid('candidate_id')
      .notNull()
      .references(() => candidates.id, { onDelete: 'cascade' }),
    interviewTypeId: uuid('interview_type_id')
      .notNull()
      .references(() => interviewTypes.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.candidateId, t.interviewTypeId] }),
    byType: index('candidate_interview_types_type_idx').on(t.interviewTypeId),
  }),
);

export type CandidateInterviewType = typeof candidateInterviewTypes.$inferSelect;
export type NewCandidateInterviewType = typeof candidateInterviewTypes.$inferInsert;
