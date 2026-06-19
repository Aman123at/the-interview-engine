/**
 * socket.io client wrapper for the SHARED design-canvas room.
 *
 * Mirrors `lib/socket.ts` (code-session sockets) but with a focused surface:
 *   handshake auth  : { token } (owner) OR { designShareToken } (guest)
 *   join room       : emit "design:join" { docId } → DesignJoinResponse
 *   cursor (fire+f) : emit "design:cursor" { x, y }
 *   scene (fire+f)  : emit "design:scene" { document }
 *   leave           : emit "design:leave"
 *   server pushes   : "design:presence", "design:cursor", "design:scene", "design:closed"
 *
 * Reconnection state recovery (≤ 2 min) is on at the server, so short blips
 * replay without redoing the join. On a fresh handshake we re-emit the join
 * so the server re-admits us into the room.
 */
import { io, type Socket } from "socket.io-client";
import { env } from "@/lib/env";
import { api, onTokenChange } from "@/lib/api";
import { getAccessToken } from "@/lib/auth/token-store";
import type {
  ClientToServerEvents,
  DesignJoinResponse,
  DesignPeer,
  ServerToClientEvents,
} from "@/contracts";

export type TypedDesignSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export type DesignConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "lost";

interface CreateOpts {
  docId: string;
  /** Guest mode: handshake uses this instead of JWT. */
  designShareToken?: string;
  onJoined?: (ack: DesignJoinResponse) => void;
  onJoinError?: (err: { code?: string; message?: string }) => void;
  onPresence?: (peers: DesignPeer[]) => void;
  onCursor?: (payload: { peerId: string; x: number | null; y: number | null }) => void;
  onScene?: (payload: { peerId: string; document: unknown }) => void;
  /** Server says the doc has been revoked or deleted by the owner. */
  onClosed?: (reason: "revoked" | "deleted") => void;
}

export interface DesignSocket {
  readonly socket: TypedDesignSocket;
  state: () => DesignConnectionState;
  onState: (fn: (s: DesignConnectionState) => void) => () => void;
  /** Best-effort cursor broadcast — fire-and-forget, drop while disconnected. */
  sendCursor: (x: number | null, y: number | null) => void;
  /** Broadcast a fresh scene snapshot. Server fans it out + autosaves. */
  sendScene: (document: unknown) => void;
  leave: () => void;
  dispose: () => void;
}

const RECONNECTION_DELAY = 500;
const RECONNECTION_DELAY_MAX = 8000;

export function createDesignSocket(opts: CreateOpts): DesignSocket {
  const stateHandlers = new Set<(s: DesignConnectionState) => void>();
  let connectionState: DesignConnectionState = "idle";

  function setState(s: DesignConnectionState) {
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

  const isGuest = !!opts.designShareToken;

  const socket: TypedDesignSocket = io(env.WS_URL, {
    transports: ["websocket"],
    auth: (cb) =>
      isGuest
        ? cb({ designShareToken: opts.designShareToken })
        : cb({ token: getAccessToken() ?? "" }),
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: RECONNECTION_DELAY,
    reconnectionDelayMax: RECONNECTION_DELAY_MAX,
    autoConnect: true,
  });

  const raw = socket as unknown as Socket;

  // Owner token rotation → bounce the socket so the new token rides the next
  // handshake. Skipped for guests (unauthenticated).
  const unsubToken = isGuest
    ? () => {}
    : onTokenChange(() => {
        if (!socket.connected) return;
        socket.disconnect();
        socket.connect();
      });

  setState("connecting");

  async function joinRoom() {
    try {
      const ack = (await socket
        .timeout(10_000)
        .emitWithAck("design:join", { docId: opts.docId })) as
        | DesignJoinResponse
        | { ok: false; error?: { code?: string; message?: string } };
      if (ack && (ack as DesignJoinResponse).ok === true) {
        opts.onJoined?.(ack as DesignJoinResponse);
      } else {
        opts.onJoinError?.(
          (ack as { error?: { code?: string; message?: string } })?.error ?? {},
        );
        setState("lost");
      }
    } catch {
      /* timed out — io will keep retrying */
    }
  }

  socket.on("connect", () => {
    setState("connected");
    void joinRoom();
  });

  socket.io.on("reconnect_attempt", () => setState("reconnecting"));

  socket.on("disconnect", (reason) => {
    if (reason === "io server disconnect") setState("lost");
    else setState("reconnecting");
  });

  socket.on("connect_error", () => {
    if (connectionState === "connected") setState("reconnecting");
  });

  socket.io.on("reconnect_failed", () => setState("lost"));

  // Owner JWT expired — refresh then bounce; same flow as session sockets.
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

  // --- Push events → caller hooks ---------------------------------------

  socket.on("design:presence", (p) => {
    if (p.docId === opts.docId) opts.onPresence?.(p.peers);
  });
  socket.on("design:cursor", (p) => {
    if (p.docId === opts.docId) {
      opts.onCursor?.({ peerId: p.peerId, x: p.x, y: p.y });
    }
  });
  socket.on("design:scene", (p) => {
    if (p.docId === opts.docId) {
      opts.onScene?.({ peerId: p.peerId, document: p.document });
    }
  });
  socket.on("design:closed", (p) => {
    if (p.docId === opts.docId) opts.onClosed?.(p.reason);
  });

  function sendCursor(x: number | null, y: number | null) {
    if (!socket.connected) return; // cursors are ephemeral — drop while offline
    raw.emit("design:cursor", { x, y });
  }

  function sendScene(document: unknown) {
    if (!socket.connected) return;
    raw.emit("design:scene", { document });
  }

  async function leave() {
    if (!socket.connected) return;
    try {
      await socket.timeout(5_000).emitWithAck("design:leave", {});
    } catch {
      /* swallowed — disposing anyway */
    }
  }

  function dispose() {
    unsubToken();
    stateHandlers.clear();
    socket.removeAllListeners();
    socket.disconnect();
  }

  return {
    socket,
    state: () => connectionState,
    onState(fn) {
      stateHandlers.add(fn);
      try {
        fn(connectionState);
      } catch {
        /* ignore */
      }
      return () => stateHandlers.delete(fn);
    },
    sendCursor,
    sendScene,
    leave,
    dispose,
  };
}
