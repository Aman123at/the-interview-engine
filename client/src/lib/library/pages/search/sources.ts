import type { ReactVariantSources } from "../../types";

const DUMMY_DATA = `const RESULTS = [
  { id: 1,  title: "Onboarding checklist",       subtitle: "Docs · Updated 2d ago",     tag: "Docs" },
  { id: 2,  title: "Q3 roadmap",                 subtitle: "Planning · Updated 5d ago", tag: "Plan" },
  { id: 3,  title: "Auth migration RFC",         subtitle: "RFC · Updated 1w ago",      tag: "RFC"  },
  { id: 4,  title: "Hiring rubric — Backend",    subtitle: "People · Updated 3d ago",   tag: "Doc"  },
  { id: 5,  title: "Incident review: cache TTL", subtitle: "Postmortem · 2w ago",       tag: "PM"   },
  { id: 6,  title: "Pricing page redesign",      subtitle: "Design · Updated 1d ago",   tag: "Design" },
  { id: 7,  title: "Postgres index audit",       subtitle: "Engineering · 4d ago",      tag: "Eng"  },
  { id: 8,  title: "Customer interviews — June", subtitle: "Research · 6d ago",         tag: "UXR"  },
  { id: 9,  title: "Brand guidelines v2",        subtitle: "Brand · 3w ago",            tag: "Brand"},
  { id: 10, title: "Mobile release v4.2 notes",  subtitle: "Release · 1w ago",          tag: "Rel"  },
  { id: 11, title: "API rate-limit policy",      subtitle: "Platform · Updated today",  tag: "Plat" },
  { id: 12, title: "Sales playbook",             subtitle: "GTM · Updated 5d ago",      tag: "GTM"  },
];
const PAGE_SIZE = 5;`;

export const sources: ReactVariantSources = {
  "shadcn-tailwind": {
    notes:
      "Install shadcn primitives:\n  npx shadcn@latest add input button card scroll-area\nPlace under src/SearchPage.tsx in your React app.",
    files: [
      {
        filename: "SearchPage.tsx",
        language: "tsx",
        code: `import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

${DUMMY_DATA}

export default function SearchPage() {
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
  useEffect(() => { setPage(1); }, [query]);

  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const visible = results.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const showList = !(query.trim() === "" && !submitted) && results.length > 0;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    console.log("search submit:", query);
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="border-b bg-background/80 px-4 py-3 backdrop-blur">
        <form onSubmit={onSubmit} className="mx-auto flex max-w-2xl items-center gap-2">
          <div className="relative flex-1">
            <Search
              className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
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

      <main className="min-h-0 flex-1">
        <ScrollArea className="h-full">
          <div className="mx-auto flex max-w-2xl flex-col gap-2 p-4">
            {query.trim() === "" && !submitted ? (
              <p className="text-sm text-muted-foreground">
                Try searching for a doc, plan, or RFC.
              </p>
            ) : results.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center">
                <p className="text-sm font-medium">No results</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Nothing matches “{query}”. Try a different term.
                </p>
              </div>
            ) : (
              visible.map((r) => (
                <Card key={r.id}>
                  <CardContent className="flex items-center gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-base">{r.title}</CardTitle>
                      <CardDescription>{r.subtitle}</CardDescription>
                    </div>
                    <span className="rounded-md border bg-muted px-2 py-0.5 text-xs">
                      {r.tag}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => console.log("open:", r.id)}
                    >
                      Open
                    </Button>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </ScrollArea>
      </main>

      {showList ? (
        <footer className="border-t bg-background/80 px-4 py-2 backdrop-blur">
          <div className="mx-auto flex max-w-2xl items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Page {page} of {totalPages} · {results.length} result{results.length === 1 ? "" : "s"}
            </span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Prev
              </Button>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                Next
              </Button>
            </div>
          </div>
        </footer>
      ) : null}
    </div>
  );
}
`,
      },
    ],
  },

  "plain-tailwind": {
    notes:
      "No shadcn — native <input>/<button>/<div> + Tailwind utilities. Place under src/SearchPage.jsx.",
    files: [
      {
        filename: "SearchPage.jsx",
        language: "jsx",
        code: `import { useEffect, useMemo, useState } from "react";

${DUMMY_DATA}

export default function SearchPage() {
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

  useEffect(() => { setPage(1); }, [query]);

  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const visible = results.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const showList = !(query.trim() === "" && !submitted) && results.length > 0;

  function onSubmit(e) {
    e.preventDefault();
    setSubmitted(true);
    console.log("search submit:", query);
  }

  return (
    <div className="flex h-screen flex-col bg-white text-gray-900">
      <header className="border-b border-gray-200 bg-white/80 px-4 py-3 backdrop-blur">
        <form onSubmit={onSubmit} className="mx-auto flex max-w-2xl items-center gap-2">
          <div className="relative flex-1">
            <span
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
              aria-hidden
            >
              ⌕
            </span>
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSubmitted(false);
              }}
              placeholder="Search docs, plans, RFCs…"
              className="w-full rounded-md border border-gray-300 bg-white py-2 pl-8 pr-3 text-sm outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
              aria-label="Search"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Search
          </button>
        </form>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-2xl flex-col gap-2 p-4">
          {query.trim() === "" && !submitted ? (
            <p className="text-sm text-gray-500">
              Try searching for a doc, plan, or RFC.
            </p>
          ) : results.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
              <p className="text-sm font-medium">No results</p>
              <p className="mt-1 text-xs text-gray-500">
                Nothing matches “{query}”. Try a different term.
              </p>
            </div>
          ) : (
            visible.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-medium">{r.title}</p>
                  <p className="truncate text-sm text-gray-500">{r.subtitle}</p>
                </div>
                <span className="rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs">
                  {r.tag}
                </span>
                <button
                  className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-gray-50"
                  onClick={() => console.log("open:", r.id)}
                >
                  Open
                </button>
              </div>
            ))
          )}
        </div>
      </main>

      {showList ? (
        <footer className="border-t border-gray-200 bg-white/80 px-4 py-2 backdrop-blur">
          <div className="mx-auto flex max-w-2xl items-center justify-between text-sm">
            <span className="text-gray-500">
              Page {page} of {totalPages} · {results.length} result{results.length === 1 ? "" : "s"}
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
              >
                Prev
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </footer>
      ) : null}
    </div>
  );
}
`,
      },
    ],
  },

  "plain-css": {
    notes:
      "Two files. Place SearchPage.jsx and SearchPage.css side-by-side; the component imports its stylesheet.",
    files: [
      {
        filename: "SearchPage.jsx",
        language: "jsx",
        code: `import { useEffect, useMemo, useState } from "react";
import "./SearchPage.css";

${DUMMY_DATA}

export default function SearchPage() {
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

  useEffect(() => { setPage(1); }, [query]);

  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const visible = results.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const showList = !(query.trim() === "" && !submitted) && results.length > 0;

  function onSubmit(e) {
    e.preventDefault();
    setSubmitted(true);
    console.log("search submit:", query);
  }

  return (
    <div className="sp">
      <header className="sp__header">
        <form onSubmit={onSubmit} className="sp__form">
          <div className="sp__inputWrap">
            <span className="sp__icon" aria-hidden>⌕</span>
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSubmitted(false);
              }}
              placeholder="Search docs, plans, RFCs…"
              className="sp__input"
              aria-label="Search"
            />
          </div>
          <button type="submit" className="sp__submit">Search</button>
        </form>
      </header>

      <main className="sp__main">
        <div className="sp__list">
          {query.trim() === "" && !submitted ? (
            <p className="sp__hint">Try searching for a doc, plan, or RFC.</p>
          ) : results.length === 0 ? (
            <div className="sp__empty">
              <p className="sp__emptyTitle">No results</p>
              <p className="sp__emptySub">
                Nothing matches “{query}”. Try a different term.
              </p>
            </div>
          ) : (
            visible.map((r) => (
              <div key={r.id} className="sp__row">
                <div className="sp__rowMain">
                  <p className="sp__title">{r.title}</p>
                  <p className="sp__sub">{r.subtitle}</p>
                </div>
                <span className="sp__tag">{r.tag}</span>
                <button
                  className="sp__action"
                  onClick={() => console.log("open:", r.id)}
                >
                  Open
                </button>
              </div>
            ))
          )}
        </div>
      </main>

      {showList ? (
        <footer className="sp__footer">
          <span className="sp__pageInfo">
            Page {page} of {totalPages} · {results.length} result{results.length === 1 ? "" : "s"}
          </span>
          <div className="sp__pager">
            <button
              className="sp__pageBtn"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </button>
            <button
              className="sp__pageBtn"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        </footer>
      ) : null}
    </div>
  );
}
`,
      },
      {
        filename: "SearchPage.css",
        language: "css",
        code: `.sp {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #ffffff;
  color: #111827;
}
.sp__header {
  border-bottom: 1px solid #e5e7eb;
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(8px);
  padding: 0.75rem 1rem;
}
.sp__form {
  margin: 0 auto;
  max-width: 42rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.sp__inputWrap { position: relative; flex: 1; }
.sp__icon {
  position: absolute;
  left: 0.625rem;
  top: 50%;
  transform: translateY(-50%);
  color: #9ca3af;
  pointer-events: none;
}
.sp__input {
  width: 100%;
  padding: 0.5rem 0.75rem 0.5rem 2rem;
  font-size: 0.875rem;
  background: #ffffff;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  outline: none;
}
.sp__input:focus { border-color: #6b7280; box-shadow: 0 0 0 2px #e5e7eb; }
.sp__submit {
  background: #111827;
  color: #ffffff;
  border: 0;
  border-radius: 0.375rem;
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
}
.sp__submit:hover { background: #1f2937; }
.sp__main { min-height: 0; flex: 1; overflow-y: auto; }
.sp__list {
  margin: 0 auto;
  max-width: 42rem;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.sp__hint { font-size: 0.875rem; color: #6b7280; }
.sp__empty {
  border: 1px dashed #d1d5db;
  border-radius: 0.5rem;
  padding: 2rem;
  text-align: center;
}
.sp__emptyTitle { font-size: 0.875rem; font-weight: 500; margin: 0; }
.sp__emptySub  { font-size: 0.75rem; color: #6b7280; margin: 0.25rem 0 0; }
.sp__row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  border: 1px solid #e5e7eb;
  background: #ffffff;
  border-radius: 0.5rem;
  padding: 1rem;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
}
.sp__rowMain { min-width: 0; flex: 1; }
.sp__title {
  font-size: 1rem;
  font-weight: 500;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sp__sub {
  font-size: 0.875rem;
  color: #6b7280;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sp__tag {
  border: 1px solid #e5e7eb;
  background: #f9fafb;
  border-radius: 0.375rem;
  padding: 0.125rem 0.5rem;
  font-size: 0.75rem;
}
.sp__action {
  border: 1px solid #d1d5db;
  background: #ffffff;
  border-radius: 0.375rem;
  padding: 0.25rem 0.625rem;
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
}
.sp__action:hover { background: #f9fafb; }
.sp__footer {
  border-top: 1px solid #e5e7eb;
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(8px);
  padding: 0.5rem 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  max-width: 42rem;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
  font-size: 0.875rem;
}
.sp__pageInfo { color: #6b7280; }
.sp__pager { display: flex; align-items: center; gap: 0.5rem; }
.sp__pageBtn {
  border: 1px solid #d1d5db;
  background: #ffffff;
  border-radius: 0.375rem;
  padding: 0.25rem 0.625rem;
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
}
.sp__pageBtn:hover:not(:disabled) { background: #f9fafb; }
.sp__pageBtn:disabled { opacity: 0.5; cursor: not-allowed; }
`,
      },
    ],
  },

  "shadcn-css": {
    notes:
      "Unusual combo: shadcn primitives for controls, layout/spacing via a colocated CSS file (NO Tailwind utilities).\nInstall: npx shadcn@latest add input button card scroll-area\nPlace SearchPage.tsx and SearchPage.css together.",
    files: [
      {
        filename: "SearchPage.tsx",
        language: "tsx",
        code: `import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import "./SearchPage.css";

${DUMMY_DATA}

export default function SearchPage() {
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

  useEffect(() => { setPage(1); }, [query]);

  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const visible = results.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const showList = !(query.trim() === "" && !submitted) && results.length > 0;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    console.log("search submit:", query);
  }

  return (
    <div className="sp">
      <header className="sp__header">
        <form onSubmit={onSubmit} className="sp__form">
          <div className="sp__inputWrap">
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSubmitted(false);
              }}
              placeholder="Search docs, plans, RFCs…"
              aria-label="Search"
            />
          </div>
          <Button type="submit">Search</Button>
        </form>
      </header>

      <main className="sp__main">
        <ScrollArea className="sp__scroll">
          <div className="sp__list">
            {query.trim() === "" && !submitted ? (
              <p className="sp__hint">Try searching for a doc, plan, or RFC.</p>
            ) : results.length === 0 ? (
              <div className="sp__empty">
                <p className="sp__emptyTitle">No results</p>
                <p className="sp__emptySub">
                  Nothing matches “{query}”. Try a different term.
                </p>
              </div>
            ) : (
              visible.map((r) => (
                <Card key={r.id} className="sp__row">
                  <CardContent className="sp__rowContent">
                    <div className="sp__rowMain">
                      <CardTitle>{r.title}</CardTitle>
                      <CardDescription>{r.subtitle}</CardDescription>
                    </div>
                    <span className="sp__tag">{r.tag}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => console.log("open:", r.id)}
                    >
                      Open
                    </Button>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </ScrollArea>
      </main>

      {showList ? (
        <footer className="sp__footer">
          <span className="sp__pageInfo">
            Page {page} of {totalPages} · {results.length} result{results.length === 1 ? "" : "s"}
          </span>
          <div className="sp__pager">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Prev
            </Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
              Next
            </Button>
          </div>
        </footer>
      ) : null}
    </div>
  );
}
`,
      },
      {
        filename: "SearchPage.css",
        language: "css",
        code: `.sp {
  display: flex;
  flex-direction: column;
  height: 100vh;
}
.sp__header {
  border-bottom: 1px solid hsl(var(--border));
  padding: 0.75rem 1rem;
}
.sp__form {
  margin: 0 auto;
  max-width: 42rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.sp__inputWrap { flex: 1; }
.sp__main { min-height: 0; flex: 1; }
.sp__scroll { height: 100%; }
.sp__list {
  margin: 0 auto;
  max-width: 42rem;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.sp__hint {
  font-size: 0.875rem;
  color: hsl(var(--muted-foreground));
}
.sp__empty {
  border: 1px dashed hsl(var(--border));
  border-radius: 0.5rem;
  padding: 2rem;
  text-align: center;
}
.sp__emptyTitle { font-size: 0.875rem; font-weight: 500; margin: 0; }
.sp__emptySub {
  font-size: 0.75rem;
  color: hsl(var(--muted-foreground));
  margin: 0.25rem 0 0;
}
.sp__row { padding: 0; }
.sp__rowContent {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem;
}
.sp__rowMain { min-width: 0; flex: 1; }
.sp__tag {
  border: 1px solid hsl(var(--border));
  background: hsl(var(--muted));
  border-radius: 0.375rem;
  padding: 0.125rem 0.5rem;
  font-size: 0.75rem;
}
.sp__footer {
  border-top: 1px solid hsl(var(--border));
  padding: 0.5rem 1rem;
  max-width: 42rem;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.875rem;
}
.sp__pageInfo { color: hsl(var(--muted-foreground)); }
.sp__pager { display: flex; align-items: center; gap: 0.5rem; }
`,
      },
    ],
  },
};
