"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search } from "lucide-react";
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

      <p className="text-muted-foreground text-xs">{countLabel}</p>

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
          columns={["Name", "Candidate ID", "Interview types", "Created", ""]}
          rows={candidates.map((c) => ({
            key: c.id,
            cells: [
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
