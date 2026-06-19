"use client";

import { GripVertical } from "lucide-react";
import { STENCILS, type StencilId } from "./stencils";

/** Drag MIME we use on the stencil dataTransfer payload. The receiving
 *  canvas reads this in its onDrop handler to look up the stencil. */
export const STENCIL_DRAG_MIME = "application/x-isb-stencil";

interface StencilPaletteProps {
  /** Programmatic insert — fallback for keyboard-driven users + a click
   *  affordance on each stencil tile. */
  onInsert: (id: StencilId) => void;
}

/**
 * Left-rail palette of infra stencils. Each tile is a native HTML5 drag
 * source — drop onto the Excalidraw canvas inserts the matching shape at
 * the cursor position. Click also inserts (centered) for keyboard /
 * touch users.
 *
 * Strictly visual chrome here — all canvas mutation happens in
 * `<SystemCanvas>` so undo history stays sane.
 */
export function StencilPalette({ onInsert }: StencilPaletteProps) {
  return (
    <aside
      aria-label="Infrastructure stencils"
      className="border-border/60 bg-card/60 flex w-44 shrink-0 flex-col gap-2 border-r p-3"
    >
      <div className="text-muted-foreground flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider">
        Stencils
      </div>
      <ul role="list" className="m-0 flex flex-col gap-1.5 p-0">
        {STENCILS.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(STENCIL_DRAG_MIME, s.id);
                e.dataTransfer.effectAllowed = "copy";
              }}
              onClick={() => onInsert(s.id)}
              className="border-border/60 bg-card hover:border-border hover:bg-accent/40 focus-visible:ring-ring/50 focus-visible:border-ring flex w-full cursor-grab items-center gap-2 rounded-md border p-2 text-left text-xs outline-none transition-colors focus-visible:ring-2 active:cursor-grabbing"
              aria-label={`Insert ${s.label} (drag onto canvas)`}
            >
              <GripVertical
                className="text-muted-foreground h-3 w-3 shrink-0"
                aria-hidden
              />
              <span
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
                style={{
                  backgroundColor: s.backgroundColor,
                  color: s.strokeColor,
                }}
                aria-hidden
              >
                <s.Icon className="h-4 w-4" />
              </span>
              <span className="text-foreground truncate">{s.label}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground mt-1 text-[10px] leading-snug">
        Drag onto the canvas, or click to drop at the center. Use Excalidraw&apos;s
        arrow tool to connect — arrows bind to the rectangle so connections
        follow the shape when you move it.
      </p>
    </aside>
  );
}
