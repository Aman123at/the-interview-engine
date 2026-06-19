"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Loader2, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import type {
  HrSessionRow,
  HrSessionsQuery,
  SessionStatus,
} from "@/contracts";
import { EmptyState, StaffTable } from "./staff-presentational";

const PAGE_LIMIT = 50;

const DATETIME_FMT = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});
function fmtDateTime(value: string | Date | null): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : DATETIME_FMT.format(d);
}

/** "2026-06-14" form for <input type="date">. */
function toDateInput(d: Date | null): string {
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function parseDateInput(s: string, endOfDay: boolean): Date | null {
  if (!s) return null;
  // Local-midnight (or 23:59:59) avoids surprising TZ shifts from `new Date(s)`
  // which parses 'YYYY-MM-DD' as UTC and pulls the local day backward.
  const [y, m, d] = s.split("-").map((n) => Number(n));
  if (!y || !m || !d) return null;
  return endOfDay
    ? new Date(y, m - 1, d, 23, 59, 59, 999)
    : new Date(y, m - 1, d, 0, 0, 0, 0);
}

interface FilterState {
  interviewerSearch: string;
  candidateSearch: string;
  dateFrom: string;
  dateTo: string;
}

const EMPTY_FILTERS: FilterState = {
  interviewerSearch: "",
  candidateSearch: "",
  dateFrom: "",
  dateTo: "",
};

function filtersToQuery(f: FilterState): HrSessionsQuery {
  const out: HrSessionsQuery = { limit: PAGE_LIMIT };
  if (f.interviewerSearch.trim()) out.interviewerSearch = f.interviewerSearch.trim();
  if (f.candidateSearch.trim()) out.candidateSearch = f.candidateSearch.trim();
  const from = parseDateInput(f.dateFrom, false);
  const to = parseDateInput(f.dateTo, true);
  if (from) out.dateFrom = from;
  if (to) out.dateTo = to;
  return out;
}

export function HrReportsSection() {
  // The form state is what the user is editing right now; `applied` is what
  // the latest GET /hr/sessions actually ran with. The export button uses
  // `applied`, not the in-flight edits, so the .xlsx matches the visible rows.
  const [form, setForm] = useState<FilterState>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<FilterState>(EMPTY_FILTERS);

  const [rows, setRows] = useState<HrSessionRow[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exporting, setExporting] = useState(false);

  const reqRef = useRef(0);
  const fetchPage = useCallback(
    async (filters: FilterState, cursor?: string) => {
      const reqId = ++reqRef.current;
      const append = !!cursor;
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const res = await api.hr.listSessions({
          ...filtersToQuery(filters),
          ...(cursor ? { cursor } : {}),
        });
        if (reqId !== reqRef.current) return;
        setRows((prev) =>
          append && prev ? [...prev, ...res.items] : res.items,
        );
        setNextCursor(res.nextCursor);
      } catch (err) {
        if (reqId !== reqRef.current) return;
        const msg =
          err instanceof ApiError ? err.message : "Couldn't load sessions.";
        toast.error(msg);
      } finally {
        if (reqId !== reqRef.current) return;
        if (append) setLoadingMore(false);
        else setLoading(false);
      }
    },
    [],
  );

  // Initial load — empty filters.
  useEffect(() => {
    void fetchPage(EMPTY_FILTERS);
  }, [fetchPage]);

  function onApply(e: React.FormEvent) {
    e.preventDefault();
    setApplied(form);
    setRows(null);
    setNextCursor(null);
    void fetchPage(form);
  }

  function onReset() {
    setForm(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setRows(null);
    setNextCursor(null);
    void fetchPage(EMPTY_FILTERS);
  }

  function onLoadMore() {
    if (!nextCursor) return;
    void fetchPage(applied, nextCursor);
  }

  // The server REQUIRES both date bounds on the export endpoint. Disable the
  // button until the applied filters carry both — `form` may be ahead of
  // `applied` and the user must hit Apply first so the export matches the
  // rows on screen.
  const exportReady = !!(applied.dateFrom && applied.dateTo);

  async function onExport() {
    if (!exportReady || exporting) return;
    const from = parseDateInput(applied.dateFrom, false);
    const to = parseDateInput(applied.dateTo, true);
    if (!from || !to) {
      toast.error("Pick a valid date range first.");
      return;
    }
    if (from > to) {
      toast.error("Start date must be before end date.");
      return;
    }
    setExporting(true);
    try {
      const { blob, filename } = await api.hr.exportSessionsXlsx({
        interviewerSearch: applied.interviewerSearch.trim() || undefined,
        candidateSearch: applied.candidateSearch.trim() || undefined,
        dateFrom: from,
        dateTo: to,
      });
      saveBlob(blob, filename);
      toast.success(`Downloaded ${filename}`);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.body?.message || err.message
          : "Couldn't export the report.";
      toast.error(msg);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <form
        onSubmit={onApply}
        className="border-border/60 grid gap-3 rounded-md border p-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <div className="grid gap-1.5">
          <Label htmlFor="rep-iv">Interviewer (name or email)</Label>
          <Input
            id="rep-iv"
            type="search"
            autoComplete="off"
            placeholder="alice or alice@…"
            value={form.interviewerSearch}
            onChange={(e) =>
              setForm((f) => ({ ...f, interviewerSearch: e.target.value }))
            }
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="rep-cand">Candidate (ID or name)</Label>
          <Input
            id="rep-cand"
            type="search"
            autoComplete="off"
            placeholder="C-1234 or Jamie"
            value={form.candidateSearch}
            onChange={(e) =>
              setForm((f) => ({ ...f, candidateSearch: e.target.value }))
            }
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="rep-from">Date from</Label>
          <Input
            id="rep-from"
            type="date"
            value={form.dateFrom}
            onChange={(e) =>
              setForm((f) => ({ ...f, dateFrom: e.target.value }))
            }
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="rep-to">Date to</Label>
          <Input
            id="rep-to"
            type="date"
            value={form.dateTo}
            onChange={(e) => setForm((f) => ({ ...f, dateTo: e.target.value }))}
            min={form.dateFrom || undefined}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-4">
          <Button type="submit" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                Loading…
              </>
            ) : (
              "Apply"
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={onReset}
            disabled={loading}
          >
            Reset
          </Button>
          <div className="grow" />
          <Button
            type="button"
            variant="outline"
            onClick={onExport}
            disabled={!exportReady || exporting || loading}
            title={
              exportReady
                ? "Download the current results as .xlsx"
                : "Pick both From and To, then Apply, to enable export."
            }
          >
            {exporting ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Download className="mr-1 h-3.5 w-3.5" />
                Export to Excel
              </>
            )}
          </Button>
        </div>
      </form>

      {rows === null ? (
        <Skeleton className="h-40 w-full" />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No matching sessions"
          hint="Try widening the date range or clearing filters."
        />
      ) : (
        <>
          <p className="text-muted-foreground text-xs">
            {rows.length} session{rows.length === 1 ? "" : "s"}
            {nextCursor ? " · more available" : ""}
          </p>
          <StaffTable
            columns={[
              "Interviewer",
              "Candidate",
              "Type",
              "Framework",
              "Status",
              "Started",
              "Ended",
              "Rating",
            ]}
            rows={rows.map((r) => ({
              key: r.id,
              cells: [
                <InterviewerCell key="iv" row={r} />,
                <CandidateCell key="ca" row={r} />,
                <TypesCell key="ty" row={r} />,
                <span key="fw" className="text-foreground text-sm">
                  {r.framework}
                </span>,
                <StatusBadge key="st" status={r.status} />,
                <span key="sa" className="text-muted-foreground text-xs">
                  {fmtDateTime(r.startedAt)}
                </span>,
                <span key="ea" className="text-muted-foreground text-xs">
                  {fmtDateTime(r.endedAt)}
                </span>,
                <RatingCell key="ra" rating={r.candidateRating} />,
              ],
            }))}
          />
          {nextCursor ? (
            <div className="flex justify-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onLoadMore}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Loading…
                  </>
                ) : (
                  "Load more"
                )}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

// ---------------- Cells ----------------

function InterviewerCell({ row }: { row: HrSessionRow }) {
  if (!row.interviewer) {
    return <span className="text-muted-foreground text-xs italic">unknown</span>;
  }
  return (
    <div className="flex flex-col">
      <span className="text-foreground text-sm font-medium">
        {row.interviewer.displayName}
      </span>
      <span className="text-muted-foreground text-xs">
        {row.interviewer.email}
      </span>
    </div>
  );
}

function CandidateCell({ row }: { row: HrSessionRow }) {
  if (!row.candidate) {
    return <span className="text-muted-foreground text-xs italic">—</span>;
  }
  return (
    <div className="flex flex-col">
      <span className="text-foreground text-sm font-medium">
        {row.candidate.name}
      </span>
      <code className="bg-muted/40 text-muted-foreground mt-0.5 inline-block w-fit rounded px-1.5 py-0.5 font-mono text-xs">
        {row.candidate.externalId}
      </code>
    </div>
  );
}

function TypesCell({ row }: { row: HrSessionRow }) {
  if (row.candidateInterviewTypes.length === 0) {
    return <span className="text-muted-foreground text-xs italic">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {row.candidateInterviewTypes.map((t) => (
        <span
          key={t.key}
          className="border-border/60 bg-muted/40 text-foreground inline-flex items-center rounded-full border px-2 py-0.5 text-xs"
        >
          {t.label}
        </span>
      ))}
    </div>
  );
}

const STATUS_STYLES: Record<SessionStatus, string> = {
  pending: "bg-muted text-muted-foreground",
  initializing: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  running: "bg-primary/10 text-primary",
  saving: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  recoverable: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  ended: "bg-muted text-foreground",
  error: "bg-destructive/10 text-destructive",
};

function StatusBadge({ status }: { status: SessionStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        STATUS_STYLES[status] ?? "bg-muted text-muted-foreground",
      )}
    >
      {status}
    </span>
  );
}

function RatingCell({ rating }: { rating: number | null }) {
  if (rating === null) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
      <span className="text-foreground font-medium">{rating}</span>
    </span>
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
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
