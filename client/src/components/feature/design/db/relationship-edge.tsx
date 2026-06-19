"use client";

import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import { endsFor, markerIdFor, CARDINALITY_LABELS } from "./cardinality";
import type { Cardinality } from "./types";

export type RelationshipEdgeData = {
  cardinality: Cardinality;
  /** Set the cardinality from the label dropdown. */
  onChangeCardinality: (next: Cardinality) => void;
  onDelete: () => void;
};

/**
 * Bezier edge between PK / FK handles. Renders crow's-foot–style markers at
 * each end derived from the stored cardinality:
 *   - 1:1 → single on both ends
 *   - 1:N → single on source, many on target
 *   - N:1 → many on source, single on target
 *   - N:M → many on both ends
 *
 * Click the floating label to swap cardinality.
 */
export function RelationshipEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps) {
  const d = data as RelationshipEdgeData;
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const ends = endsFor(d.cardinality);

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerStart={markerIdFor(ends.source, "start")}
        markerEnd={markerIdFor(ends.target, "end")}
        style={{
          stroke: selected ? "var(--color-primary)" : "var(--color-foreground)",
          strokeWidth: selected ? 2 : 1.5,
          opacity: 0.85,
        }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: "all",
          }}
          className="bg-background border-border/60 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px] shadow-sm"
        >
          <select
            value={d.cardinality}
            onChange={(e) =>
              d.onChangeCardinality(e.target.value as Cardinality)
            }
            aria-label="Relationship cardinality"
            className="bg-transparent text-foreground outline-none"
          >
            {(
              [
                "one_to_one",
                "one_to_many",
                "many_to_one",
                "many_to_many",
              ] as Cardinality[]
            ).map((c) => (
              <option key={c} value={c}>
                {CARDINALITY_LABELS[c]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => d.onDelete()}
            aria-label="Delete relationship"
            className="text-muted-foreground hover:text-destructive ml-0.5"
          >
            ×
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
