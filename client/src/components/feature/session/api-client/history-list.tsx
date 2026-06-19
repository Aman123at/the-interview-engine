"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { HistoryEntry } from "@/types/api-client";

interface HistoryListProps {
  entries: HistoryEntry[];
  onRestore: (entry: HistoryEntry) => void;
  onClose: () => void;
}

export function HistoryList({ entries, onRestore, onClose }: HistoryListProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-border/60 flex shrink-0 items-center justify-between border-b px-2 py-1.5">
        <p className="text-muted-foreground font-mono text-[10px] uppercase tracking-wider">
          History
        </p>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Close history"
          onClick={onClose}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {entries.length === 0 ? (
          <p className="text-muted-foreground px-3 py-4 text-[11px]">
            No requests yet. Hit Send and they&apos;ll show up here.
          </p>
        ) : (
          <ul className="m-0 list-none p-0">
            {entries.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => onRestore(e)}
                  className="hover:bg-accent/40 border-border/40 flex w-full flex-col items-start gap-1 border-b px-2 py-1.5 text-left transition-colors"
                >
                  <div className="flex w-full items-center gap-2">
                    <span
                      className={cn(
                        "shrink-0 rounded-sm px-1 font-mono text-[10px]",
                        methodColor(e.request.method),
                      )}
                    >
                      {e.request.method}
                    </span>
                    {e.response ? (
                      <span
                        className={cn(
                          "shrink-0 font-mono text-[10px]",
                          statusColor(e.response.status),
                        )}
                      >
                        {e.response.status || "ERR"}
                      </span>
                    ) : null}
                    <span className="text-muted-foreground ml-auto shrink-0 text-[10px]">
                      {relativeTime(e.sentAt)}
                    </span>
                  </div>
                  <span className="text-foreground truncate font-mono text-[11px]">
                    {e.request.url || "—"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function methodColor(method: string): string {
  switch (method) {
    case "GET":
      return "bg-emerald-500/10 text-emerald-200";
    case "POST":
      return "bg-blue-500/10 text-blue-200";
    case "PUT":
      return "bg-yellow-500/10 text-yellow-200";
    case "PATCH":
      return "bg-purple-500/10 text-purple-200";
    case "DELETE":
      return "bg-destructive/15 text-destructive";
    default:
      return "bg-muted/40 text-muted-foreground";
  }
}

function statusColor(status: number): string {
  if (status === 0) return "text-destructive";
  if (status >= 500) return "text-destructive";
  if (status >= 400) return "text-yellow-300";
  if (status >= 300) return "text-blue-300";
  if (status >= 200) return "text-emerald-300";
  return "text-muted-foreground";
}

function relativeTime(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const s = Math.floor(diff / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}
