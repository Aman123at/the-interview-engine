/**
 * Tiny in-process event bus.
 *
 * Used to decouple the WS layer from the services that produce events
 * (sessionService, lifecycleService). Today it's a single-process
 * EventEmitter; a Redis adapter could replace this without touching
 * producer/consumer call sites.
 *
 * Channels we care about today:
 *   - 'session.event'   → relay session_events rows over the socket
 *   - 'session.status'  → relay status transitions explicitly
 */
import { EventEmitter } from 'node:events';
import type { SessionEvent } from '@/db/schema/index.js';

export interface SessionEventMessage {
  sessionId: string;
  event: SessionEvent;
}

export interface SessionStatusMessage {
  sessionId: string;
  status: string;
}

/** Candidate presence for a shared session changed (drives the read-only swap). */
export interface ShareStateMessage {
  sessionId: string;
  candidatePresent: boolean;
}

/** The owner revoked or deleted a shared design doc — evict live guests. */
export interface DesignClosedMessage {
  docId: string;
  reason: 'revoked' | 'deleted';
}

interface BusEvents {
  'session.event': (msg: SessionEventMessage) => void;
  'session.status': (msg: SessionStatusMessage) => void;
  'share.state': (msg: ShareStateMessage) => void;
  'design.closed': (msg: DesignClosedMessage) => void;
}

class TypedEmitter extends EventEmitter {
  override emit<K extends keyof BusEvents>(event: K, ...args: Parameters<BusEvents[K]>): boolean {
    return super.emit(event, ...args);
  }
  override on<K extends keyof BusEvents>(event: K, listener: BusEvents[K]): this {
    return super.on(event, listener);
  }
  override off<K extends keyof BusEvents>(event: K, listener: BusEvents[K]): this {
    return super.off(event, listener);
  }
}

export const eventBus = new TypedEmitter();
// Avoid the "MaxListenersExceededWarning" if we run many sessions.
eventBus.setMaxListeners(0);
