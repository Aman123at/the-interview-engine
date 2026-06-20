"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, Download, History, Loader2, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FadeIn } from "@/components/feature/fade-in";
import { DeleteHistoryDialog } from "@/components/feature/delete-history-dialog";
import { FrameworkIcon } from "@/lib/framework-icon";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { SessionHistoryItem, SessionsHistoryResponse, SessionStatus } from "@/contracts";

const PAGE_SIZE = 25;

export default function PastSessionsPage() {
  const [items, setItems] = useState<SessionHistoryItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SessionHistoryItem | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete(deleteVolume: boolean) {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setDeleting(true);
    const snapshot = items;
    // Optimistic remove.
    setItems((prev) => prev.filter((it) => it.id !== target.id));
    try {
      await api.sessions.removeFromHistory(target.id, { deleteVolume });
      toast.success(
        deleteVolume
          ? "Session removed and code deleted"
          : "Session removed from history",
      );
      setPendingDelete(null);
    } catch (e) {
      // Reconcile: put the row back so the list stays accurate.
      setItems(snapshot);
      if (e instanceof ApiError && e.status === 409) {
        toast.error("Session is still active", {
          description:
            "Close the session first before removing it from history.",
        });
      } else {
        const msg =
          e instanceof ApiError
            ? e.message
            : e instanceof Error
              ? e.message
              : "Failed to remove session";
        toast.error("Couldn't remove session", { description: msg });
      }
    } finally {
      setDeleting(false);
    }
  }

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res: SessionsHistoryResponse = await api.sessions.history({
        limit: PAGE_SIZE,
      });
      setItems(res.items);
      setCursor(res.nextCursor);
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Failed to load past sessions";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetch-on-mount is the intended pattern here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadInitial();
  }, [loadInitial]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await api.sessions.history({ limit: PAGE_SIZE, cursor });
      setItems((prev) => [...prev, ...res.items]);
      setCursor(res.nextCursor);
    } catch {
      // toast already surfaced by api wrapper? history uses silent — surface inline
      setError("Failed to load more sessions");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-[1240px] flex-1 px-10 py-12">
      <FadeIn>
        <div className="mb-6 flex items-center gap-3">
          <Link
            href="/dashboard"
            aria-label="Back to dashboard"
            className="text-t-mid hover:text-t-hi inline-flex items-center gap-1.5 text-sm transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Link>
        </div>
        <header className="mb-8 flex items-start gap-4">
          <span
            className="inline-flex h-[42px] w-[42px] items-center justify-center rounded-[12px]"
            style={{ background: "var(--accent-soft)", color: "var(--accent-text)" }}
            aria-hidden
          >
            <History className="h-5 w-5" />
          </span>
          <div>
            <h1 className="font-display text-t-hi text-[40px] font-bold leading-tight tracking-[-0.022em]">
              Past Sessions
            </h1>
            <p className="text-t-mid mt-1.5 text-[15px]">
              Your completed code interview sandboxes. Download or remove archived
              sessions.
            </p>
          </div>
        </header>
      </FadeIn>

      {loading ? (
        <HistorySkeleton />
      ) : error ? (
        <ErrorState message={error} onRetry={loadInitial} />
      ) : items.length === 0 ? (
        <EmptyState />
      ) : (
        <FadeIn>
          <Card className="overflow-hidden rounded-[18px] border-bd bg-panel p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-panel-2 text-t-lo border-b border-bd font-mono text-[11px] uppercase tracking-[0.16em]">
                  <tr>
                    <th className="px-5 py-3.5 text-left font-medium">Framework</th>
                    <th className="px-5 py-3.5 text-left font-medium">Status</th>
                    <th className="px-5 py-3.5 text-left font-medium">Started</th>
                    <th className="px-5 py-3.5 text-left font-medium">Ended</th>
                    <th className="px-5 py-3.5 text-left font-medium">Candidate</th>
                    <th className="px-5 py-3.5 text-left font-medium">Rating</th>
                    <th className="px-5 py-3.5 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bd">
                  {items.map((item) => (
                    <HistoryRow
                      key={item.id}
                      item={item}
                      onDelete={() => setPendingDelete(item)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          {cursor ? (
            <div className="mt-6 flex justify-center">
              <Button
                variant="outline"
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? "Loading…" : "Load more"}
              </Button>
            </div>
          ) : null}
        </FadeIn>
      )}

      <DeleteHistoryDialog
        key={pendingDelete?.id ?? "closed"}
        open={pendingDelete !== null}
        onOpenChange={(o) => {
          if (!o && !deleting) setPendingDelete(null);
        }}
        sessionLabel={pendingDelete?.framework ?? ""}
        endedLabel={formatEndedLabel(pendingDelete?.endedAt ?? null)}
        hasVolume={pendingDelete?.downloadable ?? false}
        deleting={deleting}
        onConfirm={confirmDelete}
      />
    </main>
  );
}

function formatEndedLabel(iso: string | Date | null): string | null {
  if (!iso) return null;
  const date = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString();
}

function HistoryRow({
  item,
  onDelete,
}: {
  item: SessionHistoryItem;
  onDelete: () => void;
}) {
  const [downloading, setDownloading] = useState(false);

  async function onDownload() {
    if (!item.downloadable || downloading) return;
    setDownloading(true);
    try {
      const { blob, filename } = await api.sessions.download(item.id);
      saveBlob(blob, filename);
    } catch (e) {
      if (e instanceof ApiError && e.body?.code === "VOLUME_UNAVAILABLE") {
        toast.error("Code no longer available", {
          description:
            "The stored code for this session has been removed and can't be downloaded.",
        });
      } else {
        const msg =
          e instanceof ApiError
            ? e.message
            : e instanceof Error
              ? e.message
              : "Download failed";
        toast.error("Download failed", { description: msg });
      }
    } finally {
      setDownloading(false);
    }
  }

  return (
    <tr className="hover:bg-panel-2 transition-colors">
      <td className="px-5 py-4">
        <div className="flex items-start gap-3">
          <span
            className="bg-icon-bg text-t-mid inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[12px]"
            aria-hidden
          >
            <FrameworkIcon id={item.framework} className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="font-display text-t-hi text-[15px] font-semibold capitalize">
              {item.framework}
            </p>
            {item.customizationSummary ? (
              <p
                className="text-t-lo font-mono text-[11px]"
                title={item.customizationSummary}
              >
                {item.customizationSummary}
              </p>
            ) : null}
            <p
              className="text-t-lo mt-0.5 font-mono text-[11px]"
              title={item.id}
            >
              ƒ{item.id.slice(0, 8)}
            </p>
          </div>
        </div>
      </td>
      <td className="px-5 py-4 align-top">
        <StatusBadge status={item.status} />
      </td>
      <td className="px-5 py-4 align-top">
        <TimeCell iso={item.startedAt} />
      </td>
      <td className="px-5 py-4 align-top">
        <TimeCell iso={item.endedAt} />
      </td>
      <td className="px-5 py-4 align-top">
        {item.candidateId ? (
          <span className="text-t-hi font-mono text-[12px]" title={item.candidateId}>
            {item.candidateId}
          </span>
        ) : (
          <span className="text-t-lo text-xs">—</span>
        )}
      </td>
      <td className="px-5 py-4 align-top">
        <Rating value={item.candidateRating} />
      </td>
      <td className="px-5 py-4 align-top">
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={!item.downloadable || downloading}
            onClick={onDownload}
            title={
              item.downloadable
                ? "Download session as .zip"
                : "Download not available for this session"
            }
            aria-label="Download session"
            className="text-t-mid hover:text-t-hi"
          >
            {downloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            title="Remove from history"
            aria-label="Remove session from history"
            className="text-[var(--destructive)] hover:bg-[color-mix(in_oklab,var(--destructive)_9%,transparent)]"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Defer revocation so Safari has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function StatusBadge({ status }: { status: SessionStatus }) {
  const tone = STATUS_TONES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-[11px] font-medium capitalize",
        tone,
      )}
    >
      {status}
    </span>
  );
}

const STATUS_TONES: Record<SessionStatus, string> = {
  pending: "bg-chip text-t-mid",
  initializing: "bg-blue-500/15 text-blue-500 dark:text-blue-300",
  running: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  saving: "bg-blue-500/15 text-blue-500 dark:text-blue-300",
  ended: "bg-chip text-t-mid",
  error: "bg-red-500/15 text-red-600 dark:text-red-300",
  recoverable: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
};

function TimeCell({ iso }: { iso: string | Date | null }) {
  if (!iso) return <span className="text-t-lo text-xs">—</span>;
  const date = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return <span className="text-t-lo text-xs">—</span>;
  }
  const exact = date.toLocaleString();
  return (
    <div className="flex flex-col" title={exact}>
      <span className="font-display text-t-hi text-[14px] font-semibold">{relativeTime(date)}</span>
      <span className="text-t-lo font-mono text-[11px]">
        {date.toLocaleDateString()}
      </span>
    </div>
  );
}

function relativeTime(date: Date): string {
  const diffMs = date.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const min = 60_000;
  const hour = 60 * min;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;

  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (abs < min) return rtf.format(Math.round(diffMs / 1000), "second");
  if (abs < hour) return rtf.format(Math.round(diffMs / min), "minute");
  if (abs < day) return rtf.format(Math.round(diffMs / hour), "hour");
  if (abs < week) return rtf.format(Math.round(diffMs / day), "day");
  if (abs < month) return rtf.format(Math.round(diffMs / week), "week");
  if (abs < year) return rtf.format(Math.round(diffMs / month), "month");
  return rtf.format(Math.round(diffMs / year), "year");
}

function Rating({ value }: { value: number | null }) {
  if (value === null) {
    return <span className="text-t-lo text-xs">Not rated</span>;
  }
  return (
    <div
      className="flex items-center gap-1.5"
      role="img"
      aria-label={`Candidate rating ${value} out of 5`}
      title={`${value} / 5`}
    >
      <Star className="h-4 w-4 fill-[var(--star)] text-[var(--star)]" aria-hidden />
      <span className="text-t-hi font-mono text-[12px]">{value}/5</span>
    </div>
  );
}

function HistorySkeleton() {
  return (
    <Card className="overflow-hidden p-0">
      <div className="divide-border/40 divide-y">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-4">
            <Skeleton className="h-8 w-8 rounded-md" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/4" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-8 w-20" />
          </div>
        ))}
      </div>
    </Card>
  );
}

function EmptyState() {
  return (
    <div className="rounded-[18px] border-[1.5px] border-dashed border-bd-2 bg-transparent">
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <span
          className="bg-icon-bg text-t-mid inline-flex h-12 w-12 items-center justify-center rounded-full"
          aria-hidden
        >
          <History className="h-6 w-6" />
        </span>
        <h2 className="font-display text-t-hi text-[19px] font-semibold">No past sessions yet</h2>
        <p className="text-t-mid max-w-md text-sm">
          Completed sandboxes will be archived here.
        </p>
        <Link href="/dashboard" className={cn(buttonVariants(), "mt-2")}>
          Start a new session
        </Link>
      </div>
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <Card className="border-destructive/40">
      <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <span
          className="bg-destructive/10 text-destructive inline-flex h-12 w-12 items-center justify-center rounded-full"
          aria-hidden
        >
          <AlertCircle className="h-6 w-6" />
        </span>
        <h2 className="text-lg font-medium">Couldn&apos;t load past sessions</h2>
        <p className="text-muted-foreground max-w-md text-sm">{message}</p>
        <Button onClick={onRetry} variant="outline" className="mt-2">
          Try again
        </Button>
      </CardContent>
    </Card>
  );
}
