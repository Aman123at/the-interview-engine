"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ConnectionBanner } from "@/components/feature/connection-banner";
import { SessionLifecycleLoader } from "@/components/feature/session-lifecycle-loader";
import {
  SessionCloseOverlay,
  type ClosePhase,
} from "@/components/feature/session-close-overlay";
import { SessionBackDialog } from "@/components/feature/session-back-dialog";
import { CloseSessionDialog } from "@/components/feature/close-session-dialog";
import { SessionTopBar } from "@/components/feature/session-top-bar";
import { ShareSessionDialog } from "@/components/feature/session/share-session-dialog";
import { Workspace } from "@/components/feature/session/workspace";
import {
  clearActiveSessionIfMatches,
  setActiveSession,
} from "@/lib/active-session-store";
import { api, ApiError } from "@/lib/api";
import {
  createSessionSocket,
  type ConnectionState,
  type SessionSocket,
} from "@/lib/socket";
import { previewFromServer } from "@/lib/server-preview";
import type {
  LifecycleEvent,
  LifecycleStage,
  PreviewInfo,
  SessionReadyPayload,
} from "@/types/session";
import type { CloseSessionRequest, JoinResponse } from "@/contracts";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Map a server-side lifecycle envelope to a client-facing LifecycleEvent. The
 * server uses a `type` field (`container_start`, `ws_init`, `container_ready`,
 * `preview_ready`, `session_resume`, `session_close`) plus opaque payloads;
 * we project those onto the canonical stage pipeline the loader UI knows how
 * to draw. `session_close` is handled separately by the close overlay.
 */
function mapEnvelopeToStage(
  type: string,
  payload: Record<string, unknown>,
): LifecycleEvent | null {
  const step = typeof payload.step === "string" ? payload.step : "";
  const status = typeof payload.status === "string" ? payload.status : "";
  const msg = typeof payload.msg === "string" ? payload.msg : "";

  switch (type) {
    case "session_resume":
      return {
        stage: "starting",
        message: "Resuming your session",
      };
    case "container_create":
    case "container_start":
      return { stage: "container", message: "Starting container" };
    case "ws_init":
      if (step === "npm-install" && status === "done") {
        return { stage: "deps", message: "Dependencies installed" };
      }
      if (step === "npm-install") {
        return { stage: "deps", message: "Installing dependencies" };
      }
      if (step === "ready") {
        return {
          stage: "scaffold",
          message: msg || "Starting dev server",
        };
      }
      return { stage: "container", message: msg || `Step: ${step || type}` };
    case "container_ready":
      if (payload.health === "healthy") {
        return { stage: "ready", message: "Container healthy" };
      }
      return { stage: "container", message: "Container booted" };
    case "preview_ready":
      // The first preview_ready may arrive without a url (just step="ready");
      // the second carries the actual URL.
      return typeof payload.url === "string"
        ? { stage: "ready", message: "Preview ready" }
        : { stage: "scaffold", message: msg || "Starting dev server" };
    case "session_close":
    case "container_stop":
    case "container_destroy":
      // These belong to the close flow — the overlay handles them, don't
      // surface in the regular loader.
      return null;
    default: {
      const fallbackStage: LifecycleStage = "starting";
      return { stage: fallbackStage, message: msg || type };
    }
  }
}

interface CloseOverlayState {
  phase: ClosePhase;
  detail?: string;
}

function describeClosePhase(payload: Record<string, unknown>): {
  phase: ClosePhase;
  detail?: string;
} | null {
  const raw = typeof payload.phase === "string" ? payload.phase : "";
  switch (raw) {
    case "saving":
      return { phase: "saving" };
    case "persisted": {
      const scanned = Number(payload.scanned);
      const persisted = Number(payload.persisted);
      const failed = Number(payload.failed);
      const detail =
        Number.isFinite(persisted) && Number.isFinite(scanned)
          ? `${persisted} of ${scanned} files saved` +
            (Number.isFinite(failed) && failed > 0 ? ` · ${failed} failed` : "")
          : undefined;
      return { phase: "persisted", detail };
    }
    case "pruned": {
      const pruned = Array.isArray(payload.pruned)
        ? (payload.pruned as unknown[]).filter((x): x is string => typeof x === "string")
        : [];
      const detail = pruned.length > 0 ? `Removed ${pruned.join(", ")}` : undefined;
      return { phase: "pruned", detail };
    }
    case "ended":
      return { phase: "ended", detail: "Cleanup complete" };
    default:
      return null;
  }
}

export default function SessionPage({ params }: PageProps) {
  const { id: sessionId } = use(params);
  const router = useRouter();
  const [socket, setSocket] = useState<SessionSocket | null>(null);
  const [connState, setConnState] = useState<ConnectionState>("idle");
  const [lifecycle, setLifecycle] = useState<LifecycleEvent[]>([]);
  const [ready, setReady] = useState<SessionReadyPayload | null>(null);
  const [errored, setErrored] = useState<{ message: string } | null>(null);
  const [preview, setPreview] = useState<PreviewInfo>({ status: "unknown" });
  const [dbShell, setDbShell] = useState<"psql" | "mongosh" | "mysql" | null>(null);
  const [attachedCandidateId, setAttachedCandidateId] = useState<string | null>(
    null,
  );
  const [retryNonce, setRetryNonce] = useState(0);
  const [backOpen, setBackOpen] = useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  // Read-only swap: true while a candidate has the shared session open.
  const [readOnly, setReadOnly] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [closeOverlay, setCloseOverlay] = useState<CloseOverlayState | null>(
    null,
  );
  // Tracks whether the user explicitly initiated a close — keeps the close
  // overlay from blocking the page if the server emits unrelated
  // session_close events (e.g. from another tab).
  const userClosingRef = useRef(false);

  // Reset state when we explicitly retry. This is a setup effect — clearing
  // the prior session's progress data is exactly what should happen here.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setLifecycle([]);
    setReady(null);
    setErrored(null);
    setPreview({ status: "unknown" });
  }, [retryNonce]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Wire the socket. Re-create when retryNonce changes or sessionId changes.
  useEffect(() => {
    const s = createSessionSocket({
      sessionId,
      onJoined: (ack: JoinResponse) => {
        console.log("[session] join ack", ack);
        setDbShell(ack.dbShell ?? null);
        setAttachedCandidateId(ack.session.candidateRecordId ?? null);
        // A candidate may already be editing when the interviewer (re)joins.
        setReadOnly(!!ack.readOnly);

        // Phase 11: status === "recoverable" means the container is gone and
        // the only legal action is to resume from the dashboard. Bounce.
        if (ack.session.status === "recoverable") {
          clearActiveSessionIfMatches(sessionId);
          toast.message("Session paused", {
            description: "Resume it from the dashboard to continue.",
          });
          router.replace("/dashboard");
          return;
        }
        // Status === "ended" — the row is closed for good.
        if (ack.session.status === "ended") {
          clearActiveSessionIfMatches(sessionId);
          toast.message("Session ended", {
            description: "Start a new one from the dashboard.",
          });
          router.replace("/dashboard");
          return;
        }

        // Seed preview state from the ack so the Preview tab works
        // immediately if the dev server was already up at join time.
        const next = previewFromServer(ack.preview);
        if (next.status !== "unknown") setPreview(next);
        if (ack.session.status === "running") {
          markReady("session:join/session.status", ack);
        }

        // Track the live session locally so the dashboard can surface a
        // "Resume" card even before the server flips it to `recoverable`.
        // (The recoverable + ended branches above already returned.)
        if (ack.session.id) {
          setActiveSession({
            id: ack.session.id,
            framework: ack.session.framework ?? "",
            customization: ack.session.customization as
              | Record<string, string | string[]>
              | undefined,
            enteredAt: new Date().toISOString(),
          });
        }
      },
    });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSocket(s);

    const offState = s.onState((state) => {
      console.log("[session] connection state →", state);
      setConnState(state);
    });

    function onAnyDebug(event: string, ...args: unknown[]) {
      console.log("[session ←]", event, ...args);
    }
    s.socket.onAny(onAnyDebug);

    function markReady(source: string, raw?: unknown) {
      console.log("[session] markReady from", source, raw);
      // Server doesn't ship a workspace snapshot up-front. Start with an
      // empty tree; file:tree + file:changed broadcasts populate it.
      setReady({ workspace: { root: "/", files: [] } });
    }

    interface LifecycleEnvelope {
      id?: string;
      sessionId?: string;
      type?: string;
      payload?: unknown;
      level?: string;
      createdAt?: Date | string;
    }

    function onLifecycleEvent(envIn: LifecycleEnvelope) {
      const env = envIn;
      const type = env?.type ?? "";
      const payload = (env?.payload ?? {}) as Record<string, unknown>;

      // Close-flow phases: route into the overlay, not the regular loader.
      if (type === "session_close") {
        const phaseUpdate = describeClosePhase(payload);
        if (phaseUpdate && userClosingRef.current) {
          setCloseOverlay(phaseUpdate);
          // The DELETE response navigates us away on success, but if the
          // server emits "ended" before/without that, still bounce.
          if (phaseUpdate.phase === "ended") {
            setTimeout(() => router.replace("/dashboard"), 200);
          }
        }
      }

      const mapped = mapEnvelopeToStage(type, payload);
      if (mapped) {
        setLifecycle((prev) => [...prev, mapped]);
      }

      if (
        type === "container_ready" &&
        (payload.health === "healthy" || payload.containerId)
      ) {
        markReady(`lifecycle:event/${type}`, env);
      }
      if (type === "preview_ready" && typeof payload.url === "string") {
        const url = payload.url as string;
        setPreview({ status: "ready", url });
        markReady("lifecycle:event/preview_ready", env);
      }

      if (env?.level === "error") {
        const msg =
          (payload.message as string | undefined) ||
          (payload.error as string | undefined) ||
          `Server reported a ${type} error.`;
        // If we're in a close flow, surface as a close error inline; else as
        // a session init error.
        if (userClosingRef.current) {
          toast.error("Couldn't close session", { description: msg });
        } else {
          setErrored({ message: msg });
        }
      }
    }

    function onLifecycleStatus(p: { sessionId?: string; status?: string }) {
      const status = p?.status;
      if (status === "running") {
        markReady("lifecycle:status/running", p);
      } else if (status === "saving") {
        // Treat as "in-flight close — block UI navigation". If the user
        // initiated, the overlay's already up; otherwise force-mount it.
        userClosingRef.current = true;
        setCloseOverlay((cur) => cur ?? { phase: "saving" });
      } else if (status === "recoverable") {
        // Server marked the session as recoverable mid-flight (container
        // died, prolonged disconnect, etc.). Bounce to dashboard.
        clearActiveSessionIfMatches(sessionId);
        toast.message("Session paused", {
          description:
            "Your work has been saved. Resume from the dashboard to continue.",
        });
        router.replace("/dashboard");
      } else if (status === "ended") {
        // Close completed.
        clearActiveSessionIfMatches(sessionId);
        if (userClosingRef.current) {
          router.replace("/dashboard");
        } else {
          toast.message("Session ended");
          router.replace("/dashboard");
        }
      } else if (status === "errored" || status === "failed") {
        setErrored({ message: "Sandbox initialization failed." });
      }
    }

    function onConnectionHealth(p: { status?: string; recovered?: boolean }) {
      console.log("[session] connection:health", p);
    }

    function onShareState(p: { candidatePresent?: boolean }) {
      // Candidate joined → read-only; left → editable again.
      setReadOnly(!!p?.candidatePresent);
    }

    s.socket.on("lifecycle:event", onLifecycleEvent);
    s.socket.on("lifecycle:status", onLifecycleStatus);
    s.socket.on("connection:health", onConnectionHealth);
    s.socket.on("share:state", onShareState);

    return () => {
      s.socket.off("lifecycle:event", onLifecycleEvent);
      s.socket.off("lifecycle:status", onLifecycleStatus);
      s.socket.off("connection:health", onConnectionHealth);
      s.socket.off("share:state", onShareState);
      s.socket.offAny(onAnyDebug);
      offState();
      s.dispose();
    };
  }, [sessionId, retryNonce, router]);

  // Warn on close if we have a session and the user isn't already mid-close.
  useEffect(() => {
    if (!ready || closeOverlay) return;
    function handler(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [ready, closeOverlay]);

  // ---- Close flow ----
  const closeSession = useMemo(
    () => async (body?: CloseSessionRequest) => {
      if (userClosingRef.current) return;
      userClosingRef.current = true;
      setCloseOverlay({ phase: "starting" });
      try {
        await api.sessions.close(
          sessionId,
          body && Object.keys(body).length > 0 ? body : undefined,
        );
        // The server's response is authoritative; even if we missed the
        // session_close ended event, the HTTP 200 means we're done.
        clearActiveSessionIfMatches(sessionId);
        setCloseDialogOpen(false);
        router.replace("/dashboard");
      } catch (e) {
        userClosingRef.current = false;
        setCloseOverlay(null);
        const msg =
          e instanceof ApiError
            ? e.body?.message || closeErrorMessage(e.status)
            : "Couldn't close the session.";
        toast.error("Couldn't close session", { description: msg });
      }
    },
    [sessionId, router],
  );

  // ---- Share flow ----
  const onShare = useMemo(
    () => async () => {
      setShareOpen(true);
      try {
        const { shareToken } = await api.sessions.share(sessionId);
        const origin =
          typeof window !== "undefined" ? window.location.origin : "";
        setShareUrl(`${origin}/s/${shareToken}`);
      } catch (e) {
        setShareOpen(false);
        const msg =
          e instanceof ApiError
            ? e.body?.message || "Couldn't create a share link."
            : "Couldn't create a share link.";
        toast.error("Share failed", { description: msg });
      }
    },
    [sessionId],
  );

  // ---- Render branches ----
  if (!ready) {
    return (
      <div className="flex min-h-full flex-1 flex-col">
        <ConnectionBanner state={connState} hideWhenConnected />
        <SessionLifecycleLoader
          events={lifecycle}
          errored={errored}
          onRetry={() => setRetryNonce((n) => n + 1)}
          onClose={() => router.push("/dashboard")}
        />
      </div>
    );
  }

  // Workspace.
  const root = ready.workspace?.root ?? "/";
  const files = ready.workspace?.files ?? [];
  return (
    <div className="relative flex h-[100dvh] flex-1 flex-col">
      <SessionTopBar
        framework={
          (root.split("/").filter(Boolean).pop() ?? "sandbox") as string
        }
        onBack={() => setBackOpen(true)}
        onCloseSession={() => setCloseDialogOpen(true)}
        closing={!!closeOverlay}
        onShare={() => void onShare()}
        readOnly={readOnly}
      />
      <ConnectionBanner state={connState} hideWhenConnected />
      {socket ? (
        <Workspace
          socket={socket}
          sessionId={sessionId}
          initialFiles={files}
          preview={preview}
          dbShell={dbShell}
          readOnly={readOnly}
        />
      ) : null}
      <ShareSessionDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        url={shareUrl}
      />
      {closeOverlay ? (
        <SessionCloseOverlay
          phase={closeOverlay.phase}
          detail={closeOverlay.detail}
        />
      ) : null}
      <CloseSessionDialog
        open={closeDialogOpen}
        onOpenChange={setCloseDialogOpen}
        onConfirm={(body) => void closeSession(body)}
        closing={!!closeOverlay}
        sessionId={sessionId}
        attachedCandidateRecordId={attachedCandidateId}
      />
      <SessionBackDialog
        open={backOpen}
        onOpenChange={setBackOpen}
        onLeaveRunning={() => {
          // Keep the container alive — the snapshot already lives in
          // localStorage (set on join). Dashboard will surface it.
          setBackOpen(false);
          router.push("/dashboard");
        }}
        onClose={() => {
          setBackOpen(false);
          setCloseDialogOpen(true);
        }}
        closing={!!closeOverlay}
      />
    </div>
  );
}

function closeErrorMessage(status: number): string {
  if (status === 404) return "Session not found.";
  if (status === 403) return "You don't have permission to close this session.";
  if (status === 0) return "Couldn't reach the server.";
  if (status >= 500) {
    return "Server failed during close — your files may not be fully saved. Try again.";
  }
  return "Couldn't close the session.";
}
