"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type OnConnect,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TableNode, type TableNodeData } from "./table-node";
import {
  RelationshipEdge,
  type RelationshipEdgeData,
} from "./relationship-edge";
import { CardinalityMarkerDefs } from "./cardinality";
import { ExportMenu } from "./export-menu";
import { nextId, type DbCanvasModel, type RelationalTable, type Relationship } from "./types";

interface RelationalCanvasProps {
  engine: "postgresql" | "mysql";
  model: DbCanvasModel;
  onChange: (next: DbCanvasModel) => void;
  /** Capture-the-canvas helper used for thumbnails on save. */
  captureRef?: { current: HTMLDivElement | null };
}

const NODE_TYPES = { table: TableNode };
const EDGE_TYPES = { relationship: RelationshipEdge };

/**
 * Strict relational ER canvas. Tables-as-nodes; FK-to-PK edges-as-relationships
 * with crow's-foot cardinality markers. No free text outside the column
 * editor, no freehand drawing — those belong to System Design (Phase 21).
 *
 * Connection validation: an edge requires the SOURCE to be an FK column and
 * the TARGET to be a PK or UNIQUE column. We reject with a toast otherwise.
 *
 * Engine swap re-renders the column dropdowns via the dialect catalog; the
 * stored datatype strings are preserved verbatim (the contract is permissive),
 * so a Postgres `text` survives into MySQL view as a free-form choice.
 */
export function RelationalCanvas({
  engine,
  model,
  onChange,
  captureRef,
}: RelationalCanvasProps) {
  return (
    <ReactFlowProvider>
      <RelationalCanvasInner
        engine={engine}
        model={model}
        onChange={onChange}
        captureRef={captureRef}
      />
    </ReactFlowProvider>
  );
}

function RelationalCanvasInner({
  engine,
  model,
  onChange,
  captureRef,
}: RelationalCanvasProps) {
  const tables = useMemo(() => model.tables ?? [], [model.tables]);
  const relationships = useMemo(
    () => model.relationships ?? [],
    [model.relationships],
  );

  const flowRef = useRef<ReactFlowInstance | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Keep the latest model in a ref so the React Flow callbacks below don't
  // need to rebuild every time the user types.
  const modelRef = useRef(model);
  useEffect(() => {
    modelRef.current = model;
  }, [model]);

  const updateTable = useCallback(
    (table: RelationalTable) => {
      const current = modelRef.current.tables ?? [];
      onChange({
        ...modelRef.current,
        tables: current.map((t) => (t.id === table.id ? table : t)),
      });
    },
    [onChange],
  );

  const deleteTable = useCallback(
    (id: string) => {
      const m = modelRef.current;
      onChange({
        ...m,
        tables: (m.tables ?? []).filter((t) => t.id !== id),
        // Drop relationships that touch the deleted table.
        relationships: (m.relationships ?? []).filter(
          (r) => r.source.entityId !== id && r.target.entityId !== id,
        ),
      });
    },
    [onChange],
  );

  const updateRel = useCallback(
    (id: string, patch: Partial<Relationship>) => {
      const m = modelRef.current;
      onChange({
        ...m,
        relationships: (m.relationships ?? []).map((r) =>
          r.id === id ? { ...r, ...patch } : r,
        ),
      });
    },
    [onChange],
  );

  const deleteRel = useCallback(
    (id: string) => {
      const m = modelRef.current;
      onChange({
        ...m,
        relationships: (m.relationships ?? []).filter((r) => r.id !== id),
      });
    },
    [onChange],
  );

  // Convert the model into React Flow's node/edge shape. The memo deps are
  // tight so this only re-runs when the model actually changes (add/remove
  // table, column edits, drag-end position commit) — NOT mid-drag.
  const derivedNodes = useMemo<Node[]>(
    () =>
      tables.map<Node>((t) => ({
        id: t.id,
        type: "table",
        position: t.position ?? { x: 0, y: 0 },
        data: {
          table: t,
          engine,
          onChange: updateTable,
          onDelete: deleteTable,
        } satisfies TableNodeData,
        dragHandle: undefined,
      })),
    [tables, engine, updateTable, deleteTable],
  );

  const derivedEdges = useMemo<Edge[]>(
    () =>
      relationships.map<Edge>((r) => ({
        id: r.id,
        type: "relationship",
        source: r.source.entityId,
        target: r.target.entityId,
        sourceHandle: r.source.fieldId ? `${r.source.fieldId}-r` : undefined,
        targetHandle: r.target.fieldId ? `${r.target.fieldId}-l` : undefined,
        data: {
          cardinality: r.cardinality,
          onChangeCardinality: (next) => updateRel(r.id, { cardinality: next }),
          onDelete: () => deleteRel(r.id),
        } satisfies RelationshipEdgeData,
      })),
    [relationships, updateRel, deleteRel],
  );

  // React Flow OWNS the live node/edge state so dragging is smooth (updates
  // happen locally at 60fps). We only round-trip to the document on drag-end
  // / structural edits. Mid-drag the model is untouched, so `derivedNodes`
  // keeps a stable ref and the resync effect below does NOT fire.
  const [nodes, setNodes, onNodesChangeInternal] = useNodesState(derivedNodes);
  const [edges, setEdges, onEdgesChangeInternal] = useEdgesState(derivedEdges);

  useEffect(() => {
    setNodes(derivedNodes);
  }, [derivedNodes, setNodes]);
  useEffect(() => {
    setEdges(derivedEdges);
  }, [derivedEdges, setEdges]);

  // --- Node/edge change handlers --------------------------------------------

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // Apply EVERY change to the live state so the card follows the cursor.
      onNodesChangeInternal(changes);
      // Persist positions to the document only when a drag finishes.
      const dragEnded = changes.some(
        (c) => c.type === "position" && c.dragging === false,
      );
      if (!dragEnded) return;
      const next = applyNodeChanges(changes, nodes);
      const updates: RelationalTable[] = (modelRef.current.tables ?? []).map(
        (t) => {
          const n = next.find((x) => x.id === t.id);
          return n ? { ...t, position: { x: n.position.x, y: n.position.y } } : t;
        },
      );
      onChange({ ...modelRef.current, tables: updates });
    },
    [onNodesChangeInternal, nodes, onChange],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      onEdgesChangeInternal(changes);
      const removeIds = changes
        .filter((c) => c.type === "remove")
        .map((c) => (c as { id: string }).id);
      if (removeIds.length === 0) return;
      const m = modelRef.current;
      onChange({
        ...m,
        relationships: (m.relationships ?? []).filter(
          (r) => !removeIds.includes(r.id),
        ),
      });
    },
    [onEdgesChangeInternal, onChange],
  );

  const onConnect: OnConnect = useCallback(
    (c: Connection) => {
      const result = createRelationshipFromConnection(c, modelRef.current);
      if (!result.ok) {
        toast.error("Can't connect", { description: result.reason });
        return;
      }
      onChange({
        ...modelRef.current,
        relationships: [
          ...(modelRef.current.relationships ?? []),
          result.relationship,
        ],
      });
    },
    [onChange],
  );

  function addTable() {
    const existing = modelRef.current.tables ?? [];
    const idx = existing.length + 1;
    const id = nextId("tbl");
    const pkId = nextId("col");
    const table: RelationalTable = {
      id,
      name: `table_${idx}`,
      // Spawn at the center of what the user is currently looking at so the
      // new table is always visible — the viewport doesn't auto-fit after the
      // first paint, so a fixed grid position can land off-screen.
      position: spawnPosition(existing.length),
      columns: [
        {
          id: pkId,
          name: "id",
          dataType: engine === "postgresql" ? "uuid" : "CHAR(36)",
          isPrimaryKey: true,
          isUnique: true,
          isNullable: false,
        },
      ],
    };

    const inst = flowRef.current;
    const wrapper = wrapperRef.current;
    if (inst && wrapper) {
      const rect = wrapper.getBoundingClientRect();
      const center = inst.screenToFlowPosition({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });
      // Offset so the table's body (not its corner) sits under the cursor's
      // focal point, and nudge each successive add so they don't stack.
      table.position = {
        x: Math.round(center.x - 110 + (existing.length % 5) * 24),
        y: Math.round(center.y - 60 + (existing.length % 5) * 24),
      };
    }

    onChange({
      ...modelRef.current,
      tables: [...existing, table],
    });
  }

  // Re-fit the viewport ONCE on first paint so a loaded doc with off-screen
  // tables shows up correctly. Subsequent edits keep the user's pan/zoom.
  const [fitted, setFitted] = useState(false);
  useEffect(() => {
    if (fitted) return;
    if (!flowRef.current) return;
    if (tables.length === 0) return;
    flowRef.current.fitView({ padding: 0.2, duration: 200 });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFitted(true);
  }, [fitted, tables.length]);

  return (
    <div className="relative h-full min-h-0 w-full" ref={wrapperRef}>
      <CardinalityMarkerDefs />
      <div className="absolute right-3 top-3 z-10 flex gap-2">
        <Button size="sm" onClick={addTable}>
          <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Add table
        </Button>
        <ExportMenu wrapperRef={wrapperRef} kind="db" />
      </div>
      <div className="absolute inset-0" ref={captureRef}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onInit={(inst) => {
            flowRef.current = inst;
          }}
          fitView={tables.length > 0}
          fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
          minZoom={0.2}
          maxZoom={1.5}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
          <Controls position="bottom-left" />
          <MiniMap pannable zoomable position="bottom-right" />
        </ReactFlow>
      </div>
    </div>
  );
}

// --- Connection validation ---------------------------------------------------

function createRelationshipFromConnection(
  c: Connection,
  model: DbCanvasModel,
): { ok: true; relationship: Relationship } | { ok: false; reason: string } {
  if (!c.source || !c.target) {
    return { ok: false, reason: "Drag from a column handle to another." };
  }
  const tables = model.tables ?? [];
  const sourceTable = tables.find((t) => t.id === c.source);
  const targetTable = tables.find((t) => t.id === c.target);
  if (!sourceTable || !targetTable) {
    return { ok: false, reason: "Couldn't find the connected tables." };
  }
  if (sourceTable.id === targetTable.id) {
    return { ok: false, reason: "Self-referencing relationships aren't allowed yet." };
  }

  const sourceFieldId = stripHandleSuffix(c.sourceHandle ?? null);
  const targetFieldId = stripHandleSuffix(c.targetHandle ?? null);
  const sourceCol = sourceTable.columns.find((col) => col.id === sourceFieldId);
  const targetCol = targetTable.columns.find((col) => col.id === targetFieldId);

  if (!sourceCol || !targetCol) {
    return {
      ok: false,
      reason: "Connect a column handle (PK or FK) to another.",
    };
  }
  // FK side: must be marked FK (or PK — composite-PK FKs are valid).
  if (!sourceCol.isForeignKey && !sourceCol.isPrimaryKey) {
    return {
      ok: false,
      reason: `Source column "${sourceCol.name}" must be marked FK or PK.`,
    };
  }
  // PK side: must be PK or UNIQUE.
  if (!targetCol.isPrimaryKey && !targetCol.isUnique) {
    return {
      ok: false,
      reason: `Target column "${targetCol.name}" must be PK or UNIQUE.`,
    };
  }

  return {
    ok: true,
    relationship: {
      id: nextId("rel"),
      source: { entityId: sourceTable.id, fieldId: sourceCol.id },
      target: { entityId: targetTable.id, fieldId: targetCol.id },
      cardinality: "many_to_one",
    },
  };
}

function stripHandleSuffix(h: string | null): string | null {
  if (!h) return null;
  // Handle ids are `<columnId>-l` or `<columnId>-r`.
  return h.replace(/-(l|r)$/, "");
}

function spawnPosition(existingCount: number): { x: number; y: number } {
  // Lay new tables out in a loose grid so they don't stack on top of each other.
  const cols = 3;
  const row = Math.floor(existingCount / cols);
  const col = existingCount % cols;
  return { x: 40 + col * 320, y: 40 + row * 260 };
}
