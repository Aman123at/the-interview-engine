"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth/auth-context";
import { useFrameworks } from "@/lib/hooks/use-frameworks";
import {
  FrameworkGrid,
  FrameworkGridError,
  FrameworkGridSkeleton,
} from "@/components/feature/framework-grid";
import { FrameworkDialog } from "@/components/feature/framework-dialog";
import { RecoverableSessionCard } from "@/components/feature/recoverable-session-card";
import { ActiveSessionCard } from "@/components/feature/active-session-card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { FadeIn } from "@/components/feature/fade-in";
import { DesignGallery } from "@/components/feature/design/design-gallery";
import { NewDesignDialog } from "@/components/feature/design/new-design-dialog";
import { InterviewerCandidatesPanel } from "@/components/feature/interviewer-candidates-panel";
import { api, ApiError } from "@/lib/api";
import type { DesignDocKind } from "@/contracts";
import {
  clearActiveSession,
  getActiveSession,
  type ActiveSessionSnapshot,
} from "@/lib/active-session-store";
import type { FrameworkDef, Session } from "@/contracts";

type DashboardTab = "code" | "db_design" | "system_design" | "candidates";

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { data: frameworks, loading, error, reload } = useFrameworks();
  const [selected, setSelected] = useState<FrameworkDef | null>(null);
  const [open, setOpen] = useState(false);
  const [recoverable, setRecoverable] = useState<Session | null>(null);
  const [recoverableLoading, setRecoverableLoading] = useState(true);
  const [activeLocal, setActiveLocal] = useState<ActiveSessionSnapshot | null>(
    null,
  );
  const [resuming, setResuming] = useState(false);
  const [ending, setEnding] = useState(false);
  const [tab, setTab] = useState<DashboardTab>("code");
  const [newDesignKind, setNewDesignKind] = useState<DesignDocKind | null>(null);
  const [designRefreshKey, setDesignRefreshKey] = useState(0);

  const firstName = (user?.displayName || user?.email || "")
    .split(/\s|@/)[0]
    .trim();

  // Probe for a recoverable session on every dashboard mount.
  const refreshRecoverable = useCallback(async () => {
    setRecoverableLoading(true);
    try {
      const res = await api.sessions.getRecoverable();
      setRecoverable(res.session);
      // If the server now has a recoverable row, it supersedes anything we
      // were tracking locally — clear the active-session pointer.
      if (res.session) clearActiveSession();
    } catch (e) {
      console.warn("[dashboard] /sessions/recoverable failed", e);
      setRecoverable(null);
    } finally {
      setRecoverableLoading(false);
    }
  }, []);

  const refreshLocal = useCallback(() => {
    setActiveLocal(getActiveSession());
  }, []);

  useEffect(() => {
    // Fetch-on-mount is the intended pattern — same as `useFrameworks`.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshRecoverable();
    refreshLocal();
  }, [refreshRecoverable, refreshLocal]);

  // If the user comes back to this tab after closing the session in another
  // tab, the local snapshot may be stale. Re-read on focus.
  useEffect(() => {
    function onFocus() {
      refreshLocal();
      void refreshRecoverable();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshLocal, refreshRecoverable]);

  function openFramework(f: FrameworkDef) {
    setSelected(f);
    setOpen(true);
  }

  async function onResume() {
    if (!recoverable || resuming || ending) return;
    setResuming(true);
    try {
      const res = await api.sessions.resume(recoverable.id);
      router.push(`/session/${res.session.id}`);
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.body?.message || resumeErrorMessage(e.status)
          : "Couldn't resume session.";
      toast.error("Couldn't resume", { description: msg });
      if (e instanceof ApiError && (e.status === 404 || e.status === 410)) {
        void refreshRecoverable();
      }
      setResuming(false);
    }
  }

  async function onEndRecoverable() {
    if (!recoverable || resuming || ending) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "End this session for good? Your files have been saved, but you won't be able to resume it.",
      )
    ) {
      return;
    }
    setEnding(true);
    try {
      await api.sessions.close(recoverable.id);
      toast.success("Session ended");
      await refreshRecoverable();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Couldn't end session.";
      toast.error("Couldn't end session", { description: msg });
    } finally {
      setEnding(false);
    }
  }

  function onContinueActive() {
    if (!activeLocal) return;
    router.push(`/session/${activeLocal.id}`);
  }

  async function onCloseActive() {
    if (!activeLocal || ending) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "Close this running session? Files will be saved before the container is torn down.",
      )
    ) {
      return;
    }
    setEnding(true);
    try {
      await api.sessions.close(activeLocal.id);
      toast.success("Session closed");
      clearActiveSession();
      setActiveLocal(null);
      await refreshRecoverable();
    } catch (e) {
      if (e instanceof ApiError && (e.status === 404 || e.status === 410)) {
        // Already gone server-side — drop the stale pointer.
        clearActiveSession();
        setActiveLocal(null);
        await refreshRecoverable();
      } else {
        const msg =
          e instanceof ApiError ? e.message : "Couldn't close session.";
        toast.error("Couldn't close session", { description: msg });
      }
    } finally {
      setEnding(false);
    }
  }

  // Priority order: server-recoverable > locally-tracked running > framework grid.
  const hasCard = !!recoverable || !!activeLocal;
  const showFrameworkGrid = !hasCard;

  return (
    <main className="relative mx-auto flex w-full max-w-[1240px] flex-1 flex-col gap-10 px-10 py-14">
      <div className="aurora-hero-glow" aria-hidden />
      <FadeIn as="header" className="relative z-[1] space-y-3">
        <p className="text-t-lo font-mono text-[12px] font-medium uppercase tracking-[0.26em]">
          dashboard
        </p>
        <h1 className="font-display text-t-hi text-[44px] font-bold leading-[1.05] tracking-[-0.02em] md:text-[62px] md:leading-[1.0] md:tracking-[-0.03em]">
          {firstName ? (
            <>
              Welcome, <span className="text-accent-text">{firstName}.</span>
            </>
          ) : (
            <>
              Welcome, <span className="text-accent-text">Interview.</span>
            </>
          )}
        </h1>
        <p className="text-t-mid max-w-[560px] text-[16px] leading-relaxed">
          {recoverable
            ? "You have a paused session. Resume it to keep going, or end it to start a fresh one."
            : activeLocal
              ? "You have a sandbox running in the background. Jump back in, or close it to start a new one."
              : (
                <>
                  Pick a framework to spin up a sandbox.
                </>
              )}
        </p>
      </FadeIn>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as DashboardTab)}
        className="gap-6"
      >
        <TabsList
          variant="line"
          className="self-stretch border-b border-bd gap-[30px] !h-auto pb-[6px] !rounded-none"
        >
          <TabsTrigger value="code">Code Sandbox</TabsTrigger>
          <TabsTrigger value="db_design">Database Design</TabsTrigger>
          <TabsTrigger value="system_design">System Design</TabsTrigger>
          <TabsTrigger value="candidates">Candidates</TabsTrigger>
        </TabsList>

        <TabsContent value="code" className="flex flex-col gap-6">
          {recoverableLoading ? (
            <Skeleton className="h-36 w-full" />
          ) : recoverable ? (
            <RecoverableSessionCard
              session={recoverable}
              frameworks={frameworks}
              onResume={() => void onResume()}
              onEnd={() => void onEndRecoverable()}
              resuming={resuming}
              ending={ending}
            />
          ) : activeLocal ? (
            <ActiveSessionCard
              session={activeLocal}
              frameworks={frameworks}
              onContinue={onContinueActive}
              onClose={() => void onCloseActive()}
              ending={ending}
            />
          ) : null}

          {showFrameworkGrid ? (
            <FadeIn
              as="section"
              delay={0.05}
              aria-labelledby="frameworks-heading"
              className="space-y-4"
            >
              <h2
                id="frameworks-heading"
                className="font-display text-t-hi text-[18px] font-semibold tracking-[-0.018em]"
              >
                Frameworks
              </h2>

              {loading ? (
                <FrameworkGridSkeleton />
              ) : error ? (
                <FrameworkGridError message={error.message} onRetry={reload} />
              ) : frameworks && frameworks.length > 0 ? (
                <FrameworkGrid
                  frameworks={frameworks}
                  onSelect={openFramework}
                />
              ) : (
                <p className="text-muted-foreground text-xs">
                  No frameworks available. Check the server config.
                </p>
              )}
            </FadeIn>
          ) : null}
        </TabsContent>

        <TabsContent value="db_design" className="flex flex-col gap-4">
          <FadeIn className="space-y-1">
            <h2 className="text-foreground text-sm font-medium">
              Database designs
            </h2>
            <p className="text-muted-foreground max-w-xl text-xs leading-relaxed">
              Drag-and-drop tables (Postgres / MySQL) or document collections
              (MongoDB). Saved here; canvas opens in a separate workspace.
            </p>
          </FadeIn>
          <DesignGallery
            kind="db_design"
            onCreate={() => setNewDesignKind("db_design")}
            refreshKey={designRefreshKey}
          />
        </TabsContent>

        <TabsContent value="system_design" className="flex flex-col gap-4">
          <FadeIn className="space-y-1">
            <h2 className="text-foreground text-sm font-medium">
              System designs
            </h2>
            <p className="text-muted-foreground max-w-xl text-xs leading-relaxed">
              Freeform architecture canvas with shapes, text, arrows, and a
              stencil palette (database, server, client, phone).
            </p>
          </FadeIn>
          <DesignGallery
            kind="system_design"
            onCreate={() => setNewDesignKind("system_design")}
            refreshKey={designRefreshKey}
          />
        </TabsContent>

        <TabsContent value="candidates" className="flex flex-col gap-4">
          <InterviewerCandidatesPanel />
        </TabsContent>
      </Tabs>

      <FrameworkDialog
        framework={selected}
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) {
            setTimeout(() => setSelected(null), 150);
            // A 409 from create may mean an active/recoverable session
            // popped up server-side — re-probe both surfaces.
            void refreshRecoverable();
            refreshLocal();
          }
        }}
      />

      <NewDesignDialog
        kind={newDesignKind ?? "db_design"}
        open={newDesignKind !== null}
        onOpenChange={(v) => {
          if (!v) setNewDesignKind(null);
        }}
        onCreated={() => setDesignRefreshKey((n) => n + 1)}
      />
    </main>
  );
}

function resumeErrorMessage(status: number): string {
  if (status === 404) {
    return "The session's data was lost from disk and can't be resumed.";
  }
  if (status === 409) {
    return "The session is no longer in a recoverable state, or the host port pool is exhausted.";
  }
  if (status === 403) {
    return "You don't have permission to resume this session.";
  }
  return "Couldn't resume session.";
}
