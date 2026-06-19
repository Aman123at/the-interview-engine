"use client";

import { ChevronRight, AlertTriangle } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FrameworkIcon } from "@/lib/framework-icon";
import { TiltCard } from "@/components/feature/tilt-card";
import type { FrameworkDef } from "@/contracts";

interface FrameworkGridProps {
  frameworks: FrameworkDef[];
  onSelect: (framework: FrameworkDef) => void;
}

export function FrameworkGrid({ frameworks, onSelect }: FrameworkGridProps) {
  const reduce = useReducedMotion();
  return (
    <ul
      role="list"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      {frameworks.map((f, i) => (
        <motion.li
          key={f.id}
          // Subtle staggered fade-up — capped at 8 tiles' worth of delay so a
          // long list doesn't drip in slowly. Disabled under reduced motion.
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
        className="border-border/60 bg-card hover:border-border hover:bg-accent/40 focus-visible:ring-ring/50 focus-visible:border-ring relative flex h-full w-full flex-col items-start gap-4 rounded-[inherit] border p-5 text-left transition-colors outline-none focus-visible:ring-3"
      >
        <div className="flex w-full items-start justify-between gap-3">
          <span
            className="bg-primary/10 text-primary inline-flex h-10 w-10 items-center justify-center rounded-md"
            aria-hidden
          >
            <FrameworkIcon id={framework.id} className="h-5 w-5" />
          </span>
          <ChevronRight
            className="text-muted-foreground group-hover:text-foreground h-4 w-4 transition-colors"
            aria-hidden
          />
        </div>
        <div className="space-y-1">
          <h3 className="text-foreground text-base font-medium tracking-tight">
            {framework.label + fullStackText}
          </h3>
        </div>
        <p className="text-muted-foreground mt-auto text-[11px]">
          {count} {count === 1 ? "option" : "options"} to customize
        </p>
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
