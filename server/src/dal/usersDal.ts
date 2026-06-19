import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/db/connection.js';
import {
  users,
  interviewerSpecializations,
  type User,
  type NewUser,
  type UserRole,
  type Level,
} from '@/db/schema/index.js';

export const usersDal = {
  async create(input: NewUser): Promise<User> {
    const [row] = await getDb().insert(users).values(input).returning();
    if (!row) throw new Error('usersDal.create: insert returned no row');
    return row;
  },

  async findById(id: string): Promise<User | null> {
    const [row] = await getDb()
      .select()
      .from(users)
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .limit(1);
    return row ?? null;
  },

  async findByEmail(email: string): Promise<User | null> {
    const normalized = email.trim().toLowerCase();
    const [row] = await getDb()
      .select()
      .from(users)
      .where(and(eq(users.email, normalized), isNull(users.deletedAt)))
      .limit(1);
    return row ?? null;
  },

  async setActive(id: string, isActive: boolean): Promise<User | null> {
    const [row] = await getDb()
      .update(users)
      .set({ isActive })
      .where(eq(users.id, id))
      .returning();
    return row ?? null;
  },

  async upsertByEmail(input: Omit<NewUser, 'email'> & { email: string }): Promise<User> {
    const normalized = input.email.trim().toLowerCase();
    const [row] = await getDb()
      .insert(users)
      .values({ ...input, email: normalized })
      .onConflictDoUpdate({
        target: users.email,
        set: {
          passwordHash: input.passwordHash,
          displayName: input.displayName,
          role: input.role,
          isActive: input.isActive ?? true,
        },
      })
      .returning();
    if (!row) throw new Error('usersDal.upsertByEmail: insert returned no row');
    return row;
  },

  async softDelete(id: string): Promise<void> {
    await getDb().update(users).set({ deletedAt: new Date() }).where(eq(users.id, id));
  },

  /** List non-deleted users by role, ordered by created_at asc. */
  async listByRole(role: UserRole): Promise<User[]> {
    return getDb()
      .select()
      .from(users)
      .where(and(eq(users.role, role), isNull(users.deletedAt)))
      .orderBy(asc(users.createdAt));
  },

  /**
   * Partial update of profile fields. Caller decides whether to include
   * passwordHash (bcrypt-hashed by the route layer). `updatedAt` is bumped by
   * the table trigger so we omit it here.
   */
  async updateProfile(
    id: string,
    patch: { displayName?: string; isActive?: boolean; passwordHash?: string },
  ): Promise<User | null> {
    if (Object.keys(patch).length === 0) {
      return this.findById(id);
    }
    const [row] = await getDb()
      .update(users)
      .set(patch)
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .returning();
    return row ?? null;
  },

  /**
   * Bulk-insert interviewer users + their specializations in ONE transaction.
   * Rolls the entire batch back on any failure (including a race on the email
   * unique index). Returns inserted users in the input order.
   */
  async bulkCreateInterviewers(
    items: Array<{
      email: string;
      passwordHash: string;
      displayName: string;
      specializations: Array<{ interviewTypeId: string; level: Level }>;
    }>,
  ): Promise<User[]> {
    if (items.length === 0) return [];
    const db = getDb();
    return db.transaction(async (tx) => {
      const inserted = await tx
        .insert(users)
        .values(
          items.map((it) => ({
            email: it.email,
            passwordHash: it.passwordHash,
            displayName: it.displayName,
            role: 'interviewer' as UserRole,
            isActive: true,
          })),
        )
        .returning();
      const links: Array<{ userId: string; interviewTypeId: string; level: Level }> = [];
      for (let i = 0; i < inserted.length; i += 1) {
        const row = inserted[i]!;
        for (const s of items[i]!.specializations) {
          links.push({ userId: row.id, interviewTypeId: s.interviewTypeId, level: s.level });
        }
      }
      if (links.length > 0) {
        await tx.insert(interviewerSpecializations).values(links);
      }
      return inserted;
    });
  },

  /**
   * Bump `token_version`, invalidating every outstanding refresh token for
   * this user. Called on logout and (later) on password reset.
   * Returns the new tokenVersion.
   */
  async bumpTokenVersion(id: string): Promise<number | null> {
    const [row] = await getDb()
      .update(users)
      .set({ tokenVersion: sql`${users.tokenVersion} + 1` })
      .where(eq(users.id, id))
      .returning({ tokenVersion: users.tokenVersion });
    return row?.tokenVersion ?? null;
  },
};
