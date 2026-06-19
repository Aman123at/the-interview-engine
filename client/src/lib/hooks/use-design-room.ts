"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { createDesignSocket, type DesignSocket } from "@/lib/design-socket";
import type { DesignPeer } from "@/contracts";
import type {
  RemotePeer,
  SystemCanvasHandle,
} from "@/components/feature/design/system/system-canvas";

interface UseDesignRoomOpts {
  docId: string;
  /** Skip the socket entirely while the doc is still loading (or wrong kind). */
  enabled: boolean;
  /** Guest mode — when set, the socket auths with the share token. */
  shareToken?: string | null;
  /** Hand the canvas handle so the hook can apply remote scene snapshots. */
  canvasHandleRef: { current: SystemCanvasHandle | null };
  /** Owner-only — called when the doc is revoked/deleted while joined. */
  onClosed?: (reason: "revoked" | "deleted") => void;
  /** Server refused the join (room full, invalid token, ...). */
  onJoinError?: (err: { code?: string; message?: string }) => void;
}

/**
 * Drives the shared design-canvas WS for one peer (owner or guest).
 *   - Maintains a roster of remote peers with their last-known cursor coords
 *     (the local user is filtered out so they never see their own cursor).
 *   - Throttles outgoing cursor + scene updates to a single rAF tick.
 *   - Applies remote scene snapshots through the canvas's `applyRemoteScene`
 *     handle (which suppresses the resulting onChange so we don't loop).
 */
export function useDesignRoom({
  docId,
  enabled,
  shareToken,
  canvasHandleRef,
  onClosed,
  onJoinError,
}: UseDesignRoomOpts) {
  const [peers, setPeers] = useState<RemotePeer[]>([]);
  const [selfPeerId, setSelfPeerId] = useState<string | null>(null);
  const socketRef = useRef<DesignSocket | null>(null);
  // Roster from the server (peerId → DesignPeer) merged with last cursor.
  const rosterRef = useRef<Map<string, DesignPeer>>(new Map());
  const cursorsRef = useRef<Map<string, { x: number | null; y: number | null }>>(
    new Map(),
  );

  // Build the public `peers` view from roster + cursors, dropping self.
  function recomputePeers() {
    const self = selfPeerIdRef.current;
    const out: RemotePeer[] = [];
    for (const peer of rosterRef.current.values()) {
      if (peer.peerId === self) continue;
      const c = cursorsRef.current.get(peer.peerId);
      out.push({
        peerId: peer.peerId,
        name: peer.name,
        color: peer.color,
        x: c?.x ?? null,
        y: c?.y ?? null,
      });
    }
    setPeers(out);
  }

  // Keep selfPeerId in a ref so recomputePeers (called from event handlers)
  // sees the latest without re-binding.
  const selfPeerIdRef = useRef<string | null>(null);
  useEffect(() => {
    selfPeerIdRef.current = selfPeerId;
  }, [selfPeerId]);

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;

    const sock = createDesignSocket({
      docId,
      designShareToken: shareToken ?? undefined,
      onJoined: (ack) => {
        if (disposed) return;
        setSelfPeerId(ack.self.peerId);
        selfPeerIdRef.current = ack.self.peerId;
        rosterRef.current = new Map(ack.peers.map((p) => [p.peerId, p]));
        // On first join, hydrate the canvas with the server's document. This
        // also catches the case where another peer made edits while we were
        // disconnected (state recovery handles in-window blips, this catches
        // longer drops).
        const handle = canvasHandleRef.current;
        const docObj = (ack.document as { document?: unknown } | null)?.document;
        if (handle && docObj && typeof docObj === "object") {
          handle.applyRemoteScene(docObj as Record<string, unknown>);
        }
        recomputePeers();
      },
      onJoinError: (err) => {
        if (disposed) return;
        if (err.code === "ROOM_FULL") {
          toast.error("Canvas is full", {
            description: "Too many people are already collaborating here.",
          });
        } else if (err.message) {
          toast.error("Couldn't join", { description: err.message });
        }
        onJoinError?.(err);
      },
      onPresence: (next) => {
        if (disposed) return;
        rosterRef.current = new Map(next.map((p) => [p.peerId, p]));
        // Drop stale cursors for peers who left.
        for (const peerId of cursorsRef.current.keys()) {
          if (!rosterRef.current.has(peerId)) cursorsRef.current.delete(peerId);
        }
        recomputePeers();
      },
      onCursor: ({ peerId, x, y }) => {
        if (disposed) return;
        cursorsRef.current.set(peerId, { x, y });
        recomputePeers();
      },
      onScene: ({ document: nextDoc }) => {
        if (disposed) return;
        const handle = canvasHandleRef.current;
        if (handle && nextDoc && typeof nextDoc === "object") {
          handle.applyRemoteScene(nextDoc as Record<string, unknown>);
        }
      },
      onClosed: (reason) => {
        if (disposed) return;
        if (reason === "revoked") {
          toast.message("Share link revoked");
        } else {
          toast.message("Document was deleted");
        }
        onClosed?.(reason);
      },
    });
    socketRef.current = sock;

    return () => {
      disposed = true;
      sock.dispose();
      socketRef.current = null;
      rosterRef.current.clear();
      cursorsRef.current.clear();
      setPeers([]);
      setSelfPeerId(null);
    };
    // canvasHandleRef + callbacks intentionally not in deps — the hook scopes
    // the listeners to the docId + auth identity, and the refs/callbacks are
    // stable enough that re-running this effect on each render would thrash
    // the socket. The callers don't pass dynamic functions today.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, enabled, shareToken]);

  const sendCursor = useCallback((x: number | null, y: number | null) => {
    socketRef.current?.sendCursor(x, y);
  }, []);

  const sendScene = useCallback((next: unknown) => {
    socketRef.current?.sendScene(next);
  }, []);

  return { peers, selfPeerId, sendCursor, sendScene };
}
