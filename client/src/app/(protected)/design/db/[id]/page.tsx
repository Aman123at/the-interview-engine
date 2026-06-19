"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DesignCanvasChrome } from "@/components/feature/design/design-canvas-chrome";
import { DbCanvas, type DbCanvasHandle } from "@/components/feature/design/db/db-canvas";
import { useDesignDoc } from "@/lib/hooks/use-design-doc";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Database-design canvas route. Phase 20 — the real strict ER canvas
 * (React Flow, custom nodes/edges) replaces the Phase 19 stub. Mode switches
 * by `dbEngine`:
 *   - `postgresql` / `mysql` → relational table canvas with crow's-foot edges.
 *   - `mongodb`              → JSON collection canvas with reference edges.
 *
 * Lifecycle: load via GET /design-docs/:id → edits stream through
 * useDesignDoc's debounced autosave → manual Save captures a thumbnail and
 * flushes. Reload restores the diagram exactly.
 */
export default function DbDesignPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const doc = useDesignDoc({ id, expectedKind: "db_design" });
  const [manualSaving, setManualSaving] = useState(false);
  const canvasHandle = useRef<DbCanvasHandle | null>(null);

  useEffect(() => {
    if (doc.wrongKind) {
      router.replace(`/design/system/${id}`);
    }
  }, [doc.wrongKind, id, router]);

  if (doc.loading || doc.wrongKind) {
    return (
      <div className="text-muted-foreground flex h-[100dvh] flex-1 items-center justify-center gap-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading design…
      </div>
    );
  }

  if (doc.error || !doc.doc) {
    return (
      <div className="flex h-[100dvh] flex-1 items-center justify-center px-6">
        <div className="border-destructive/30 bg-destructive/5 flex max-w-md flex-col items-start gap-3 rounded-lg border p-6">
          <div className="flex items-center gap-2">
            <AlertTriangle className="text-destructive h-4 w-4" aria-hidden />
            <p className="text-foreground text-sm font-medium">
              Couldn&apos;t load this design
            </p>
          </div>
          <p className="text-muted-foreground text-xs">
            {doc.error ?? "The document is missing or you don't have access."}
          </p>
          <Button size="sm" variant="outline" onClick={() => router.replace("/dashboard")}>
            Back to dashboard
          </Button>
        </div>
      </div>
    );
  }

  // Fallback to postgresql if the row is somehow missing dbEngine.
  const engine = doc.doc.dbEngine ?? "postgresql";
  const engineLabel =
    engine === "postgresql"
      ? "PostgreSQL"
      : engine === "mysql"
        ? "MySQL"
        : "MongoDB";

  async function manualSave() {
    setManualSaving(true);
    try {
      // Generate a fresh thumbnail before flushing the document so the
      // gallery card stays in sync. Best-effort — thumbnail failures don't
      // block the document save.
      const thumb = await canvasHandle.current?.captureThumbnail();
      if (thumb) void doc.setThumbnail(thumb);
      await doc.saveNow();
    } finally {
      setManualSaving(false);
    }
  }

  return (
    <DesignCanvasChrome
      docId={doc.doc.id}
      title={doc.doc.title}
      status={doc.status}
      saving={manualSaving}
      onSave={manualSave}
      onRename={doc.setTitle}
      rightSlot={
        <span className="border-border/60 bg-muted/40 text-muted-foreground inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 font-mono text-[10px] uppercase">
          {engineLabel}
        </span>
      }
    >
      <DbCanvas
        engine={engine}
        initialDocument={doc.doc.document}
        onChange={doc.setDocument}
        innerRef={canvasHandle}
      />
    </DesignCanvasChrome>
  );
}
