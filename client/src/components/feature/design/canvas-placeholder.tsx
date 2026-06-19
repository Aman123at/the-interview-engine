"use client";

import { useEffect, useRef } from "react";
import { LayoutTemplate } from "lucide-react";

interface CanvasPlaceholderProps {
  /** Initial document model from the server. */
  initialDocument: unknown;
  /** Pushed up to the autosave hook when the user edits the placeholder. */
  onChange: (next: unknown) => void;
  kind: "db_design" | "system_design";
}

/**
 * Phase 19 stub. Real canvases land in:
 *   - Phase 20 — Database Design (React Flow, strict ER)
 *   - Phase 21 — System Design (Excalidraw, freeform)
 *
 * This placeholder loads/saves the document model so the lifecycle wiring
 * (load → edit → debounced autosave → manual save → reload-restore) can be
 * verified now. Edits are made through a JSON textarea so the autosave path
 * runs over the contract-validated body.
 */
export function CanvasPlaceholder({
  initialDocument,
  onChange,
  kind,
}: CanvasPlaceholderProps) {
  const textRef = useRef<HTMLTextAreaElement | null>(null);

  // Seed once from the server payload. Subsequent server reads aren't
  // mirrored into the textarea — that would clobber user edits mid-flight.
  useEffect(() => {
    if (!textRef.current) return;
    textRef.current.value = JSON.stringify(initialDocument ?? {}, null, 2);
    // We intentionally bind only on mount; further updates flow user → server.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-4">
      <div className="text-muted-foreground flex items-center gap-2 text-xs">
        <LayoutTemplate className="h-3.5 w-3.5" aria-hidden />
        <span>
          {kind === "db_design"
            ? "Database canvas (stub — Phase 20)"
            : "System canvas (stub — Phase 21)"}
        </span>
        <span className="font-mono">
          edits land via debounced PATCH /design-docs/:id
        </span>
      </div>
      <textarea
        ref={textRef}
        spellCheck={false}
        onChange={(e) => {
          // Parse on the fly; if it's invalid JSON we still push the string —
          // the contract typed it as `unknown.optional`, so the server is
          // tolerant. Phase 20/21 swap this out for the real canvas state.
          const v = e.target.value;
          try {
            onChange(JSON.parse(v));
          } catch {
            onChange(v);
          }
        }}
        className="border-border/60 bg-editor-surface text-editor-surface-foreground placeholder:text-muted-foreground focus-visible:ring-ring/50 min-h-0 flex-1 resize-none rounded-md border p-3 font-mono text-[12px] leading-relaxed outline-none focus-visible:ring-2"
        aria-label="Design document JSON"
      />
    </div>
  );
}
