import { pgTable, uuid, varchar, boolean, timestamp } from 'drizzle-orm/pg-core';

export const interviewTypes = pgTable('interview_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: varchar('key', { length: 64 }).notNull().unique(),
  label: varchar('label', { length: 120 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type InterviewType = typeof interviewTypes.$inferSelect;
export type NewInterviewType = typeof interviewTypes.$inferInsert;
