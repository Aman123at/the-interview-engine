"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";
import type { CandidateDto, InterviewType } from "@/contracts";
import { StaffTable, EmptyState } from "@/components/feature/admin/staff-presentational";

const DATE_FMT = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
function fmtDate(d: string | Date): string {
  const dt = d instanceof Date ? d : new Date(d);
  return Number.isNaN(dt.getTime()) ? "—" : DATE_FMT.format(dt);
}

/**
 * Read-only view of the candidates the server says match the interviewer's
 * specializations. The interviewer's own type+level list comes from
 * `/auth/me` → `useAuth().specializations`, so the panel can render the
 * scoping breadcrumb without an extra fetch.
 */
export function InterviewerCandidatesPanel() {
  const { specializations } = useAuth();
  const [search, setSearch] = useState("");
  const [candidates, setCandidates] = useState<CandidateDto[] | null>(null);

  const reqRef = useRef(0);
  const fetchCandidates = useCallback(async (q: string) => {
    const reqId = ++reqRef.current;
    try {
      const res = await api.interviewer.listCandidates(q.trim() || undefined);
      if (reqId !== reqRef.current) return;
      setCandidates(res.candidates);
    } catch (err) {
      if (reqId !== reqRef.current) return;
      const msg =
        err instanceof ApiError ? err.message : "Couldn't load candidates.";
      toast.error(msg);
    }
  }, []);

  useEffect(() => {
    const h = setTimeout(() => void fetchCandidates(search), 250);
    return () => clearTimeout(h);
  }, [search, fetchCandidates]);

  const myTypes = uniqueTypes(specializations);

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-2">
        <h2 className="text-foreground text-sm font-medium">My candidates</h2>
        <p className="text-muted-foreground max-w-xl text-xs leading-relaxed">
          Server-filtered to candidates tagged with the interview types you're
          specialized in.
          {myTypes.length > 0 ? " You'll see candidates for:" : ""}
        </p>
        {myTypes.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {myTypes.map((t) => (
              <span
                key={t.id}
                className="border-border/60 bg-muted/40 text-foreground inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium"
              >
                {t.label}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-xs italic">
            You don't have any interview-type specializations yet — ask HR or
            admin to assign some.
          </p>
        )}
      </div>

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

      {candidates === null ? (
        <Skeleton className="h-40 w-full" />
      ) : candidates.length === 0 ? (
        <EmptyState
          title={search.trim() ? "No matches" : "No candidates yet"}
          hint={
            search.trim()
              ? "Try a different name or candidate ID."
              : "Ask HR to add candidates for your interview types."
          }
        />
      ) : (
        <StaffTable
          columns={["Name", "Candidate ID", "Interview types", "Created"]}
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
              <div key="t" className="flex flex-wrap gap-1">
                {c.interviewTypes.map((t) => (
                  <span
                    key={t.id}
                    className="border-border/60 bg-muted/40 text-foreground inline-flex items-center rounded-full border px-2 py-0.5 text-xs"
                  >
                    {t.label}
                  </span>
                ))}
              </div>,
              <span key="c" className="text-muted-foreground text-xs">
                {fmtDate(c.createdAt)}
              </span>,
            ],
          }))}
        />
      )}
    </div>
  );
}

function uniqueTypes(
  specs: ReturnType<typeof useAuth>["specializations"],
): InterviewType[] {
  if (!specs) return [];
  const seen = new Map<string, InterviewType>();
  for (const s of specs) {
    if (!seen.has(s.interviewType.id)) seen.set(s.interviewType.id, s.interviewType);
  }
  return Array.from(seen.values());
}
