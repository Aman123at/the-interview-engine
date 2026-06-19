import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
} from 'drizzle-orm/pg-core';

/**
 * User roles. Modeled as TEXT + a CHECK constraint at the DB level
 * (see migration 0007_rbac) so the set is trivially reversible/extendable
 * without an ALTER TYPE dance.
 */
export const USER_ROLES = ['admin', 'hr', 'interviewer'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 320 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: varchar('display_name', { length: 120 }).notNull(),
  role: text('role').$type<UserRole>().notNull().default('interviewer'),
  isActive: boolean('is_active').notNull().default(true),
  // Bumped on logout / password reset — invalidates outstanding refresh tokens.
  tokenVersion: integer('token_version').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
