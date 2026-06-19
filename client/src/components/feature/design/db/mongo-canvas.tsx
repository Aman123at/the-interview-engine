"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  CollectionNode,
  type CollectionNodeData,
} from "./collection-node";
import {
  RelationshipEdge,
  type RelationshipEdgeData,
} from "./relationship-edge";
import { CardinalityMarkerDefs } from "./cardinality";
import { ExportMenu } from "./export-menu";
import {
  nextId,
  type CollectionField,
  type DbCanvasModel,
  type MongoCollection,
  type Relationship,
} from "./types";

interface MongoCanvasProps {
  model: DbCanvasModel;
  onChange: (next: DbCanvasModel) => void;
  captureRef?: { current: HTMLDivElement | null };
}

const NODE_TYPES = { collection: CollectionNode };
const EDGE_TYPES = { relationship: RelationshipEdge };

/**
 * Mongo document canvas. Collections are JSON-shaped nodes (the body is a
 * field tree, not a tabular row list); reference edges are drawn from
 * ObjectId fields tagged with a `referenceCollection`.
 *
 * Auto-edges from references: when a field is marked `isReference` + has a
 * target collection, we synthesize a Relationship if one doesn't already
 * exist for that source. The user can still hand-edit cardinality via the
 * edge label dropdown.
 */
export function MongoCanvas({ model, onChange, captureRef }: MongoCanvasProps) {
  return (
    <ReactFlowProvider>
      <MongoCanvasInner
        model={model}
        onChange={onChange}
        captureRef={captureRef}
      />
    </ReactFlowProvider>
  );
}

function MongoCanvasInner({ model, onChange, captureRef }: MongoCanvasProps) {
  const collections = useMemo(
    () => model.collections ?? [],
    [model.collections],
  );
  const relationships = useMemo(
    () => model.relationships ?? [],
    [model.relationships],
  );

  const flowRef = useRef<ReactFlowInstance | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef(model);
  useEffect(() => {
    modelRef.current = model;
  }, [model]);

  const updateCollection = useCallback(
    (next: MongoCollection) => {
      const cur = modelRef.current.collections ?? [];
      const updated: MongoCollection[] = cur.map((c) =>
        c.id === next.id ? next : c,
      );
      onChange({
        ...modelRef.current,
        collections: updated,
        // Refresh derived reference edges so the canvas reflects the change.
        relationships: deriveReferenceEdges(
          updated,
          modelRef.current.relationships ?? [],
        ),
      });
    },
    [onChange],
  );

  const deleteCollection = useCallback(
    (id: string) => {
      const m = modelRef.current;
      const next = (m.collections ?? []).filter((c) => c.id !== id);
      onChange({
        ...m,
        collections: next,
        relationships: deriveReferenceEdges(next, m.relationships ?? []).filter(
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

  const derivedNodes = useMemo<Node[]>(
    () =>
      collections.map<Node>((c) => ({
        id: c.id,
        type: "collection",
        position: c.position ?? { x: 0, y: 0 },
        data: {
          collection: c,
          allCollections: collections,
          onChange: updateCollection,
          onDelete: deleteCollection,
        } satisfies CollectionNodeData,
      })),
    [collections, updateCollection, deleteCollection],
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

  // React Flow owns the live node/edge state so dragging is smooth; we only
  // commit positions to the document on drag-end. Mid-drag the model is
  // untouched, so `derivedNodes` stays stable and the resync effect is quiet.
  const [nodes, setNodes, onNodesChangeInternal] = useNodesState(derivedNodes);
  const [edges, setEdges, onEdgesChangeInternal] = useEdgesState(derivedEdges);

  useEffect(() => {
    setNodes(derivedNodes);
  }, [derivedNodes, setNodes]);
  useEffect(() => {
    setEdges(derivedEdges);
  }, [derivedEdges, setEdges]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChangeInternal(changes);
      const dragEnded = changes.some(
        (c) => c.type === "position" && c.dragging === false,
      );
      if (!dragEnded) return;
      const next = applyNodeChanges(changes, nodes);
      const updates: MongoCollection[] = (
        modelRef.current.collections ?? []
      ).map((c) => {
        const n = next.find((x) => x.id === c.id);
        return n ? { ...c, position: { x: n.position.x, y: n.position.y } } : c;
      });
      onChange({ ...modelRef.current, collections: updates });
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
      if (!c.source || !c.target) {
        toast.error("Can't connect", {
          description: "Drag from a reference field to another collection.",
        });
        return;
      }
      const cur = modelRef.current;
      const collections = cur.collections ?? [];
      const sourceCol = collections.find((coll) => coll.id === c.source);
      const targetCol = collections.find((coll) => coll.id === c.target);
      if (!sourceCol || !targetCol) {
        toast.error("Can't connect", {
          description: "Couldn't find the connected collections.",
        });
        return;
      }
      const sourceFieldId = stripHandleSuffix(c.sourceHandle ?? null);
      const sourceField = findField(sourceCol.fields, sourceFieldId);
      if (!sourceField || !sourceField.isReference) {
        toast.error("Can't connect", {
          description: "Source field must be an ObjectId reference.",
        });
        return;
      }
      // Tag the source field's reference target — then deriveReferenceEdges
      // will add the edge.
      const nextSource: MongoCollection = {
        ...sourceCol,
        fields: setReference(sourceCol.fields, sourceField.id, targetCol.id),
      };
      const updated = collections.map((coll) =>
        coll.id === nextSource.id ? nextSource : coll,
      );
      onChange({
        ...cur,
        collections: updated,
        relationships: deriveReferenceEdges(updated, cur.relationships ?? []),
      });
    },
    [onChange],
  );

  function addCollection() {
    const idx = collections.length + 1;
    const idField: CollectionField = {
      id: nextId("fld"),
      name: "_id",
      bsonType: "objectId",
    };
    const c: MongoCollection = {
      id: nextId("col"),
      name: `collection_${idx}`,
      position: spawnPosition(collections.length),
      fields: [idField],
    };
    onChange({
      ...modelRef.current,
      collections: [...(modelRef.current.collections ?? []), c],
    });
  }

  const [fitted, setFitted] = useState(false);
  useEffect(() => {
    if (fitted) return;
    if (!flowRef.current) return;
    if (collections.length === 0) return;
    flowRef.current.fitView({ padding: 0.2, duration: 200 });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFitted(true);
  }, [fitted, collections.length]);

  // Keep derived reference edges in sync if collections were mutated outside
  // this canvas (e.g. an autosave reload). Cheap — runs once per model change.
  useEffect(() => {
    const cur = modelRef.current;
    const derived = deriveReferenceEdges(
      cur.collections ?? [],
      cur.relationships ?? [],
    );
    if (derived !== cur.relationships) {
      // Only push if the set actually changed.
      const same =
        derived.length === (cur.relationships ?? []).length &&
        derived.every((r, i) => (cur.relationships ?? [])[i]?.id === r.id);
      if (!same) {
        onChange({ ...cur, relationships: derived });
      }
    }
  }, [collections, onChange]);

  return (
    <div className="relative h-full min-h-0 w-full" ref={wrapperRef}>
      <CardinalityMarkerDefs />
      <div className="absolute right-3 top-3 z-10 flex gap-2">
        <Button size="sm" onClick={addCollection}>
          <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Add collection
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
          fitView={collections.length > 0}
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

// --- Reference-edge derivation ----------------------------------------------

/**
 * Walk every collection's field tree; for each `isReference` field with a
 * `referenceCollection` set, ensure there's an edge in the relationships
 * list. Preserves user-edited cardinalities on existing edges.
 */
function deriveReferenceEdges(
  collections: MongoCollection[],
  existing: Relationship[],
): Relationship[] {
  const wanted: Array<{
    sourceEntity: string;
    sourceField: string;
    targetEntity: string;
  }> = [];
  function walk(collection: MongoCollection, fields: CollectionField[]) {
    for (const f of fields) {
      if (f.isReference && f.referenceCollection) {
        wanted.push({
          sourceEntity: collection.id,
          sourceField: f.id,
          targetEntity: f.referenceCollection,
        });
      }
      if (f.fields && f.fields.length > 0) walk(collection, f.fields);
    }
  }
  for (const c of collections) walk(c, c.fields);

  const next: Relationship[] = [];
  const keepIds = new Set<string>();

  for (const w of wanted) {
    const found = existing.find(
      (e) =>
        e.source.entityId === w.sourceEntity &&
        e.source.fieldId === w.sourceField &&
        e.target.entityId === w.targetEntity,
    );
    if (found) {
      keepIds.add(found.id);
      next.push(found);
    } else {
      next.push({
        id: nextId("rel"),
        source: { entityId: w.sourceEntity, fieldId: w.sourceField },
        target: { entityId: w.targetEntity, fieldId: null },
        cardinality: "many_to_one",
      });
    }
  }
  // Also keep any pre-existing edges that aren't reference-derived (none for
  // now, but future "embed" relationships could live here).
  for (const e of existing) {
    if (
      keepIds.has(e.id) ||
      !wanted.some(
        (w) =>
          e.source.entityId === w.sourceEntity &&
          e.source.fieldId === w.sourceField,
      )
    ) {
      if (!keepIds.has(e.id)) next.push(e);
    }
  }
  return next;
}

function findField(
  fields: CollectionField[],
  id: string | null,
): CollectionField | null {
  if (!id) return null;
  for (const f of fields) {
    if (f.id === id) return f;
    if (f.fields) {
      const sub = findField(f.fields, id);
      if (sub) return sub;
    }
  }
  return null;
}

function setReference(
  fields: CollectionField[],
  id: string,
  refId: string,
): CollectionField[] {
  return fields.map((f) => {
    if (f.id === id) {
      return {
        ...f,
        bsonType: "objectId",
        isReference: true,
        referenceCollection: refId,
      };
    }
    if (f.fields) return { ...f, fields: setReference(f.fields, id, refId) };
    return f;
  });
}

function stripHandleSuffix(h: string | null): string | null {
  if (!h) return null;
  return h.replace(/-(l|r)$/, "");
}

function spawnPosition(existingCount: number): { x: number; y: number } {
  const cols = 3;
  const row = Math.floor(existingCount / cols);
  const col = existingCount % cols;
  return { x: 40 + col * 320, y: 40 + row * 260 };
}
