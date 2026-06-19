// Socket.io client wrapper for the sandbox session realtime channel.
//
// Server contract (verified against server/wsServer.ts):
//   handshake auth        : { token }
//   join room             : emit "session:join" { sessionId },
//                           ack { ok: true, session, preview, tabs }
//   connection liveness   : "connection:health" { status, recovered }
//   lifecycle stream      : "lifecycle:event"  { id, sessionId, type, payload, level, createdAt }
//                           "lifecycle:status" { sessionId, status }
//   filesystem (acked)    : "file:tree" → { tree }
//                           "file:read" { path } → { ok, content, version, path }
//                           "file:write" { path, content, expectedVersion? } → { ok, path, version, ... }
//                           "file:delete" { path } → { ok }
//                           "file:rename" { from, to } → { ok }
//                           "file:mkdir" { path } → { ok }
//   filesystem broadcast  : "file:changed" { path, version, kind, from? }
//                           kind: "write" | "delete" | "rename"
//   terminal (acked)      : "term:open" { cols, rows } → { tabId }
//                           "term:reattach" { tabId } → { tabId, backlog, cols, rows }
//                           "term:close" { tabId } → { ok }
//   terminal (fire+forget): "term:write" { tabId, data }
//                           "term:resize" { tabId, cols, rows }
//   terminal output       : "term:data" { tabId, data }
//                           "term:exit" { tabId, exitCode }
//   typed errors          : "error:typed" { code, message, details? }
//
// connectionStateRecovery is on server-side (2 min window) — short blips
// replay missed server-emitted events automatically.

import { io, type Socket } from "socket.io-client";
import { env } from "@/lib/env";
import { api, onTokenChange } from "@/lib/api";
import { getAccessToken } from "@/lib/auth/token-store";
import type {
  ClientToServerEvents,
  JoinResponse,
  ServerToClientEvents,
} from "@/contracts";

/** Re-export so consumers can `import type { JoinResponse } from "@/lib/socket"` without reaching into @/contracts. */
export type { JoinResponse } from "@/contracts";

/** Typed socket the contract narrows to the shared event surface. */
export type TypedClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export type ConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "lost";

type StateHandler = (s: ConnectionState) => void;

export interface QueuedEmit {
  event: string;
  args: unknown[];
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
}

export interface SessionSocket {
  readonly socket: TypedClientSocket;
  /** Subscribe to connection-state transitions for the banner. */
  onState: (fn: StateHandler) => () => void;
  state: () => ConnectionState;
  /**
   * Emit with ack. While disconnected the call is queued and flushed on
   * reconnect. Resolves with the ack payload (caller types it).
   */
  emitAck: <T = unknown>(event: string, ...args: unknown[]) => Promise<T>;
  /** Best-effort fire-and-forget; queues while disconnected. */
  emit: (event: string, ...args: unknown[]) => void;
  /** Close the connection and stop reconnection attempts. */
  dispose: () => void;
}

interface CreateOpts {
  sessionId: string;
  /**
   * Called whenever we (re)join the room. Receives the typed join ack so the
   * caller can seed preview / restore terminal tabs / etc. from the server's
   * snapshot.
   */
  onJoined?: (ack: JoinResponse) => void;
  /**
   * Candidate mode: authenticate the handshake with a session SHARE TOKEN
   * instead of the interviewer's JWT. When set, the token-refresh wiring is
   * skipped (candidates are unauthenticated).
   */
  shareToken?: string;
  /** Called when the server refuses the join (e.g. SHARE_IN_USE, ended). */
  onJoinError?: (err: { code?: string; message?: string; details?: unknown }) => void;
}

const RECONNECTION_DELAY = 500;
const RECONNECTION_DELAY_MAX = 8000;
const RANDOMIZATION_FACTOR = 0.4;
const CONNECT_TIMEOUT = 10_000;

export function createSessionSocket(opts: CreateOpts): SessionSocket {
  const queue: QueuedEmit[] = [];
  const stateHandlers = new Set<StateHandler>();
  let connectionState: ConnectionState = "idle";

  function setState(s: ConnectionState) {
    if (connectionState === s) return;
    connectionState = s;
    for (const fn of stateHandlers) {
      try {
        fn(s);
      } catch {
        /* ignore */
      }
    }
  }

  const isCandidate = !!opts.shareToken;

  const socket: TypedClientSocket = io(env.WS_URL, {
    transports: ["websocket"],
    auth: (cb) =>
      isCandidate
        ? cb({ shareToken: opts.shareToken })
        : cb({ token: getAccessToken() ?? "" }),
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: RECONNECTION_DELAY,
    reconnectionDelayMax: RECONNECTION_DELAY_MAX,
    randomizationFactor: RANDOMIZATION_FACTOR,
    timeout: CONNECT_TIMEOUT,
    autoConnect: true,
  });

  // Refresh + re-handshake on token rotation while connected (interviewer only).
  const unsubToken = isCandidate
    ? () => {}
    : onTokenChange(() => {
        if (!socket.connected) return;
        // Force a fresh handshake with the new token.
        socket.disconnect();
        socket.connect();
      });

  setState("connecting");

  // Inside the helpers we treat the socket as event-name-agnostic — the
  // typed event maps protect call sites, while the helpers are variadic by
  // design (the queue carries arbitrary `unknown[]`).
  const raw = socket as unknown as Socket;

  function flushQueue() {
    if (!socket.connected) return;
    // Drain in FIFO order; new pushes during await get the same socket.
    const pending = queue.splice(0);
    for (const item of pending) {
      raw
        .timeout(15_000)
        .emitWithAck(item.event, ...item.args)
        .then(item.resolve)
        .catch(item.reject);
    }
  }

  async function joinRoom() {
    try {
      const ack = (await socket
        .timeout(10_000)
        .emitWithAck("session:join", { sessionId: opts.sessionId })) as
        | JoinResponse
        | { ok: false; error?: { code?: string; message?: string } };
      if (ack && (ack as JoinResponse).ok === true) {
        opts.onJoined?.(ack as JoinResponse);
        flushQueue();
      } else {
        // Server rejected join (e.g. share slot taken, session ended) — surface
        // it so the UI can react instead of silently sitting idle.
        const err = (ack as { error?: { code?: string; message?: string; details?: unknown } })?.error;
        opts.onJoinError?.(err ?? {});
        setState("lost");
      }
    } catch {
      // Join timed out — io will keep retrying the underlying transport.
    }
  }

  socket.on("connect", () => {
    setState("connected");
    void joinRoom();
  });

  socket.io.on("reconnect_attempt", () => {
    setState("reconnecting");
  });

  socket.on("disconnect", (reason) => {
    // "io server disconnect" means the server forced us off and won't retry;
    // bump to "lost". Otherwise we're in the normal reconnect loop.
    if (reason === "io server disconnect") {
      setState("lost");
    } else {
      setState("reconnecting");
    }
  });

  socket.on("connect_error", () => {
    if (connectionState === "connected") setState("reconnecting");
  });

  socket.io.on("reconnect_failed", () => {
    setState("lost");
  });

  // Auth-expiry path: refresh, then bounce the transport so the new token
  // travels in the next handshake. `auth:expired` is a non-contract,
  // application-level event the server may emit; subscribe via the untyped
  // socket so the typed event map stays the source of truth elsewhere.
  raw.on("auth:expired", () => {
    void (async () => {
      const ok = await api.auth.refresh();
      if (ok) {
        socket.disconnect();
        socket.connect();
      } else {
        setState("lost");
      }
    })();
  });

  function emitAck<T = unknown>(event: string, ...args: unknown[]): Promise<T> {
    if (socket.connected) {
      return raw.timeout(15_000).emitWithAck(event, ...args) as Promise<T>;
    }
    return new Promise<T>((resolve, reject) => {
      queue.push({
        event,
        args,
        resolve: (v) => resolve(v as T),
        reject,
      });
    });
  }

  function emit(event: string, ...args: unknown[]): void {
    if (socket.connected) {
      raw.emit(event, ...args);
      return;
    }
    queue.push({
      event,
      args,
      resolve: () => undefined,
      reject: () => undefined,
    });
  }

  function dispose() {
    unsubToken();
    stateHandlers.clear();
    socket.removeAllListeners();
    socket.disconnect();
  }

  return {
    socket,
    onState(fn) {
      stateHandlers.add(fn);
      // Replay current state on subscribe.
      try {
        fn(connectionState);
      } catch {
        /* ignore */
      }
      return () => stateHandlers.delete(fn);
    },
    state: () => connectionState,
    emitAck,
    emit,
    dispose,
  };
}

// Legacy placeholder kept so older imports don't break.
export const SOCKET_URL = env.WS_URL;
