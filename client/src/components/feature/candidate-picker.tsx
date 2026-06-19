"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { CandidateDto } from "@/contracts";

interface Props {
  /** Currently selected candidate; null = no selection. */
  value: CandidateDto | null;
  onChange: (next: CandidateDto | null) => void;
  /** Disable the whole control. */
  disabled?: boolean;
  /** Used only for aria-labels. */
  ariaLabel?: string;
}

/**
 * Searchable picker over `GET /interviewer/candidates` — the server already
 * scopes the list to the caller's specialization types, so single-type
 * interviewers see only matching candidates. Optional: parent decides whether
 * a selection is required (none of the flows currently require it).
 */
export function CandidatePicker({
  value,
  onChange,
  disabled,
  ariaLabel = "Candidate",
}: Props) {
  const [search, setSearch] = useState("");
  const [candidates, setCandidates] = useState<CandidateDto[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reqRef = useRef(0);
  const fetchCandidates = useCallback(async (q: string) => {
    const reqId = ++reqRef.current;
    setLoading(true);
    try {
      const res = await api.interviewer.listCandidates(q.trim() || undefined);
      if (reqId !== reqRef.current) return;
      setCandidates(res.candidates);
      setError(null);
    } catch (err) {
      if (reqId !== reqRef.current) return;
      setError(
        err instanceof ApiError
          ? err.body?.message || err.message
          : "Couldn't load candidates.",
      );
    } finally {
      if (reqId === reqRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = setTimeout(() => void fetchCandidates(search), 250);
    return () => clearTimeout(h);
  }, [search, fetchCandidates]);

  // If the parent set a value we don't have in the latest list, surface it
  // anyway so the chip still reads correctly.
  const items = candidates ?? [];

  return (
    <div className="border-border/60 flex flex-col gap-2 rounded-md border p-2.5">
      {value ? (
        <div className="bg-primary/5 border-primary/30 flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5">
          <div className="flex min-w-0 flex-col">
            <span className="text-foreground truncate text-sm font-medium">
              {value.name}
            </span>
            <span className="text-muted-foreground truncate text-xs">
              {value.externalId}
              {value.interviewTypes.length > 0 ? (
                <>
                  {" · "}
                  {value.interviewTypes.map((t) => t.label).join(", ")}
                </>
              ) : null}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            disabled={disabled}
            aria-label="Clear selection"
            className="text-muted-foreground hover:text-foreground inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
        <Input
          type="search"
          placeholder="Search by name or candidate ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          disabled={disabled}
          className="pl-7"
          aria-label={`Search ${ariaLabel.toLowerCase()}`}
        />
      </div>

      <div
        role="listbox"
        aria-label={`${ariaLabel} results`}
        className="border-border/60 max-h-44 overflow-y-auto rounded-md border"
      >
        {error ? (
          <p className="text-destructive px-3 py-2 text-xs">{error}</p>
        ) : candidates === null || loading ? (
          <p className="text-muted-foreground flex items-center gap-2 px-3 py-2 text-xs">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading…
          </p>
        ) : items.length === 0 ? (
          <p className="text-muted-foreground px-3 py-2 text-xs italic">
            {search.trim()
              ? "No matches for your search."
              : "No candidates available for your interview types."}
          </p>
        ) : (
          <ul className="divide-border/60 divide-y">
            {items.map((c) => {
              const selected = c.id === value?.id;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => onChange(selected ? null : c)}
                    disabled={disabled}
                    className={cn(
                      "hover:bg-muted/40 flex w-full items-start gap-2 px-2.5 py-1.5 text-left text-sm disabled:opacity-50",
                      selected && "bg-primary/5",
                    )}
                  >
                    <Check
                      className={cn(
                        "mt-0.5 h-3.5 w-3.5 shrink-0",
                        selected ? "text-primary" : "text-transparent",
                      )}
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-foreground truncate font-medium">
                        {c.name}
                      </span>
                      <span className="text-muted-foreground truncate text-xs">
                        {c.externalId}
                        {c.interviewTypes.length > 0 ? (
                          <>
                            {" · "}
                            {c.interviewTypes.map((t) => t.label).join(", ")}
                          </>
                        ) : null}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
