"use client";

import { ChevronLeft, Eye, Share2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FrameworkIcon } from "@/lib/framework-icon";
import { ThemeToggle } from "@/components/theme-toggle";
import type { CustomizationSelection } from "@/lib/customization";

interface SessionTopBarProps {
  framework: string;
  frameworkLabel?: string;
  customization?: CustomizationSelection;
  /** Click handler for the back arrow. The page shows a confirm dialog here. */
  onBack: () => void;
  onCloseSession: () => void;
  closing?: boolean;
  /** Open the share dialog (interviewer). */
  onShare?: () => void;
  /** True while a candidate is editing — surfaces a read-only badge. */
  readOnly?: boolean;
}

function summarize(customization: CustomizationSelection | undefined): string {
  if (!customization) return "";
  const parts: string[] = [];
  for (const [, v] of Object.entries(customization)) {
    if (typeof v === "string" && v) parts.push(v);
    else if (Array.isArray(v)) parts.push(...v);
  }
  return parts.join(" · ");
}

export function SessionTopBar({
  framework,
  frameworkLabel,
  customization,
  onBack,
  onCloseSession,
  closing,
  onShare,
  readOnly,
}: SessionTopBarProps) {
  const summary = summarize(customization);
  return (
    <header className="border-border/60 bg-background/80 supports-[backdrop-filter]:bg-background/60 flex items-center justify-between gap-3 border-b px-3 py-2 backdrop-blur">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to dashboard"
          disabled={closing}
          className="text-muted-foreground hover:text-foreground hover:bg-accent/40 focus-visible:ring-ring/50 inline-flex h-7 w-7 items-center justify-center rounded-md outline-none transition-colors focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span
          className="bg-primary/10 text-primary inline-flex h-7 w-7 items-center justify-center rounded-md"
          aria-hidden
        >
          <FrameworkIcon id={framework} className="h-4 w-4" />
        </span>
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="text-foreground truncate text-sm font-medium">
            {frameworkLabel ?? framework}
          </span>
          {summary ? (
            <span className="text-muted-foreground truncate text-[11px]">
              {summary}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {readOnly ? (
          <span className="border-amber-500/30 bg-amber-500/10 text-amber-300 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium">
            <Eye className="h-3.5 w-3.5" aria-hidden />
            Candidate editing · read-only
          </span>
        ) : null}
        {onShare ? (
          <Button size="sm" variant="outline" onClick={onShare} disabled={closing}>
            <Share2 className="mr-1.5 h-4 w-4" aria-hidden />
            Share
          </Button>
        ) : null}
        <ThemeToggle />
        <Button
          size="sm"
          variant="outline"
          onClick={onCloseSession}
          disabled={closing}
        >
          <X className="mr-1.5 h-4 w-4" aria-hidden />
          {closing ? "Closing…" : "Close session"}
        </Button>
      </div>
    </header>
  );
}
