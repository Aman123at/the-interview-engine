"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui/card";

const RESULTS = [
  { id: 1, title: "Onboarding checklist", subtitle: "Docs · Updated 2d ago", tag: "Docs" },
  { id: 2, title: "Q3 roadmap", subtitle: "Planning · Updated 5d ago", tag: "Plan" },
  { id: 3, title: "Auth migration RFC", subtitle: "RFC · Updated 1w ago", tag: "RFC" },
  { id: 4, title: "Hiring rubric — Backend", subtitle: "People · Updated 3d ago", tag: "Doc" },
  { id: 5, title: "Incident review: cache TTL", subtitle: "Postmortem · 2w ago", tag: "PM" },
  { id: 6, title: "Pricing page redesign", subtitle: "Design · Updated 1d ago", tag: "Design" },
  { id: 7, title: "Postgres index audit", subtitle: "Engineering · 4d ago", tag: "Eng" },
  { id: 8, title: "Customer interviews — June", subtitle: "Research · 6d ago", tag: "UXR" },
  { id: 9, title: "Brand guidelines v2", subtitle: "Brand · 3w ago", tag: "Brand" },
  { id: 10, title: "Mobile release v4.2 notes", subtitle: "Release · 1w ago", tag: "Rel" },
  { id: 11, title: "API rate-limit policy", subtitle: "Platform · Updated today", tag: "Plat" },
  { id: 12, title: "Sales playbook", subtitle: "GTM · Updated 5d ago", tag: "GTM" },
];

const PAGE_SIZE = 4;

export default function SearchPreview() {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [page, setPage] = useState(1);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return RESULTS;
    return RESULTS.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.subtitle.toLowerCase().includes(q),
    );
  }, [query]);

  // Reset to page 1 whenever the filtered set changes.
  useEffect(() => {
    setPage(1);
  }, [query]);

  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const visible = results.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
  }

  const showList = !(query.trim() === "" && !submitted) && results.length > 0;

  return (
    <div className="border-border bg-background flex h-[28rem] flex-col rounded-md border">
      <header className="border-border border-b px-3 py-2">
        <form onSubmit={onSubmit} className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              className="text-muted-foreground absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSubmitted(false);
              }}
              placeholder="Search docs, plans, RFCs…"
              className="pl-8"
              aria-label="Search"
            />
          </div>
          <Button type="submit">Search</Button>
        </form>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-2 p-3">
          {query.trim() === "" && !submitted ? (
            <p className="text-muted-foreground text-sm">
              Try searching for a doc, plan, or RFC.
            </p>
          ) : results.length === 0 ? (
            <div className="border-border rounded-lg border border-dashed p-8 text-center">
              <p className="text-sm font-medium">No results</p>
              <p className="text-muted-foreground mt-1 text-xs">
                Nothing matches “{query}”. Try a different term.
              </p>
            </div>
          ) : (
            visible.map((r) => (
              <Card key={r.id}>
                <CardContent className="flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="truncate text-sm">{r.title}</CardTitle>
                    <CardDescription className="truncate text-xs">
                      {r.subtitle}
                    </CardDescription>
                  </div>
                  <span className="border-border bg-muted rounded-md border px-2 py-0.5 text-[10px]">
                    {r.tag}
                  </span>
                  <Button size="sm" variant="outline" className="h-7 text-xs">
                    Open
                  </Button>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
      {showList ? (
        <div className="border-border flex items-center justify-between border-t px-3 py-2 text-xs">
          <span className="text-muted-foreground">
            Page {page} of {totalPages} · {results.length} result
            {results.length === 1 ? "" : "s"}
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="outline"
              className="h-7 w-7"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="outline"
              className="h-7 w-7"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              aria-label="Next page"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
