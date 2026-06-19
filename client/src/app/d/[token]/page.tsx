"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2, LogOut, TriangleAlert, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import type {
  RemotePeer,
  SystemCanvasHandle,
} from "@/components/feature/design/system/system-canvas";
import { useDesignRoom } from "@/lib/hooks/use-design-room";
import { api, ApiError } from "@/lib/api";
import type { DesignDocumentDTO } from "@/contracts";

// SystemCanvas pulls in `@excalidraw/excalidraw` at module load (for the
// `convertToExcalidrawElements` / `viewportCoordsToSceneCoords` / `exportToBlob`
// helpers). That package touches `window` on import, which crashes during
// Next.js SSR. The /(protected) route avoids this only incidentally — its
// layout renders a skeleton while auth resolves on the client. The /d/[token]
// page has no auth gate, so we MUST defer to a client-only chunk.
const SystemCanvas = dynamic(
  () =>
    import("@/components/feature/design/system/system-canvas").then(
      (m) => m.SystemCanvas,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="text-muted-foreground flex h-full w-full items-center justify-center gap-2 text-xs">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading canvas…
      </div>
    ),
  },
);

interface PageProps {
  params: Promise<{ token: string }>;
}

type EndState = "ended" | "full" | "invalid" | "left";

/**
 * UNAUTHENTICATED guest entry point to a shared system_design canvas.
 *
 * Flow:
 *   1. GET /design-share/:token to resolve the doc + render the empty state
 *      ("session full" / "session ended") before opening a socket.
 *   2. Connect a DesignSocket with `designShareToken` set; the server admits
 *      up to 5 peers per doc with each peer auto-assigned a random name and
 *      a cursor color.
 *   3. Stream pointer + scene updates; render remote peers via the canvas's
 *      built-in overlay.
 *
 * No login UI, no session controls — just the canvas. Distinct from the
 * code-session candidate page at `/s/[token]` because design sharing is
 * multi-user and there's no read-only swap.
 */
export default function DesignSharePage({ params }: PageProps) {
  const { token } = use(params);

  const [phase, setPhase] = useState<"loading" | "ready" | "end">("loading");
  const [endState, setEndState] = useState<EndState>("ended");
  const [doc, setDoc] = useState<DesignDocumentDTO | null>(null);

  const canvasHandle = useRef<SystemCanvasHandle | null>(null);
  const leftRef = useRef(false);

  // 1) Resolve the link — gives us the doc + the friendly "full / ended" pages
  // without paying for a WS connection on the failure paths.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api.designShare.get(token);
        if (cancelled) return;
        if (!r.ok) {
          setEndState(r.reason as EndState);
          setPhase("end");
          return;
        }
        setDoc(r.document);
        setPhase("ready");
      } catch (e: unknown) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 409) setEndState("full");
        else setEndState("ended");
        setPhase("end");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // 2) Join the room — the hook handles cursors + scene fan-out + autosave.
  // We only enable it once the doc is loaded so the canvas is mounted and the
  // handle is available for `applyRemoteScene`.
  const room = useDesignRoom({
    docId: doc?.id ?? "",
    enabled: phase === "ready" && !!doc,
    shareToken: token,
    canvasHandleRef: canvasHandle,
    onClosed: () => {
      setEndState("ended");
      setPhase("end");
    },
    onJoinError: (err) => {
      if (err.code === "ROOM_FULL") setEndState("full");
      else setEndState("ended");
      setPhase("end");
    },
  });

  function onLeave() {
    if (leftRef.current) return;
    leftRef.current = true;
    setEndState("left");
    setPhase("end");
    setTimeout(() => {
      try {
        window.close();
      } catch {
        /* ignore */
      }
    }, 150);
  }

  if (phase === "loading") {
    return (
      <div className="text-muted-foreground flex min-h-[100dvh] flex-1 items-center justify-center gap-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Joining design canvas…
      </div>
    );
  }

  if (phase === "end" || !doc) {
    return <EndScreen state={endState} />;
  }

  return (
    <div className="relative flex h-[100dvh] flex-1 flex-col">
      <header className="border-border/60 bg-background/80 supports-[backdrop-filter]:bg-background/60 flex items-center justify-between gap-3 border-b px-3 py-2 backdrop-blur">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-foreground truncate text-sm font-medium">
            {doc.title}
          </span>
          <span className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 inline-flex items-center rounded-md border px-2 py-0.5 text-[11px]">
            Live · you can draw
          </span>
          <PeerBadge peers={room.peers} />
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button size="sm" variant="outline" onClick={onLeave}>
            <LogOut className="mr-1.5 h-4 w-4" aria-hidden />
            Leave
          </Button>
        </div>
      </header>
      <div className="min-h-0 flex-1">
        <GuestCanvas
          initialDocument={doc.document}
          sendScene={room.sendScene}
          sendCursor={room.sendCursor}
          peers={room.peers}
          canvasHandle={canvasHandle}
        />
      </div>
    </div>
  );
}

/** Same wrapper trick as the owner page — keep onChange referentially stable. */
function GuestCanvas({
  initialDocument,
  sendScene,
  sendCursor,
  peers,
  canvasHandle,
}: {
  initialDocument: unknown;
  sendScene: (next: unknown) => void;
  sendCursor: (x: number | null, y: number | null) => void;
  peers: RemotePeer[];
  canvasHandle: { current: SystemCanvasHandle | null };
}) {
  const sendSceneRef = useRef(sendScene);
  useEffect(() => {
    sendSceneRef.current = sendScene;
  }, [sendScene]);
  // Guests have no direct HTTP save — autosave flows entirely through the
  // WS scene event, which the server persists on every admitted peer.
  const onChange = useCallback((next: unknown) => {
    sendSceneRef.current(next);
  }, []);
  return (
    <SystemCanvas
      initialDocument={initialDocument}
      onChange={onChange}
      innerRef={canvasHandle}
      onPointerMove={sendCursor}
      peers={peers}
    />
  );
}

function PeerBadge({ peers }: { peers: RemotePeer[] }) {
  if (peers.length === 0) return null;
  return (
    <div className="border-border/60 bg-muted/40 text-muted-foreground hidden items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] sm:flex">
      <Users className="h-3 w-3" aria-hidden />
      <span>
        {peers.length} {peers.length === 1 ? "other" : "others"} here
      </span>
      <div className="ml-1 flex -space-x-1">
        {peers.slice(0, 4).map((p) => (
          <span
            key={p.peerId}
            title={p.name}
            className="ring-background h-3 w-3 rounded-full ring-2"
            style={{ background: p.color }}
            aria-hidden
          />
        ))}
      </div>
    </div>
  );
}

function EndScreen({ state }: { state: EndState }) {
  const copy =
    state === "full"
      ? {
          title: "This canvas is full",
          body: "Too many people are already collaborating here. Please try again in a moment.",
        }
      : state === "left"
        ? {
            title: "You left the canvas",
            body: "You can close this tab — the others are still working.",
          }
        : state === "invalid"
          ? {
              title: "This share link isn't valid",
              body: "The link may have been revoked, or it never existed. Ask whoever sent it for a fresh one.",
            }
          : {
              title: "This design canvas has ended",
              body: "The owner closed or deleted it. There's nothing to join anymore.",
            };
  return (
    <div className="flex min-h-[100dvh] flex-1 items-center justify-center px-6">
      <div className="border-border/60 bg-background/60 flex max-w-md flex-col items-start gap-3 rounded-lg border p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <TriangleAlert className="text-muted-foreground h-4 w-4" aria-hidden />
          <p className="text-foreground text-sm font-medium">{copy.title}</p>
        </div>
        <p className="text-muted-foreground text-xs">{copy.body}</p>
      </div>
    </div>
  );
}
