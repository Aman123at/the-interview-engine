"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";
import type { CandidateDto, InterviewType } from "@/contracts";
import { EmptyState } from "@/components/feature/admin/staff-presentational";

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
    <div className="flex flex-col gap-5">
      <div className="space-y-3">
        <h2 className="font-display text-t-hi text-[18px] font-semibold tracking-[-0.018em]">My candidates</h2>
        <p className="text-t-mid max-w-xl text-[14px] leading-relaxed">
          Server-filtered to candidates tagged with the interview types you&apos;re
          specialized in.
          {myTypes.length > 0 ? " You'll see candidates for:" : ""}
        </p>
        {myTypes.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {myTypes.map((t) => (
              <span
                key={t.id}
                className="inline-flex items-center rounded-full border px-3 py-1 text-[12px] font-medium"
                style={{
                  background: "var(--accent-soft)",
                  borderColor: "var(--accent-border)",
                  color: "var(--accent-text)",
                }}
              >
                {t.label}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-t-lo text-xs italic">
            You don&apos;t have any interview-type specializations yet — ask HR or
            admin to assign some.
          </p>
        )}
      </div>

      <div className="relative w-full max-w-[520px]">
        <Search className="text-t-lo pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
        <Input
          type="search"
          placeholder="Search by name or candidate ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-inp border-bd focus:border-[var(--accent-main)] focus-visible:ring-[var(--accent-main)]/40 pl-10 h-11 rounded-[12px]"
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
        <div className="overflow-hidden rounded-[18px] border border-bd bg-panel">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-panel-2 text-t-lo font-mono text-[11px] uppercase tracking-[0.16em]">
                <tr>
                  <th className="px-5 py-3 text-left font-medium">Name</th>
                  <th className="px-5 py-3 text-left font-medium">Candidate ID</th>
                  <th className="px-5 py-3 text-left font-medium">Interview Types</th>
                  <th className="px-5 py-3 text-right font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bd">
                {candidates.map((c) => (
                  <tr key={c.id} className="hover:bg-panel-2 transition-colors">
                    <td className="px-5 py-3.5">
                      <span className="font-display text-t-hi text-[15px] font-semibold">{c.name}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <code className="bg-chip text-t-hi inline-block rounded-[6px] px-2 py-1 font-mono text-[12px]">
                        {c.externalId}
                      </code>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-wrap gap-1.5">
                        {c.interviewTypes.map((t) => (
                          <span
                            key={t.id}
                            className="bg-chip text-t-mid inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px]"
                          >
                            {t.label}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className="text-t-lo font-mono text-[12px]">{fmtDate(c.createdAt)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
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
