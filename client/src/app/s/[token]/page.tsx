"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, LogOut, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConnectionBanner } from "@/components/feature/connection-banner";
import { ThemeToggle } from "@/components/theme-toggle";
import { LibraryButton } from "@/components/feature/library-button";
import { Workspace } from "@/components/feature/session/workspace";
import { api, ApiError } from "@/lib/api";
import { previewFromServer } from "@/lib/server-preview";
import {
  createSessionSocket,
  type ConnectionState,
  type SessionSocket,
} from "@/lib/socket";
import type { PreviewInfo } from "@/types/session";
import type { JoinResponse } from "@/contracts";

interface PageProps {
  params: Promise<{ token: string }>;
}

/** Terminal end-states the candidate can land on. */
type EndState = "ended" | "in_use" | "left";

export default function CandidateSessionPage({ params }: PageProps) {
  const { token } = use(params);

  const [phase, setPhase] = useState<"loading" | "ready" | "end">("loading");
  const [endState, setEndState] = useState<EndState>("ended");
  const [sessionId, setSessionId] = useState<string>("");
  const [preview, setPreview] = useState<PreviewInfo>({ status: "unknown" });
  const [dbShell, setDbShell] = useState<"psql" | "mongosh" | "mysql" | null>(null);
  const [connState, setConnState] = useState<ConnectionState>("idle");
  const [socket, setSocket] = useState<SessionSocket | null>(null);

  const socketRef = useRef<SessionSocket | null>(null);
  const leftRef = useRef(false);

  // 1) Resolve the share link, then 2) open the candidate socket.
  useEffect(() => {
    let cancelled = false;
    let s: SessionSocket | null = null;

    (async () => {
      // Validate the link first — a terminal/missing session is a 410.
      let resolvedSessionId = "";
      try {
        const entry = await api.share.get(token);
        if (cancelled) return;
        if (!entry.ok) {
          setEndState("ended");
          setPhase("end");
          return;
        }
        resolvedSessionId = entry.session.id;
        setSessionId(entry.session.id);
        setPreview(previewFromServer(entry.preview));
      } catch (e) {
        if (cancelled) return;
        // 410 (ended) or any error → session-ended page.
        if (e instanceof ApiError && e.status === 410) setEndState("ended");
        else setEndState("ended");
        setPhase("end");
        return;
      }

      s = createSessionSocket({
        sessionId: resolvedSessionId,
        shareToken: token,
        onJoined: (ack: JoinResponse) => {
          if (cancelled) return;
          setDbShell(ack.dbShell ?? null);
          if (ack.session.id) setSessionId(ack.session.id);
          if (
            ack.session.status === "ended" ||
            ack.session.status === "recoverable"
          ) {
            setEndState("ended");
            setPhase("end");
            return;
          }
          setPreview(previewFromServer(ack.preview));
          setPhase("ready");
        },
        onJoinError: (err) => {
          if (cancelled) return;
          const reason = (err?.details as { reason?: string } | undefined)?.reason;
          setEndState(reason === "share_in_use" ? "in_use" : "ended");
          setPhase("end");
        },
      });
      socketRef.current = s;
      if (!cancelled) setSocket(s);

      const offState = s.onState((state) => setConnState(state));

      // The session ending mid-interview kicks the candidate to the end page.
      function onStatus(p: { status?: string }) {
        if (p?.status === "ended" || p?.status === "recoverable") {
          setEndState("ended");
          setPhase("end");
        }
      }
      function onPreviewReady(event: {
        type?: string;
        payload?: unknown;
      }) {
        if (event?.type !== "preview_ready") return;
        const payload = event.payload as { url?: unknown } | undefined;
        if (typeof payload?.url === "string") {
          setPreview({ status: "ready", url: payload.url });
        }
      }
      s.socket.on("lifecycle:status", onStatus);
      s.socket.on("lifecycle:event", onPreviewReady);

      // Best-effort immediate release on tab close so the interviewer unlocks
      // without waiting for the disconnect grace.
      const onUnload = () => {
        try {
          void s?.emitAck("share:leave", {}).catch(() => {});
        } catch {
          /* ignore */
        }
      };
      window.addEventListener("pagehide", onUnload);

      // store cleanup on the socket-scoped closure
      (s as SessionSocket & { _cleanup?: () => void })._cleanup = () => {
        offState();
        s?.socket.off("lifecycle:status", onStatus);
        s?.socket.off("lifecycle:event", onPreviewReady);
        window.removeEventListener("pagehide", onUnload);
      };
    })();

    return () => {
      cancelled = true;
      const cur = s as (SessionSocket & { _cleanup?: () => void }) | null;
      cur?._cleanup?.();
      // If we're tearing down without an explicit leave, a normal disconnect
      // still releases the slot (after the server's grace).
      cur?.dispose();
    };
  }, [token]);

  const onLeave = useMemo(
    () => () => {
      if (leftRef.current) return;
      leftRef.current = true;
      const s = socketRef.current;
      try {
        // Immediate unlock for the interviewer.
        void s?.emitAck("share:leave", {}).catch(() => {});
      } catch {
        /* ignore */
      }
      setEndState("left");
      setPhase("end");
      // Try to close the tab (works for script-opened tabs); otherwise the
      // "you left" page below is the fallback.
      setTimeout(() => {
        try {
          window.close();
        } catch {
          /* ignore */
        }
      }, 150);
    },
    [],
  );

  if (phase === "loading") {
    return (
      <div className="text-muted-foreground flex min-h-[100dvh] flex-1 items-center justify-center gap-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Joining session…
      </div>
    );
  }

  if (phase === "end") {
    return <EndScreen state={endState} />;
  }

  return (
    <div className="relative flex h-[100dvh] flex-1 flex-col">
      <header className="border-border/60 bg-background/80 supports-[backdrop-filter]:bg-background/60 flex items-center justify-between gap-3 border-b px-3 py-2 backdrop-blur">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-foreground text-sm font-medium">Interview session</span>
          <span className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300 inline-flex items-center rounded-md border px-2 py-0.5 text-[11px]">
            Live · you can edit
          </span>
        </div>
        <div className="flex items-center gap-2">
          <LibraryButton />
          <ThemeToggle />
          <Button size="sm" variant="outline" onClick={onLeave}>
            <LogOut className="mr-1.5 h-4 w-4" aria-hidden />
            Leave session
          </Button>
        </div>
      </header>
      <ConnectionBanner state={connState} hideWhenConnected />
      {socket ? (
        <Workspace
          socket={socket}
          sessionId={sessionId}
          initialFiles={[]}
          preview={preview}
          dbShell={dbShell}
          readOnly={false}
          shareToken={token}
        />
      ) : null}
    </div>
  );
}

function EndScreen({ state }: { state: EndState }) {
  const copy: Record<EndState, { title: string; body: string }> = {
    ended: {
      title: "Session ended",
      body: "This interview session is no longer available. You can close this tab.",
    },
    in_use: {
      title: "Session already in use",
      body: "Someone else is currently in this session. Please check with your interviewer for a new link.",
    },
    left: {
      title: "You've left the session",
      body: "Thanks! You can close this tab now. The interviewer has regained access to review the work.",
    },
  };
  const c = copy[state];
  return (
    <div className="flex min-h-[100dvh] flex-1 items-center justify-center px-6">
      <div className="border-border/60 bg-card/40 flex max-w-md flex-col items-start gap-3 rounded-lg border p-6">
        <TriangleAlert className="text-muted-foreground h-5 w-5" aria-hidden />
        <h1 className="text-foreground text-base font-semibold">{c.title}</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">{c.body}</p>
      </div>
    </div>
  );
}
