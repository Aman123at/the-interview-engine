"use client";

import { Loader2, Play, X } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FrameworkIcon } from "@/lib/framework-icon";
import type { FrameworkDef, Session } from "@/contracts";

interface RecoverableSessionCardProps {
  session: Session;
  frameworks: FrameworkDef[] | null;
  onResume: () => void;
  onEnd: () => void;
  resuming: boolean;
  ending: boolean;
}

export function RecoverableSessionCard({
  session,
  frameworks,
  onResume,
  onEnd,
  resuming,
  ending,
}: RecoverableSessionCardProps) {
  const fw = frameworks?.find((f) => f.id === session.framework) ?? null;
  const label = fw?.label ?? session.framework;
  const summary = summarizeCustomization(
    fw,
    session.customization as Record<string, string | string[]> | undefined,
  );
  const busy = resuming || ending;

  return (
    <Card className="border-yellow-500/30 bg-yellow-500/[0.04]">
      <CardHeader className="flex flex-row items-start gap-4">
        <span
          className="bg-primary/10 text-primary inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md"
          aria-hidden
        >
          <FrameworkIcon id={session.framework} className="h-5 w-5" />
        </span>
        <div className="space-y-1.5">
          <p className="text-yellow-300 font-mono text-[10px] uppercase tracking-wider">
            Recoverable session
          </p>
          <CardTitle className="text-base">
            Continue your {label} sandbox
          </CardTitle>
          <CardDescription className="leading-relaxed">
            Your previous session was paused with all files saved. Resume to
            pick up where you left off, or end it to start a new one.
          </CardDescription>
          {summary ? (
            <p className="text-muted-foreground pt-1 font-mono text-[11px]">
              {summary}
            </p>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-0">
        <p className="text-muted-foreground text-xs">
          Started {relativeTime(toIso(session.createdAt))}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onEnd}
            disabled={busy}
            aria-label="End session"
          >
            {ending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <X className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            )}
            {ending ? "Ending…" : "End session"}
          </Button>
          <Button size="sm" onClick={onResume} disabled={busy}>
            {resuming ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            )}
            {resuming ? "Resuming…" : "Resume"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function toIso(d: Date | string | null | undefined): string | undefined {
  if (!d) return undefined;
  return typeof d === "string" ? d : d.toISOString();
}

function summarizeCustomization(
  framework: FrameworkDef | null,
  customization: Record<string, string | string[]> | undefined,
): string {
  if (!customization) return "";
  const parts: string[] = [];
  // Prefer the human label from the framework config when we have it.
  for (const [groupId, raw] of Object.entries(customization)) {
    const group = framework?.groups.find((g) => g.id === groupId);
    const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
    for (const v of values) {
      const opt = group?.options.find((o) => o.id === v);
      const label = opt?.label ?? v;
      if (label) parts.push(label);
    }
  }
  return parts.join(" · ");
}

function relativeTime(iso: string | undefined): string {
  if (!iso) return "earlier";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "earlier";
  const diff = Math.max(0, Date.now() - then);
  const s = Math.floor(diff / 1000);
  if (s < 60) return "moments ago";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
