// ============================================================
// AUTO-GENERATED — DO NOT EDIT
// Source of truth: interview-sandbox-server/src/contracts/
// Regenerate via `pnpm contracts:sync` in the server repo.
// ============================================================
/**
 * WebSocket contract — typed event surface for client + server.
 *
 * Moved here from src/ws/types.ts; the old path is now a re-export shim. The
 * contract is dependency-light so the client repo can consume it verbatim.
 *
 * IMPORTANT: keep payload shapes EXACT — adding/removing fields is a wire
 * change and requires bumping the contract.
 */
import type {
  SessionStatus,
  TerminalKind,
  ShareRole,
  DesignRole,
  SessionEventLevel,
  SessionEventType,
} from './enums.js';
import type { DesignPeer, DesignDocumentDTO } from './design.js';

// --- Shared row shapes (kept structurally compatible with the server's
// Drizzle row types — date fields accept Date | string so the same shape
// is valid before and after JSON serialization). -------------------------

export interface Session {
  id: string;
  userId: string;
  framework: string;
  customization: unknown;
  status: SessionStatus;
  containerId: string | null;
  volumeName: string | null;
  hostPreviewPort: number | null;
  shareToken: string | null;
  startedAt: Date | string | null;
  endedAt: Date | string | null;
  lastActiveAt: Date | string;
  createdAt: Date | string;
  updatedAt: Date | string;
  /** Phase 22+: candidate rating (1..5), set at close. */
  candidateRating: number | null;
  /** Phase 22+: free-text candidate identifier set at close. */
  candidateId: string | null;
  /** Phase 22+: true once the Docker volume has been removed. */
  volumeDeleted: boolean;
  /** Phase 22+: soft-delete timestamp for "remove from history". */
  deletedAt: Date | string | null;
  /** Phase 30d: stable FK to candidates(id). NULL until the interviewer links one. */
  candidateRecordId: string | null;
}

export interface SessionEvent {
  id: string;
  sessionId: string;
  type: SessionEventType;
  payload: unknown;
  level: SessionEventLevel;
  createdAt: Date | string;
}

export interface TreeNode {
  path: string;
  type: 'file' | 'dir';
  size?: number;
}

// --- WS event names (as const for downstream switch/discriminated unions) --

export const CLIENT_TO_SERVER_EVENTS = [
  'session:join',
  'file:read',
  'file:write',
  'file:delete',
  'file:rename',
  'file:mkdir',
  'file:tree',
  'term:open',
  'term:reattach',
  'term:write',
  'term:resize',
  'term:close',
  'share:leave',
  // --- Design canvas (multi-user) ---
  'design:join',
  'design:leave',
  'design:cursor',
  'design:scene',
] as const;
export type ClientToServerEventName = (typeof CLIENT_TO_SERVER_EVENTS)[number];

export const SERVER_TO_CLIENT_EVENTS = [
  'lifecycle:event',
  'lifecycle:status',
  'connection:health',
  'file:changed',
  'fs:invalidate',
  'term:data',
  'term:exit',
  'share:state',
  'error:typed',
  // legacy preview-ready alias (still emitted alongside session:preview)
  'preview_ready',
  // --- Design canvas (multi-user) ---
  'design:presence',
  'design:cursor',
  'design:scene',
  'design:closed',
] as const;
export type ServerToClientEventName = (typeof SERVER_TO_CLIENT_EVENTS)[number];

// --- Client → Server -------------------------------------------------------

export interface ClientToServerEvents {
  /** Join the session room. Server resyncs immediately after. */
  'session:join': (
    payload: { sessionId: string },
    ack: (resp: JoinResponse | TypedError) => void,
  ) => void;

  // Files
  'file:read': (
    payload: { path: string },
    ack: (resp: FileReadResponse | TypedError) => void,
  ) => void;
  'file:write': (
    payload: { path: string; content: string; expectedVersion: number },
    ack: (resp: FileWriteResponse | TypedError) => void,
  ) => void;
  'file:delete': (
    payload: { path: string },
    ack: (resp: AckOrError) => void,
  ) => void;
  'file:rename': (
    payload: { from: string; to: string },
    ack: (resp: AckOrError) => void,
  ) => void;
  'file:mkdir': (
    payload: { path: string },
    ack: (resp: AckOrError) => void,
  ) => void;
  'file:tree': (
    payload: Record<string, never>,
    ack: (resp: { tree: TreeNode[] } | TypedError) => void,
  ) => void;

  // Terminal
  'term:open': (
    payload: { cols?: number; rows?: number; kind?: TerminalKind },
    ack: (
      resp: { tabId: string; kind: TerminalKind; label: string } | TypedError,
    ) => void,
  ) => void;
  'term:reattach': (
    payload: { tabId: string },
    ack: (
      resp:
        | {
            tabId: string;
            backlog: string;
            cols: number;
            rows: number;
            kind: TerminalKind;
            label: string;
          }
        | TypedError,
    ) => void,
  ) => void;
  'term:write': (payload: { tabId: string; data: string }) => void;
  'term:resize': (payload: { tabId: string; cols: number; rows: number }) => void;
  'term:close': (
    payload: { tabId: string },
    ack: (resp: AckOrError) => void,
  ) => void;

  // Sharing
  'share:leave': (
    payload: Record<string, never>,
    ack: (resp: AckOrError) => void,
  ) => void;

  // --- Design canvas (multi-user) ----------------------------------------
  /**
   * Join a design-doc room. Owner authenticates via JWT and must own the doc;
   * a guest authenticates via the `designShareToken` at handshake time. The
   * server admits up to DESIGN_ROOM_MAX_PEERS per doc; the (5+1)th gets a
   * SHARE_IN_USE-style typed error in the ack.
   */
  'design:join': (
    payload: { docId: string },
    ack: (resp: DesignJoinResponse | TypedError) => void,
  ) => void;

  /** Explicit leave — drops the peer immediately (no grace). */
  'design:leave': (
    payload: Record<string, never>,
    ack: (resp: AckOrError) => void,
  ) => void;

  /**
   * Pointer position in SCENE coordinates (the canvas decides what to
   * render). High-frequency; the server fan-outs as-is and never persists.
   * `null` x/y → hide cursor (pointer left the canvas).
   */
  'design:cursor': (payload: {
    x: number | null;
    y: number | null;
  }) => void;

  /**
   * Authoritative scene snapshot from the editor that just changed. Server
   * fan-outs to other peers and persists via the standard design-doc
   * autosave path (no per-edit auth check past the room membership — every
   * admitted peer can edit, per the multi-user model).
   */
  'design:scene': (payload: { document: unknown }) => void;
}

// --- Server → Client -------------------------------------------------------

export interface ServerToClientEvents {
  'lifecycle:event': (event: SessionEvent) => void;
  'lifecycle:status': (payload: { sessionId: string; status: SessionStatus | string }) => void;
  'connection:health': (payload: {
    status: 'connected' | 'resync' | 'lost';
    recovered?: boolean;
  }) => void;

  'file:changed': (payload: {
    path: string;
    version: number;
    kind: 'write' | 'delete' | 'rename';
    from?: string;
  }) => void;

  'fs:invalidate': (payload: { reason?: string }) => void;

  'term:data': (payload: { tabId: string; data: string }) => void;
  'term:exit': (payload: { tabId: string; exitCode: number | null }) => void;

  'share:state': (payload: { candidatePresent: boolean }) => void;

  // --- Design canvas (multi-user) ----------------------------------------
  /** Full peer roster — emitted on every join/leave so clients can re-render. */
  'design:presence': (payload: { docId: string; peers: DesignPeer[] }) => void;

  /** Remote pointer update; the client renders an overlay cursor by peerId. */
  'design:cursor': (payload: {
    docId: string;
    peerId: string;
    x: number | null;
    y: number | null;
  }) => void;

  /**
   * Remote scene snapshot — caused by another peer's edit. Echoed to every
   * peer EXCEPT the sender (the sender already has the local change). The
   * receiver hydrates the canvas from this `document`.
   */
  'design:scene': (payload: {
    docId: string;
    peerId: string;
    document: unknown;
  }) => void;

  /**
   * The doc was deleted / unshared by the owner while a guest was connected.
   * The client renders a "session ended" screen and disconnects.
   */
  'design:closed': (payload: { docId: string; reason: 'revoked' | 'deleted' }) => void;

  'error:typed': (err: TypedError['error']) => void;

  /** Legacy preview-ready spec event — kept for older clients. */
  preview_ready: (payload: { url: string }) => void;
}

// --- Common types ----------------------------------------------------------

export interface JoinResponse {
  ok: true;
  session: Session;
  preview: PreviewInfo;
  tabs: Array<{
    tabId: string;
    cols: number;
    rows: number;
    kind: TerminalKind;
    label: string;
  }>;
  /**
   * If this session has an in-container database, the DB shell kind the client
   * should auto-open a terminal tab for (and offer to reopen if closed).
   */
  dbShell: 'psql' | 'mongosh' | 'mysql' | null;
  role: ShareRole;
  readOnly: boolean;
}

export interface PreviewInfo {
  kind: 'iframe' | 'api' | 'none';
  url: string | null;
  hostPort: number | null;
  hint: string | null;
}

export interface FileReadResponse {
  ok: true;
  path: string;
  content: string;
  version: number;
}

export interface FileWriteResponse {
  ok: true;
  path: string;
  version: number;
  size: number;
}

export type AckOrError = { ok: true } | TypedError;

export interface TypedError {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface SocketData {
  /** Set for interviewer sockets (JWT). Empty for candidates. */
  userId: string;
  role: ShareRole;
  shareToken?: string;
  sessionId?: string;
  containerId?: string;

  // --- Design canvas (multi-user) — set on handshake when the socket is for
  // a design room. Code-session fields above are left untouched.
  designRole?: DesignRole;
  designShareToken?: string;
  designDocId?: string;
  /** Server-assigned identity for this peer in the design room. */
  designPeerId?: string;
  designName?: string;
  designColor?: string;
}

// --- Design canvas ack shapes ---------------------------------------------

export interface DesignJoinResponse {
  ok: true;
  docId: string;
  /** This socket's assigned peer identity (also present in `peers`). */
  self: DesignPeer;
  /** Full peer roster at the moment of join. */
  peers: DesignPeer[];
  /** Current persisted document — used to hydrate the canvas. */
  document: DesignDocumentDTO;
  /** Mirror of DESIGN_ROOM_MAX_PEERS for "x / N" UI. */
  maxPeers: number;
}
