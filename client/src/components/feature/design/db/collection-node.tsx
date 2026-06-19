"use client";

import { memo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  Link2,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { BSON_TYPES } from "./dialects";
import type { CollectionField, MongoCollection } from "./types";
import { nextId } from "./types";

export type CollectionNodeData = {
  collection: MongoCollection;
  /** All collections — used to populate reference targets. */
  allCollections: MongoCollection[];
  onChange: (next: MongoCollection) => void;
  onDelete: (id: string) => void;
};

/**
 * Mongo collection node. Renders the field tree as nested JSON-ish rows.
 * `object` and `array` types can contain nested fields; reference fields
 * pick a target collection and expose a handle for the edge.
 *
 * The node is strict — every field has a name, a BSON type, and (optionally)
 * a reference target. No freehand drawing.
 */
function CollectionNodeBase({ data, selected }: NodeProps) {
  const { collection, allCollections, onChange, onDelete } =
    data as CollectionNodeData;
  const [expanded, setExpanded] = useState(true);

  function setName(name: string) {
    onChange({ ...collection, name });
  }
  function addField() {
    const f: CollectionField = {
      id: nextId("fld"),
      name: `field_${collection.fields.length + 1}`,
      bsonType: "string",
    };
    onChange({ ...collection, fields: [...collection.fields, f] });
  }
  function updateFields(fields: CollectionField[]) {
    onChange({ ...collection, fields });
  }

  return (
    <div
      className={cn(
        "min-w-[280px] overflow-hidden rounded-md border border-border bg-card text-card-foreground shadow-sm",
        selected && "ring-primary/40 ring-2",
      )}
    >
      <div className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-2 py-1.5">
        <GripVertical
          className="text-muted-foreground h-3.5 w-3.5 shrink-0 cursor-grab"
          aria-hidden
        />
        <span className="text-muted-foreground font-mono text-[10px]">
          {"{"}
        </span>
        <Input
          value={collection.name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Collection name"
          className="h-6 min-w-0 flex-1 border-transparent bg-transparent px-1 text-xs font-semibold focus-visible:border-input"
        />
        <button
          type="button"
          aria-label={expanded ? "Collapse fields" : "Expand fields"}
          className="text-muted-foreground hover:text-foreground inline-flex h-5 w-5 items-center justify-center rounded-md"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          type="button"
          aria-label="Delete collection"
          className="text-muted-foreground hover:text-destructive inline-flex h-5 w-5 items-center justify-center rounded-md"
          onClick={() => onDelete(collection.id)}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>

      {expanded ? (
        <div className="flex flex-col">
          <FieldList
            fields={collection.fields}
            allCollections={allCollections}
            selfId={collection.id}
            onChange={updateFields}
            depth={0}
          />
          <div className="border-t border-border bg-muted/20 px-2 py-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 w-full justify-start text-[11px]"
              onClick={addField}
            >
              <Plus className="mr-1 h-3 w-3" aria-hidden />
              Add field
            </Button>
          </div>
          <span className="text-muted-foreground px-2 pb-1 font-mono text-[10px]">
            {"}"}
          </span>
        </div>
      ) : null}
    </div>
  );
}

interface FieldListProps {
  fields: CollectionField[];
  allCollections: MongoCollection[];
  selfId: string;
  onChange: (next: CollectionField[]) => void;
  depth: number;
}

function FieldList({
  fields,
  allCollections,
  selfId,
  onChange,
  depth,
}: FieldListProps) {
  function patch(id: string, p: Partial<CollectionField>) {
    onChange(fields.map((f) => (f.id === id ? { ...f, ...p } : f)));
  }
  function remove(id: string) {
    onChange(fields.filter((f) => f.id !== id));
  }
  function setSub(id: string, sub: CollectionField[]) {
    onChange(fields.map((f) => (f.id === id ? { ...f, fields: sub } : f)));
  }
  function addSubAt(id: string) {
    const target = fields.find((f) => f.id === id);
    if (!target) return;
    const nestedKind =
      target.bsonType === "object" || target.bsonType === "array"
        ? target.bsonType
        : "object";
    patch(id, {
      bsonType: nestedKind,
      fields: [
        ...(target.fields ?? []),
        {
          id: nextId("fld"),
          name: `field_${(target.fields?.length ?? 0) + 1}`,
          bsonType: "string",
        },
      ],
    });
  }

  return (
    <ul className="m-0 flex flex-col p-0">
      {fields.map((f) => (
        <FieldRow
          key={f.id}
          field={f}
          allCollections={allCollections}
          selfId={selfId}
          depth={depth}
          onPatch={(p) => patch(f.id, p)}
          onAddSub={() => addSubAt(f.id)}
          onRemove={() => remove(f.id)}
          onChildren={(c) => setSub(f.id, c)}
        />
      ))}
    </ul>
  );
}

interface FieldRowProps {
  field: CollectionField;
  allCollections: MongoCollection[];
  selfId: string;
  depth: number;
  onPatch: (p: Partial<CollectionField>) => void;
  onAddSub: () => void;
  onRemove: () => void;
  onChildren: (next: CollectionField[]) => void;
}

function FieldRow({
  field,
  allCollections,
  selfId,
  depth,
  onPatch,
  onAddSub,
  onRemove,
  onChildren,
}: FieldRowProps) {
  const isNested = field.bsonType === "object" || field.bsonType === "array";

  return (
    <li
      className="relative border-t border-border/60 first:border-t-0"
      style={{ paddingLeft: depth * 12 }}
    >
      <div className="relative grid grid-cols-[1fr_auto_auto_auto] items-center gap-1.5 px-2 py-1 text-[11px]">
        {field.isReference ? (
          <>
            <Handle
              id={`${field.id}-l`}
              type="source"
              position={Position.Left}
              className="!h-2 !w-2 !border !border-border !bg-sky-400"
            />
            <Handle
              id={`${field.id}-r`}
              type="source"
              position={Position.Right}
              className="!h-2 !w-2 !border !border-border !bg-sky-400"
            />
          </>
        ) : null}
        <div className="flex min-w-0 items-center gap-1">
          {field.isReference ? (
            <Link2 className="h-3 w-3 text-sky-400" aria-label="reference" />
          ) : (
            <span aria-hidden className="text-muted-foreground font-mono text-[10px]">
              &quot;{field.name || "_"}&quot;:
            </span>
          )}
          <Input
            value={field.name}
            onChange={(e) => onPatch({ name: e.target.value })}
            aria-label="Field name"
            className="h-5 min-w-0 border-transparent bg-transparent px-1 text-[11px] focus-visible:border-input"
          />
        </div>
        <select
          value={field.bsonType}
          onChange={(e) => {
            const next = e.target.value;
            const patch: Partial<CollectionField> = { bsonType: next };
            if (next !== "object" && next !== "array") patch.fields = undefined;
            if (next !== "objectId") {
              patch.isReference = false;
              patch.referenceCollection = undefined;
            }
            onPatch(patch);
          }}
          aria-label="BSON type"
          className="bg-muted/40 text-foreground border-border focus-visible:ring-ring/50 h-5 max-w-[120px] truncate rounded-md border px-1 font-mono text-[10px] outline-none focus-visible:ring-2"
        >
          {BSON_TYPES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        {/* Reference picker — only enabled for ObjectId fields. */}
        {field.bsonType === "objectId" ? (
          <select
            value={field.isReference ? field.referenceCollection ?? "" : ""}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) {
                onPatch({ isReference: false, referenceCollection: undefined });
              } else {
                onPatch({ isReference: true, referenceCollection: v });
              }
            }}
            aria-label="Reference target collection"
            className="bg-muted/40 text-foreground border-border focus-visible:ring-ring/50 h-5 max-w-[120px] truncate rounded-md border px-1 font-mono text-[10px] outline-none focus-visible:ring-2"
          >
            <option value="">no ref</option>
            {allCollections
              .filter((c) => c.id !== selfId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  → {c.name}
                </option>
              ))}
          </select>
        ) : (
          <span aria-hidden />
        )}
        <div className="flex items-center gap-0.5">
          {isNested ? (
            <button
              type="button"
              aria-label="Add nested field"
              onClick={onAddSub}
              className="text-muted-foreground hover:text-foreground inline-flex h-4 w-4 items-center justify-center rounded-md"
            >
              <Plus className="h-3 w-3" />
            </button>
          ) : null}
          <button
            type="button"
            aria-label="Remove field"
            onClick={onRemove}
            className="text-muted-foreground hover:text-destructive inline-flex h-4 w-4 items-center justify-center rounded-md"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
      {isNested && field.fields && field.fields.length > 0 ? (
        <FieldList
          fields={field.fields}
          allCollections={allCollections}
          selfId={selfId}
          onChange={onChildren}
          depth={depth + 1}
        />
      ) : null}
    </li>
  );
}

export const CollectionNode = memo(CollectionNodeBase);
