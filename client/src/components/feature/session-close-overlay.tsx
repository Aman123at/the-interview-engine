"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ClosePhase = "starting" | "saving" | "persisted" | "pruned" | "ended";

const ORDER: ClosePhase[] = ["starting", "saving", "persisted", "pruned", "ended"];

const LABELS: Record<ClosePhase, string> = {
  starting: "Closing session",
  saving: "Saving your work",
  persisted: "Files persisted",
  pruned: "Cleaning up dependencies",
  ended: "Done",
};

interface SessionCloseOverlayProps {
  /** Current phase reported by the server (or "starting" before the first event). */
  phase: ClosePhase;
  /** Optional fine-grained detail, e.g. "7 files saved". */
  detail?: string;
}

export function SessionCloseOverlay({ phase, detail }: SessionCloseOverlayProps) {
  const currentIndex = ORDER.indexOf(phase);
  return (
    <div
      role="alertdialog"
      aria-live="polite"
      aria-busy={phase !== "ended"}
      className="bg-background/85 supports-[backdrop-filter]:backdrop-blur-sm absolute inset-0 z-50 flex items-center justify-center px-6"
    >
      <div className="border-border/60 bg-card flex w-full max-w-md flex-col gap-6 rounded-lg border p-6 shadow-lg">
        <div className="space-y-1">
          <p className="text-muted-foreground font-mono text-[10px] uppercase tracking-wider">
            Closing sandbox
          </p>
          <h2 className="text-foreground text-lg font-semibold tracking-tight">
            {LABELS[phase]}
            {phase !== "ended" ? "…" : ""}
          </h2>
          {detail ? (
            <p className="text-muted-foreground text-xs">{detail}</p>
          ) : null}
        </div>
        <ol className="border-border/60 bg-card/60 flex flex-col gap-2.5 rounded-md border p-4">
          {ORDER.filter((p) => p !== "starting").map((p, i) => {
            const done = currentIndex > ORDER.indexOf(p);
            const isCurrent = phase === p;
            return (
              <li key={p} className="flex items-center gap-2.5 text-sm">
                <span
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center",
                    done
                      ? "text-emerald-400"
                      : isCurrent
                        ? "text-foreground"
                        : "text-muted-foreground/40",
                  )}
                  aria-hidden
                >
                  {done ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : isCurrent ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <span className="border-border/60 inline-block h-1.5 w-1.5 rounded-full border" />
                  )}
                </span>
                <span
                  className={cn(
                    "text-sm",
                    done || isCurrent
                      ? "text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {LABELS[p]}
                </span>
                {i === 0 && phase === "starting" ? null : null}
              </li>
            );
          })}
        </ol>
        <p className="text-muted-foreground text-[11px]">
          Your work is being saved durably. You can resume this session later
          from the dashboard.
        </p>
      </div>
    </div>
  );
}
