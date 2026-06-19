import { eq } from 'drizzle-orm';
import { getDb } from '@/db/connection.js';
import {
  interviewTypes,
  type InterviewType,
  type NewInterviewType,
} from '@/db/schema/index.js';

export const interviewTypesDal = {
  async list(): Promise<InterviewType[]> {
    return getDb().select().from(interviewTypes);
  },

  async findByKey(key: string): Promise<InterviewType | null> {
    const [row] = await getDb()
      .select()
      .from(interviewTypes)
      .where(eq(interviewTypes.key, key))
      .limit(1);
    return row ?? null;
  },

  async upsertByKey(input: NewInterviewType): Promise<InterviewType> {
    const [row] = await getDb()
      .insert(interviewTypes)
      .values(input)
      .onConflictDoUpdate({
        target: interviewTypes.key,
        set: { label: input.label, isActive: input.isActive ?? true },
      })
      .returning();
    if (!row) throw new Error('interviewTypesDal.upsertByKey: no row returned');
    return row;
  },
};
