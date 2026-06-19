"use client";

import type { Cardinality } from "./types";

/** "Single" or "many" end. Drives the crow's-foot marker shape. */
export type EndShape = "single" | "many";

/** Map an edge cardinality to per-end shapes. */
export function endsFor(c: Cardinality): { source: EndShape; target: EndShape } {
  switch (c) {
    case "one_to_one":
      return { source: "single", target: "single" };
    case "one_to_many":
      return { source: "single", target: "many" };
    case "many_to_one":
      return { source: "many", target: "single" };
    case "many_to_many":
      return { source: "many", target: "many" };
  }
}

export const CARDINALITY_LABELS: Record<Cardinality, string> = {
  one_to_one: "1 : 1",
  one_to_many: "1 : N",
  many_to_one: "N : 1",
  many_to_many: "N : M",
};

/**
 * Inline SVG `<marker>` defs we register once at the React Flow root.
 *
 * The crow's-foot vocabulary we render:
 *   - `single` (1)  → a perpendicular dash close to the line end
 *   - `many` (N)    → three diverging lines (the "crow's foot")
 *
 * Marker fill/stroke uses `currentColor` so the edge color carries through
 * unchanged in both themes (the edge sets its own stroke).
 */
export function CardinalityMarkerDefs() {
  return (
    <svg
      aria-hidden
      style={{ position: "absolute", width: 0, height: 0 }}
      data-marker-defs
    >
      <defs>
        {/* --- one ("single") -------------------------------------------- */}
        <marker
          id="db-end-single-end"
          viewBox="0 0 12 12"
          refX="11"
          refY="6"
          markerWidth="14"
          markerHeight="14"
          orient="auto-start-reverse"
        >
          <line
            x1="9"
            y1="1"
            x2="9"
            y2="11"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </marker>
        <marker
          id="db-end-single-start"
          viewBox="0 0 12 12"
          refX="1"
          refY="6"
          markerWidth="14"
          markerHeight="14"
          orient="auto-start-reverse"
        >
          <line
            x1="3"
            y1="1"
            x2="3"
            y2="11"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </marker>

        {/* --- many ("crow's foot") ------------------------------------- */}
        <marker
          id="db-end-many-end"
          viewBox="0 0 12 12"
          refX="11"
          refY="6"
          markerWidth="16"
          markerHeight="16"
          orient="auto-start-reverse"
        >
          <line
            x1="11"
            y1="6"
            x2="2"
            y2="1"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <line
            x1="11"
            y1="6"
            x2="2"
            y2="6"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <line
            x1="11"
            y1="6"
            x2="2"
            y2="11"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </marker>
        <marker
          id="db-end-many-start"
          viewBox="0 0 12 12"
          refX="1"
          refY="6"
          markerWidth="16"
          markerHeight="16"
          orient="auto-start-reverse"
        >
          <line
            x1="1"
            y1="6"
            x2="10"
            y2="1"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <line
            x1="1"
            y1="6"
            x2="10"
            y2="6"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <line
            x1="1"
            y1="6"
            x2="10"
            y2="11"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </marker>
      </defs>
    </svg>
  );
}

/** Resolve a marker id for a given end. */
export function markerIdFor(shape: EndShape, position: "start" | "end") {
  return `url(#db-end-${shape}-${position})`;
}
