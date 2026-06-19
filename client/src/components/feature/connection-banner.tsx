"use client";

import { AlertTriangle, Loader2, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConnectionState } from "@/lib/socket";

interface ConnectionBannerProps {
  state: ConnectionState;
  /** Hide entirely once a steady "connected" state has been reached. */
  hideWhenConnected?: boolean;
}

const COPY: Record<
  ConnectionState,
  { label: string; tone: "muted" | "warn" | "danger" } | null
> = {
  idle: null,
  connecting: { label: "Connecting…", tone: "muted" },
  connected: { label: "Connected", tone: "muted" },
  reconnecting: { label: "Reconnecting…", tone: "warn" },
  lost: { label: "Connection lost — actions are queued", tone: "danger" },
};

export function ConnectionBanner({
  state,
  hideWhenConnected = true,
}: ConnectionBannerProps) {
  const meta = COPY[state];
  if (!meta) return null;
  if (hideWhenConnected && state === "connected") return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center gap-2 border-b px-4 py-1.5 text-xs",
        meta.tone === "muted" &&
          "border-border/60 bg-muted/40 text-muted-foreground",
        meta.tone === "warn" &&
          "border-yellow-500/30 bg-yellow-500/10 text-yellow-200",
        meta.tone === "danger" &&
          "border-destructive/30 bg-destructive/10 text-destructive",
      )}
    >
      {state === "connected" ? (
        <Wifi className="h-3.5 w-3.5" aria-hidden />
      ) : state === "lost" ? (
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
      ) : (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
      )}
      <span>{meta.label}</span>
    </div>
  );
}
