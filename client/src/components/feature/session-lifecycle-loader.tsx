"use client";

import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LifecycleEvent, LifecycleStage } from "@/types/session";

interface SessionLifecycleLoaderProps {
  events: LifecycleEvent[];
  errored: { message: string } | null;
  onRetry: () => void;
  onClose: () => void;
}

const STAGE_ORDER: LifecycleStage[] = [
  "queued",
  "starting",
  "image-pull",
  "container",
  "deps",
  "scaffold",
  "ready",
];

const STAGE_LABELS: Record<LifecycleStage, string> = {
  queued: "Queued",
  starting: "Starting container",
  "image-pull": "Pulling image",
  container: "Booting container",
  deps: "Installing dependencies",
  scaffold: "Scaffolding project",
  ready: "Ready",
  errored: "Failed",
};

export function SessionLifecycleLoader({
  events,
  errored,
  onRetry,
  onClose,
}: SessionLifecycleLoaderProps) {
  const latest = events[events.length - 1];
  const completedStages = new Set<LifecycleStage>();
  for (const e of events) {
    const idx = STAGE_ORDER.indexOf(e.stage);
    if (idx >= 0) {
      for (let i = 0; i <= idx; i++) completedStages.add(STAGE_ORDER[i]);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-stretch justify-center gap-8 px-6 py-12">
      <div className="space-y-2 text-center">
        <p className="text-muted-foreground font-mono text-xs uppercase tracking-[0.18em]">
          provisioning sandbox
        </p>
        <h1 className="text-foreground text-2xl font-semibold tracking-tight">
          {errored
            ? "Couldn't start the sandbox"
            : latest
              ? STAGE_LABELS[latest.stage] || "Working…"
              : "Connecting…"}
        </h1>
        {!errored && latest?.message ? (
          <p className="text-muted-foreground text-sm">{latest.message}</p>
        ) : null}
      </div>

      <ol className="border-border/60 bg-card/40 flex flex-col gap-3 rounded-lg border p-5">
        {STAGE_ORDER.filter((s) => s !== "ready").map((stage) => {
          const done = completedStages.has(stage);
          const isCurrent = latest?.stage === stage && !errored;
          return (
            <li key={stage} className="flex items-center gap-3 text-sm">
              <span
                className={cn(
                  "flex h-5 w-5 items-center justify-center",
                  done
                    ? "text-emerald-400"
                    : isCurrent
                      ? "text-foreground"
                      : "text-muted-foreground/50",
                )}
                aria-hidden
              >
                {done ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : isCurrent ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <span className="border-border/60 inline-block h-2 w-2 rounded-full border" />
                )}
              </span>
              <span
                className={cn(
                  done || isCurrent
                    ? "text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {STAGE_LABELS[stage]}
              </span>
            </li>
          );
        })}
      </ol>

      {errored ? (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/10 flex flex-col items-start gap-3 rounded-lg border p-5"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle
              className="text-destructive h-4 w-4"
              aria-hidden
            />
            <p className="text-foreground text-sm font-medium">
              {errored.message}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={onRetry}>
              Retry
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose}>
              Back to dashboard
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
