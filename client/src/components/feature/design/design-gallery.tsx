"use client";

import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { Loader2, Plus, Trash2, AlertTriangle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { TiltCard } from "@/components/feature/tilt-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { DesignDocKind, DesignDocumentDTO } from "@/contracts";

interface DesignGalleryProps {
  kind: DesignDocKind;
  /** Open the per-kind "New design" dialog. */
  onCreate: () => void;
  /**
   * Bumped by callers (e.g. after closing the create dialog) to re-fetch the
   * list. Cheap — the server caps page size.
   */
  refreshKey?: number;
}

/**
 * Lists the user's saved design documents of a given kind (db_design or
 * system_design). The "+ New" tile leads with a `<TiltCard>` matching the
 * framework grid; subsequent cards are existing docs with thumbnail + title
 * + updated-at + a Delete affordance.
 *
 * Loads via `GET /design-docs?kind=`. Click → routes to the right canvas
 * editor. Delete → DELETE /design-docs/:id with a confirm.
 */
export function DesignGallery({
  kind,
  onCreate,
  refreshKey = 0,
}: DesignGalleryProps) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [docs, setDocs] = useState<DesignDocumentDTO[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.designDocs.list(kind);
      setDocs(res.documents);
    } catch (e) {
      setDocs(null);
      setError(
        e instanceof ApiError ? e.body?.message ?? e.message : "Couldn't load.",
      );
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    // Fetch-on-mount + on refresh-key bump (after create dialog closes).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload, refreshKey]);

  async function onDelete(doc: DesignDocumentDTO) {
    if (deleting) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `Delete "${doc.title}"? This can't be undone.`,
      )
    ) {
      return;
    }
    setDeleting(doc.id);
    try {
      await api.designDocs.delete(doc.id);
      toast.success("Design deleted");
      await reload();
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.body?.message ?? e.message : "Delete failed.";
      toast.error("Couldn't delete", { description: msg });
    } finally {
      setDeleting(null);
    }
  }

  function open(doc: DesignDocumentDTO) {
    const segment = doc.kind === "db_design" ? "db" : "system";
    router.push(`/design/${segment}/${doc.id}`);
  }

  if (loading && !docs) {
    return (
      <ul
        role="list"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <li>
          <NewDesignTile onClick={onCreate} kind={kind} />
        </li>
        {Array.from({ length: 3 }).map((_, i) => (
          <li
            key={i}
            className="border-border/60 bg-card/40 flex h-44 flex-col gap-3 rounded-lg border p-4"
          >
            <Skeleton className="h-24 w-full rounded-md" />
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-20" />
          </li>
        ))}
      </ul>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="border-destructive/30 bg-destructive/5 flex flex-col items-start gap-3 rounded-lg border p-6"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="text-destructive h-4 w-4" aria-hidden />
          <p className="text-foreground text-sm font-medium">
            Couldn&apos;t load designs
          </p>
        </div>
        <p className="text-muted-foreground text-xs">{error}</p>
        <Button size="sm" variant="outline" onClick={() => void reload()}>
          Try again
        </Button>
      </div>
    );
  }

  const items = docs ?? [];

  return (
    <ul
      role="list"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      <motion.li
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      >
        <NewDesignTile onClick={onCreate} kind={kind} />
      </motion.li>
      {items.map((doc, i) => (
        <motion.li
          key={doc.id}
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.22,
            ease: [0.22, 1, 0.36, 1],
            delay: reduce ? 0 : Math.min(i + 1, 7) * 0.035,
          }}
        >
          <DesignTile
            doc={doc}
            onOpen={() => open(doc)}
            onDelete={() => void onDelete(doc)}
            deleting={deleting === doc.id}
          />
        </motion.li>
      ))}
    </ul>
  );
}

function NewDesignTile({
  onClick,
  kind,
}: {
  onClick: () => void;
  kind: DesignDocKind;
}) {
  const label =
    kind === "db_design" ? "New database design" : "New system design";
  return (
    <TiltCard className="group h-full" ariaLabel={label}>
      <button
        type="button"
        onClick={onClick}
        className="border-border/60 bg-card hover:border-border hover:bg-accent/40 focus-visible:ring-ring/50 focus-visible:border-ring relative flex h-44 w-full flex-col items-center justify-center gap-2 rounded-[inherit] border border-dashed text-left transition-colors outline-none focus-visible:ring-3"
      >
        <span
          className="bg-primary/10 text-primary inline-flex h-10 w-10 items-center justify-center rounded-md"
          aria-hidden
        >
          <Plus className="h-5 w-5" />
        </span>
        <span className="text-foreground text-sm font-medium">{label}</span>
        <span className="text-muted-foreground text-[11px]">
          {kind === "db_design"
            ? "Start a relational or document schema"
            : "Start a freeform architecture canvas"}
        </span>
      </button>
    </TiltCard>
  );
}

function DesignTile({
  doc,
  onOpen,
  onDelete,
  deleting,
}: {
  doc: DesignDocumentDTO;
  onOpen: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const updated = fmtRelative(doc.updatedAt);
  const engineBadge =
    doc.kind === "db_design" && doc.dbEngine
      ? engineLabel(doc.dbEngine)
      : doc.kind === "system_design"
        ? "Freeform"
        : null;

  return (
    <TiltCard className="group h-full" ariaLabel={`Open ${doc.title}`}>
      <div className="border-border/60 bg-card hover:border-border focus-within:ring-ring/50 relative flex h-44 flex-col rounded-[inherit] border transition-colors focus-within:ring-3">
        <button
          type="button"
          onClick={onOpen}
          className="flex flex-1 flex-col gap-2 rounded-[inherit] p-4 text-left outline-none"
          aria-label={`Open ${doc.title}`}
        >
          <Thumbnail
            src={doc.thumbnail}
            kind={doc.kind}
            className="h-24 w-full"
          />
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-foreground truncate text-sm font-medium">
                {doc.title}
              </p>
              <p className="text-muted-foreground text-[11px]">{updated}</p>
            </div>
            {engineBadge ? (
              <span className="border-border/60 bg-muted/40 text-muted-foreground inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 font-mono text-[10px] uppercase">
                {engineBadge}
              </span>
            ) : null}
          </div>
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${doc.title}`}
          disabled={deleting}
          className={cn(
            "text-muted-foreground hover:text-destructive hover:bg-destructive/10 focus-visible:ring-ring/60 absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-md outline-none transition-colors focus-visible:ring-2",
            "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
            deleting && "opacity-100",
          )}
        >
          {deleting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          )}
        </button>
      </div>
    </TiltCard>
  );
}

function Thumbnail({
  src,
  kind,
  className,
}: {
  src: string | null;
  kind: DesignDocKind;
  className?: string;
}) {
  if (src) {
    // Thumbnails are data URLs generated client-side from the canvas
    // (Phase 20/21). next/image can't optimize those, and they're small.
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        className={cn(
          "border-border/40 bg-editor-surface rounded-md border object-cover",
          className,
        )}
      />
    );
  }
  return (
    <div
      className={cn(
        "border-border/40 bg-muted/40 text-muted-foreground flex items-center justify-center rounded-md border font-mono text-[10px] uppercase tracking-wider",
        className,
      )}
      aria-hidden
    >
      {kind === "db_design" ? "schema" : "system"}
    </div>
  );
}

function engineLabel(engine: string): string {
  if (engine === "postgresql") return "Postgres";
  if (engine === "mysql") return "MySQL";
  if (engine === "mongodb") return "Mongo";
  return engine;
}

function fmtRelative(date: Date | string): string {
  const ms = typeof date === "string" ? Date.parse(date) : date.getTime();
  if (!Number.isFinite(ms)) return "";
  const diff = Math.max(0, Date.now() - ms);
  const s = Math.floor(diff / 1000);
  if (s < 60) return "Updated just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `Updated ${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Updated ${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `Updated ${d}d ago`;
  return `Updated ${new Date(ms).toLocaleDateString()}`;
}
