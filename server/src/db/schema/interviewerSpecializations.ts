import { pgTable, uuid, text, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { interviewTypes } from './interviewTypes.js';

export const LEVELS = ['L1', 'L2', 'L3'] as const;
export type Level = (typeof LEVELS)[number];

export const interviewerSpecializations = pgTable(
  'interviewer_specializations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    interviewTypeId: uuid('interview_type_id')
      .notNull()
      .references(() => interviewTypes.id, { onDelete: 'restrict' }),
    level: text('level').$type<Level>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byUser: index('interviewer_specializations_user_idx').on(t.userId),
    userTypeUniq: uniqueIndex('interviewer_specializations_user_type_uniq').on(
      t.userId,
      t.interviewTypeId,
    ),
  }),
);

export type InterviewerSpecialization = typeof interviewerSpecializations.$inferSelect;
export type NewInterviewerSpecialization = typeof interviewerSpecializations.$inferInsert;
