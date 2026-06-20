"use client";

import { ChevronRight, AlertTriangle } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { FrameworkIcon } from "@/lib/framework-icon";
import { TiltCard } from "@/components/feature/tilt-card";
import type { FrameworkDef } from "@/contracts";

interface FrameworkGridProps {
  frameworks: FrameworkDef[];
  onSelect: (framework: FrameworkDef) => void;
}

export function FrameworkGrid({ frameworks, onSelect }: FrameworkGridProps) {
  const reduce = useReducedMotion();
  // Keep "fullstack" first since it's the headline framework, but every card
  // now uses the same neutral-default / accent-on-hover treatment.
  const ordered = [...frameworks].sort((a, b) => {
    if (a.id === "fullstack") return -1;
    if (b.id === "fullstack") return 1;
    return 0;
  });
  return (
    <ul
      role="list"
      className="grid grid-cols-1 gap-[18px] sm:grid-cols-2 lg:grid-cols-3"
    >
      {ordered.map((f, i) => (
        <motion.li
          key={f.id}
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.22,
            ease: [0.22, 1, 0.36, 1],
            delay: reduce ? 0 : Math.min(i, 7) * 0.035,
          }}
        >
          <FrameworkTile framework={f} onSelect={() => onSelect(f)} />
        </motion.li>
      ))}
    </ul>
  );
}

interface FrameworkTileProps {
  framework: FrameworkDef;
  onSelect: () => void;
}

function FrameworkTile({ framework, onSelect }: FrameworkTileProps) {
  const count = framework.groups.length;

  const fullStackText = framework.id === "fullstack" ? " (React + Node)" : "";

  return (
    <TiltCard
      className="group h-full"
      ariaLabel={`Start a ${framework.label} sandbox`}
    >
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "relative flex h-full min-h-[196px] w-full flex-col items-start gap-4 overflow-hidden rounded-[18px] border border-bd bg-panel p-[22px] text-left transition-all duration-150 outline-none",
          "focus-visible:ring-2 focus-visible:ring-[var(--accent-main)]/50",
          // Hover: accent border + glow shadow + soft radial accent fill via
          // the inner overlay below. Applies to EVERY card.
          "hover:-translate-y-[3px] hover:border-[var(--accent-border)] hover:shadow-[0_18px_50px_var(--accent-shadow)]",
        )}
      >
        {/* Soft accent glow — hidden by default, fades in on hover. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
          style={{
            background:
              "radial-gradient(70% 80% at 100% 0%, rgba(var(--accent-rgb), 0.18), transparent 60%)",
          }}
        />

        <div className="relative flex w-full items-start justify-between gap-3">
          <span
            className="relative inline-flex h-12 w-12 items-center justify-center overflow-hidden rounded-[14px] bg-icon-bg text-t-mid transition-colors duration-200 group-hover:text-white"
            aria-hidden
          >
            <FrameworkIcon
              id={framework.id}
              className="h-5 w-5 relative z-10"
            />
            {/* gradient fill that fades in on hover behind the icon glyph */}
            <span
              aria-hidden
              className="absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-200 group-hover:opacity-100"
              style={{
                background: "var(--accent-grad)",
                boxShadow: "0 10px 28px var(--accent-shadow)",
              }}
            />
          </span>
          <ChevronRight
            className="h-5 w-5 text-t-lo transition-colors group-hover:text-accent-text"
            aria-hidden
          />
        </div>
        <div className="relative mt-auto space-y-1.5">
          <h3 className="font-display text-[19px] font-semibold tracking-[-0.018em] text-t-hi">
            {framework.label + fullStackText}
          </h3>
          <p className="text-t-lo font-mono text-[12px] transition-colors duration-200 group-hover:text-accent-text">
            {count} {count === 1 ? "option" : "options"} to customize
          </p>
        </div>
      </button>
    </TiltCard>
  );
}

export function FrameworkGridSkeleton() {
  return (
    <ul
      role="list"
      aria-label="Loading frameworks"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <li
          key={i}
          className="border-border/60 bg-card/40 flex flex-col gap-4 rounded-lg border p-5"
        >
          <Skeleton className="h-10 w-10 rounded-md" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-40" />
          </div>
          <Skeleton className="mt-2 h-3 w-20" />
        </li>
      ))}
    </ul>
  );
}

interface FrameworkGridErrorProps {
  message?: string;
  onRetry: () => void;
}

export function FrameworkGridError({
  message,
  onRetry,
}: FrameworkGridErrorProps) {
  return (
    <div
      role="alert"
      className="border-destructive/30 bg-destructive/5 flex flex-col items-start gap-3 rounded-lg border p-6"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="text-destructive h-4 w-4" aria-hidden />
        <p className="text-foreground text-sm font-medium">
          Couldn&apos;t load frameworks
        </p>
      </div>
      <p className="text-muted-foreground text-xs">
        {message ?? "The server returned an error fetching /config/frameworks."}
      </p>
      <Button size="sm" variant="outline" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
