"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiError } from "@/lib/api";
import type { CandidateDto, InterviewType } from "@/contracts";
import { CandidateDialog } from "./candidate-dialog";
import { ConfirmDeleteDialog } from "./confirm-delete-dialog";
import { StaffRowActions } from "./staff-row-actions";
import { EmptyState, StaffTable } from "./staff-presentational";
import { describeStaffError } from "./errors";

const DATE_FMT = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
});

function formatDate(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : DATE_FMT.format(d);
}

export function CandidateSection() {
  const [candidates, setCandidates] = useState<CandidateDto[] | null>(null);
  const [types, setTypes] = useState<InterviewType[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CandidateDto | null>(null);
  const [deleting, setDeleting] = useState<CandidateDto | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Load the interview-type catalogue once; candidates re-fetch when the
  // search box changes (debounced).
  useEffect(() => {
    (async () => {
      try {
        const ty = await api.admin.listInterviewTypes();
        setTypes(ty.types);
      } catch (err) {
        const msg =
          err instanceof ApiError
            ? err.message
            : "Couldn't load interview types.";
        toast.error(msg);
      }
    })();
  }, []);

  const reqRef = useRef(0);
  const fetchCandidates = useCallback(async (q: string) => {
    const reqId = ++reqRef.current;
    try {
      const res = await api.candidates.list(q.trim() || undefined);
      // Drop late responses so a slow search doesn't overwrite the latest.
      if (reqId !== reqRef.current) return;
      setCandidates(res.candidates);
    } catch (err) {
      if (reqId !== reqRef.current) return;
      const msg =
        err instanceof ApiError ? err.message : "Couldn't load candidates.";
      toast.error(msg);
    }
  }, []);

  // Initial + debounced search.
  useEffect(() => {
    const h = setTimeout(() => void fetchCandidates(search), 250);
    return () => clearTimeout(h);
  }, [search, fetchCandidates]);

  const upsert = useCallback((c: CandidateDto) => {
    setCandidates((prev) => {
      if (!prev) return [c];
      const i = prev.findIndex((x) => x.id === c.id);
      if (i === -1) return [c, ...prev];
      const next = prev.slice();
      next[i] = c;
      return next;
    });
  }, []);

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.candidates.delete(deleting.id);
      toast.success(`Removed ${deleting.name}.`);
      setCandidates((prev) => prev?.filter((x) => x.id !== deleting.id) ?? null);
      setDeleting(null);
    } catch (err) {
      toast.error(describeStaffError(err, "Couldn't remove candidate."));
    } finally {
      setBusy(false);
    }
  }

  function toggleOne(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAllVisible(checked: boolean) {
    if (!candidates) return;
    setSelectedIds(checked ? new Set(candidates.map((c) => c.id)) : new Set());
  }

  // Drop ids that fell out of the current list (e.g. after a search) so the
  // bulk count never overstates what's actually selectable.
  useEffect(() => {
    if (!candidates) return;
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(candidates.map((c) => c.id));
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (visible.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [candidates]);

  async function confirmBulkDelete() {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    setBusy(true);
    try {
      const res = await api.candidates.bulkDelete({ ids });
      const deleted = new Set(res.deleted);
      setCandidates((prev) => prev?.filter((x) => !deleted.has(x.id)) ?? null);
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
      const noun = res.deleted.length === 1 ? "candidate" : "candidates";
      toast.success(`Removed ${res.deleted.length} ${noun}.`);
      if (res.notFound.length > 0) {
        toast.message(
          `${res.notFound.length} were already removed elsewhere — list refreshed.`,
        );
      }
    } catch (err) {
      toast.error(describeStaffError(err, "Couldn't remove candidates."));
    } finally {
      setBusy(false);
    }
  }

  const count = candidates?.length ?? 0;
  const countLabel = useMemo(() => {
    if (candidates === null) return "";
    const noun = count === 1 ? "candidate" : "candidates";
    return search.trim() ? `${count} matching ${noun}` : `${count} ${noun}`;
  }, [candidates, count, search]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="text-muted-foreground pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
          <Input
            type="search"
            placeholder="Search by name or candidate ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-7"
            aria-label="Search candidates"
          />
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
          disabled={types.length === 0}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add candidate
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs">{countLabel}</p>
        {selectedIds.size > 0 ? (
          <div className="flex items-center gap-2">
            <p className="text-muted-foreground text-xs">
              {selectedIds.size} selected
            </p>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setBulkDeleteOpen(true)}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              Delete selected
            </Button>
          </div>
        ) : null}
      </div>

      {candidates === null ? (
        <Skeleton className="h-40 w-full" />
      ) : candidates.length === 0 ? (
        <EmptyState
          title={search.trim() ? "No matches" : "No candidates yet"}
          hint={
            search.trim()
              ? "Try a different name or candidate ID."
              : "Click “Add candidate” to create the first one."
          }
        />
      ) : (
        <StaffTable
          columns={[
            <input
              key="sel"
              type="checkbox"
              aria-label="Select all candidates"
              checked={
                candidates.length > 0 &&
                candidates.every((c) => selectedIds.has(c.id))
              }
              ref={(el) => {
                if (!el) return;
                const someSelected = candidates.some((c) =>
                  selectedIds.has(c.id),
                );
                const allSelected = candidates.every((c) =>
                  selectedIds.has(c.id),
                );
                el.indeterminate = someSelected && !allSelected;
              }}
              onChange={(e) => toggleAllVisible(e.target.checked)}
              className="h-3.5 w-3.5"
            />,
            "Name",
            "Candidate ID",
            "Interview types",
            "Created",
            "",
          ]}
          rows={candidates.map((c) => ({
            key: c.id,
            cells: [
              <input
                key="sel"
                type="checkbox"
                aria-label={`Select ${c.name}`}
                checked={selectedIds.has(c.id)}
                onChange={(e) => toggleOne(c.id, e.target.checked)}
                className="h-3.5 w-3.5"
              />,
              <span key="n" className="text-foreground font-medium">
                {c.name}
              </span>,
              <code
                key="x"
                className="bg-muted/40 text-foreground rounded px-1.5 py-0.5 font-mono text-xs"
              >
                {c.externalId}
              </code>,
              <TypeBadges key="t" types={c.interviewTypes} />,
              <span key="c" className="text-muted-foreground text-xs">
                {formatDate(c.createdAt)}
              </span>,
              <StaffRowActions
                key="a"
                onEdit={() => {
                  setEditing(c);
                  setDialogOpen(true);
                }}
                onDelete={() => setDeleting(c)}
              />,
            ],
          }))}
        />
      )}

      <CandidateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        types={types}
        candidate={editing}
        onSaved={upsert}
      />

      <ConfirmDeleteDialog
        open={bulkDeleteOpen}
        onOpenChange={(o) => !o && setBulkDeleteOpen(false)}
        title={`Remove ${selectedIds.size} candidate${selectedIds.size === 1 ? "" : "s"}?`}
        description={
          <>
            Remove{" "}
            <span className="text-foreground font-medium">
              {selectedIds.size}
            </span>{" "}
            candidate{selectedIds.size === 1 ? "" : "s"}. Past sessions
            referencing them stay intact.
          </>
        }
        confirmLabel={`Remove ${selectedIds.size}`}
        busy={busy}
        onConfirm={confirmBulkDelete}
      />

      <ConfirmDeleteDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Remove candidate?"
        description={
          deleting ? (
            <>
              Remove{" "}
              <span className="text-foreground font-medium">
                {deleting.name}
              </span>{" "}
              ({deleting.externalId}). Past sessions referencing this candidate
              stay intact.
            </>
          ) : null
        }
        confirmLabel="Remove candidate"
        busy={busy}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function TypeBadges({ types }: { types: InterviewType[] }) {
  if (types.length === 0) {
    return <span className="text-muted-foreground text-xs italic">None</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {types.map((t) => (
        <span
          key={t.id}
          className="border-border/60 bg-muted/40 text-foreground inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium"
        >
          {t.label}
        </span>
      ))}
    </div>
  );
}
