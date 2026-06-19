import { eq } from 'drizzle-orm';
import { getDb } from '@/db/connection.js';
import {
  interviewerSpecializations,
  interviewTypes,
  type Level,
} from '@/db/schema/index.js';

export interface SpecializationWithType {
  interviewTypeId: string;
  interviewType: { id: string; key: string; label: string; isActive: boolean };
  level: Level;
}

export const interviewerSpecializationsDal = {
  async listForUser(userId: string): Promise<SpecializationWithType[]> {
    const rows = await getDb()
      .select({
        interviewTypeId: interviewerSpecializations.interviewTypeId,
        level: interviewerSpecializations.level,
        typeId: interviewTypes.id,
        typeKey: interviewTypes.key,
        typeLabel: interviewTypes.label,
        typeActive: interviewTypes.isActive,
      })
      .from(interviewerSpecializations)
      .innerJoin(interviewTypes, eq(interviewerSpecializations.interviewTypeId, interviewTypes.id))
      .where(eq(interviewerSpecializations.userId, userId));

    return rows.map((r) => ({
      interviewTypeId: r.interviewTypeId,
      level: r.level,
      interviewType: {
        id: r.typeId,
        key: r.typeKey,
        label: r.typeLabel,
        isActive: r.typeActive,
      },
    }));
  },

  async upsert(
    userId: string,
    interviewTypeId: string,
    level: Level,
  ): Promise<void> {
    await getDb()
      .insert(interviewerSpecializations)
      .values({ userId, interviewTypeId, level })
      .onConflictDoUpdate({
        target: [interviewerSpecializations.userId, interviewerSpecializations.interviewTypeId],
        set: { level },
      });
  },

  /**
   * Replace the entire (type, level) set for a user. Used by
   * PATCH /admin/interviewers/:id when the admin sends a `specializations`
   * array. Wrapped in a transaction so the user is never half-updated.
   */
  async replaceForUser(
    userId: string,
    items: Array<{ interviewTypeId: string; level: Level }>,
  ): Promise<void> {
    const db = getDb();
    await db.transaction(async (tx) => {
      await tx
        .delete(interviewerSpecializations)
        .where(eq(interviewerSpecializations.userId, userId));
      if (items.length > 0) {
        await tx
          .insert(interviewerSpecializations)
          .values(items.map((i) => ({ userId, interviewTypeId: i.interviewTypeId, level: i.level })));
      }
    });
  },
};
