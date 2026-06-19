"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  Loader2,
  Save,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/theme-toggle";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { SaveStatus } from "@/lib/hooks/use-design-doc";

interface DesignCanvasChromeProps {
  docId: string;
  title: string;
  status: SaveStatus;
  /** "saving" while a manual save's PATCH is in flight. */
  saving: boolean;
  /** Manual save handler — forces a flush of pending autosave. */
  onSave: () => void | Promise<void>;
  /** Commits a rename via PATCH. Called on blur. */
  onRename: (title: string) => void | Promise<void>;
  /** Right-side chrome from the canvas (e.g. engine badge). */
  rightSlot?: ReactNode;
  children: ReactNode;
}

/**
 * Shared chrome for both design canvas routes (`/design/db/[id]` and
 * `/design/system/[id]`): back-to-dashboard link, inline-editable title,
 * save status indicator, explicit Save button, theme toggle, Delete.
 */
export function DesignCanvasChrome({
  docId,
  title,
  status,
  saving,
  onSave,
  onRename,
  rightSlot,
  children,
}: DesignCanvasChromeProps) {
  const router = useRouter();
  const [localTitle, setLocalTitle] = useState(title);
  const [deleting, setDeleting] = useState(false);

  // Keep the input synced if the server hands back a different title.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalTitle(title);
  }, [title]);

  async function commit() {
    const trimmed = localTitle.trim();
    if (!trimmed || trimmed === title) {
      setLocalTitle(title);
      return;
    }
    await onRename(trimmed);
  }

  async function onDelete() {
    if (deleting) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Delete "${title}"? This can't be undone.`)
    ) {
      return;
    }
    setDeleting(true);
    try {
      await api.designDocs.delete(docId);
      toast.success("Design deleted");
      router.replace("/dashboard");
    } catch (e) {
      setDeleting(false);
      const msg =
        e instanceof ApiError ? e.body?.message ?? e.message : "Delete failed.";
      toast.error("Couldn't delete", { description: msg });
    }
  }

  return (
    <div className="flex h-[100dvh] flex-1 flex-col">
      <header className="border-border/60 bg-background/80 supports-[backdrop-filter]:bg-background/60 flex items-center justify-between gap-3 border-b px-3 py-2 backdrop-blur">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href="/dashboard"
            aria-label="Back to dashboard"
            className="text-muted-foreground hover:text-foreground hover:bg-accent/40 focus-visible:ring-ring/50 inline-flex h-7 w-7 items-center justify-center rounded-md outline-none transition-colors focus-visible:ring-2"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <Input
            value={localTitle}
            onChange={(e) => setLocalTitle(e.target.value)}
            onBlur={() => void commit()}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") {
                setLocalTitle(title);
                (e.target as HTMLInputElement).blur();
              }
            }}
            aria-label="Design title"
            className="h-7 min-w-0 max-w-xs border-transparent bg-transparent px-2 text-sm font-medium focus-visible:border-input"
          />
          {rightSlot}
        </div>

        <div className="flex items-center gap-2">
          <SaveIndicator status={status} />
          <Button
            size="sm"
            variant="outline"
            onClick={() => void onSave()}
            disabled={saving || status === "saving"}
          >
            {saving || status === "saving" ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            )}
            Save
          </Button>
          <ThemeToggle />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void onDelete()}
            disabled={deleting}
            aria-label="Delete design"
          >
            {deleting ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            )}
            Delete
          </Button>
        </div>
      </header>
      {/* Grid with a single `minmax(0,1fr)` row gives the canvas child a
          DEFINITE height to resolve against. A plain `flex-1` block here is
          flex-computed but `auto` for percentage resolution, so the canvas
          root's `h-full` (and React Flow's `absolute inset-0`) collapsed to
          0 — the nodes existed but the pane had no height. */}
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)]">
        {children}
      </div>
    </div>
  );
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  const label =
    status === "saving"
      ? "Saving…"
      : status === "saved"
        ? "Saved"
        : status === "dirty"
          ? "Unsaved changes"
          : status === "error"
            ? "Save failed"
            : "";
  if (!label) return null;
  return (
    <span
      className={cn(
        "text-muted-foreground inline-flex items-center gap-1 font-mono text-[11px]",
        status === "error" && "text-destructive",
        status === "saved" && "text-emerald-300",
      )}
      aria-live="polite"
    >
      {status === "saving" ? (
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
      ) : null}
      {label}
    </span>
  );
}
