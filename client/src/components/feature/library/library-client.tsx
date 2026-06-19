"use client";

import { Suspense, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import { groupByCategory, loadLibraryPages } from "@/lib/library/registry";
import type { LibraryPage } from "@/lib/library/types";
import { CodePanel } from "./code-panel";

export function LibraryClient() {
  const [pages, setPages] = useState<LibraryPage[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loaded = await loadLibraryPages();
      if (cancelled) return;
      setPages(loaded);
      setActiveId(loaded[0]?.id ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!pages) {
    return (
      <div className="text-muted-foreground flex flex-1 items-center justify-center gap-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading prebuilt pages…
      </div>
    );
  }

  const groups = groupByCategory(pages);
  const active = pages.find((p) => p.id === activeId) ?? pages[0]!;

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-border bg-background/80 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-30 flex items-center justify-between border-b px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span
            className="bg-primary/10 text-primary inline-flex h-6 w-6 items-center justify-center rounded-md font-mono text-[10px] font-semibold"
            aria-hidden
          >
            CL
          </span>
          <span>Component Library</span>
          <span className="text-muted-foreground hidden text-xs sm:inline">
            · public · paste-ready
          </span>
        </div>
        <ThemeToggle />
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="border-border w-56 shrink-0 overflow-y-auto border-r p-4">
          <nav className="flex flex-col gap-4">
            {groups.map((g) => (
              <div key={g.category}>
                <p className="text-muted-foreground mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider">
                  {g.category}
                </p>
                <ul className="flex flex-col gap-0.5">
                  {g.pages.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => setActiveId(p.id)}
                        className={cn(
                          "w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                          p.id === active.id
                            ? "bg-accent text-accent-foreground font-medium"
                            : "text-foreground hover:bg-accent/60",
                        )}
                      >
                        {p.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col gap-4 p-6">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{active.title}</h1>
            <p className="text-muted-foreground text-sm">{active.description}</p>
          </div>

          <section className="border-border bg-card overflow-hidden rounded-lg border">
            <div className="border-border bg-muted/40 text-muted-foreground border-b px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider">
              Live preview
            </div>
            <div className="bg-background min-h-[12rem] p-4">
              <Suspense
                fallback={
                  <div className="text-muted-foreground flex items-center justify-center gap-2 py-12 text-xs">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Loading preview…
                  </div>
                }
              >
                <active.Preview />
              </Suspense>
            </div>
          </section>

          <CodePanel page={active} />
        </main>
      </div>
    </div>
  );
}
