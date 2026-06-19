/**
 * NOTE: types moved to src/contracts/ws.ts in Phase 16 (single source of truth
 * for the wire). This file is a re-export shim so existing imports keep
 * working — the WS layer needs no churn.
 */
export type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
  TypedError,
  AckOrError,
  JoinResponse,
  PreviewInfo,
  FileReadResponse,
  FileWriteResponse,
  Session,
  SessionEvent,
  TreeNode,
} from '@/contracts/ws.js';
