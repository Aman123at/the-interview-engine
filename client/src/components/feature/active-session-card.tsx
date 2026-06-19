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
import type { ActiveSessionSnapshot } from "@/lib/active-session-store";
import type { FrameworkDef } from "@/contracts";

interface ActiveSessionCardProps {
  session: ActiveSessionSnapshot;
  frameworks: FrameworkDef[] | null;
  onContinue: () => void;
  onClose: () => void;
  ending: boolean;
}

/**
 * Shown on the dashboard when the user has a locally-tracked session that
 * the server hasn't yet flipped to `recoverable`. Visually distinct from the
 * `recoverable` card so the user knows it's still alive in the background.
 */
export function ActiveSessionCard({
  session,
  frameworks,
  onContinue,
  onClose,
  ending,
}: ActiveSessionCardProps) {
  const fw = frameworks?.find((f) => f.id === session.framework) ?? null;
  const label = fw?.label ?? session.framework ?? "sandbox";
  const summary = summarizeCustomization(fw, session.customization);

  return (
    <Card className="border-emerald-500/30 bg-emerald-500/[0.04]">
      <CardHeader className="flex flex-row items-start gap-4">
        <span
          className="bg-primary/10 text-primary inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md"
          aria-hidden
        >
          <FrameworkIcon id={session.framework} className="h-5 w-5" />
        </span>
        <div className="space-y-1.5">
          <p className="font-mono text-[10px] uppercase tracking-wider text-emerald-300">
            Active session · still running
          </p>
          <CardTitle className="text-base">
            Continue your {label} sandbox
          </CardTitle>
          <CardDescription className="leading-relaxed">
            You left this session running in the background. Jump back into the
            workspace, or close it to free up resources and start a new one.
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
          Started {relativeTime(session.enteredAt)}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={ending}
            aria-label="Close session"
          >
            {ending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <X className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            )}
            {ending ? "Closing…" : "Close session"}
          </Button>
          <Button size="sm" onClick={onContinue} disabled={ending}>
            <Play className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Continue session
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function summarizeCustomization(
  framework: FrameworkDef | null,
  customization: Record<string, string | string[]> | undefined,
): string {
  if (!customization) return "";
  const parts: string[] = [];
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
  return "earlier today";
}
