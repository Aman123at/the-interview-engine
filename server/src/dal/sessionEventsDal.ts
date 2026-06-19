import { asc, eq } from 'drizzle-orm';
import { getDb } from '@/db/connection.js';
import { eventBus } from '@/utils/eventBus.js';
import {
  sessionEvents,
  type SessionEvent,
  type SessionEventLevel,
  type SessionEventType,
} from '@/db/schema/index.js';

export interface AppendEventInput {
  sessionId: string;
  type: SessionEventType;
  payload?: Record<string, unknown>;
  level?: SessionEventLevel;
}

export const sessionEventsDal = {
  async append(input: AppendEventInput): Promise<SessionEvent> {
    const [row] = await getDb()
      .insert(sessionEvents)
      .values({
        sessionId: input.sessionId,
        type: input.type,
        payload: input.payload ?? {},
        level: input.level ?? 'info',
      })
      .returning();
    if (!row) throw new Error('sessionEventsDal.append: insert returned no row');
    // Publish to in-process bus so the WS layer (Phase 7) can relay to the
    // session room. Listeners are sync EventEmitters — exceptions inside
    // listeners are isolated from this DAL call.
    eventBus.emit('session.event', { sessionId: row.sessionId, event: row });
    return row;
  },

  async listForSession(sessionId: string, limit = 500): Promise<SessionEvent[]> {
    return getDb()
      .select()
      .from(sessionEvents)
      .where(eq(sessionEvents.sessionId, sessionId))
      .orderBy(asc(sessionEvents.createdAt))
      .limit(limit);
  },
};
