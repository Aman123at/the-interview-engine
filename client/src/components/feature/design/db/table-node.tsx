"use client";

import { memo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  Key,
  KeyRound,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { dataTypesFor } from "./dialects";
import type { RelationalColumn, RelationalTable } from "./types";
import { nextId } from "./types";

export type TableNodeData = {
  table: RelationalTable;
  engine: "postgresql" | "mysql";
  onChange: (table: RelationalTable) => void;
  onDelete: (id: string) => void;
};

/**
 * React Flow custom node — a relational TABLE. Renders a header (table name)
 * + one row per column. Each column with PK or FK exposes left/right
 * connection handles so the user can draw a foreign-key edge between them.
 *
 * The node is strictly structured: no free text outside the column editor,
 * no freehand. All edits happen inline; the dropdown for datatypes is
 * dialect-aware (postgres vs mysql).
 */
function TableNodeBase({ data, selected }: NodeProps) {
  const { table, engine, onChange, onDelete } = data as TableNodeData;
  const [expanded, setExpanded] = useState(true);

  function setName(name: string) {
    onChange({ ...table, name });
  }
  function patchColumn(id: string, patch: Partial<RelationalColumn>) {
    onChange({
      ...table,
      columns: table.columns.map((c) =>
        c.id === id ? { ...c, ...patch } : c,
      ),
    });
  }
  function addColumn() {
    const col: RelationalColumn = {
      id: nextId("col"),
      name: `column_${table.columns.length + 1}`,
      dataType: engine === "postgresql" ? "text" : "VARCHAR(255)",
    };
    onChange({ ...table, columns: [...table.columns, col] });
  }
  function removeColumn(id: string) {
    onChange({
      ...table,
      columns: table.columns.filter((c) => c.id !== id),
    });
  }
  function moveColumn(id: string, dir: -1 | 1) {
    const idx = table.columns.findIndex((c) => c.id === id);
    if (idx < 0) return;
    const next = idx + dir;
    if (next < 0 || next >= table.columns.length) return;
    const rows = [...table.columns];
    const [moved] = rows.splice(idx, 1);
    rows.splice(next, 0, moved);
    onChange({ ...table, columns: rows });
  }

  return (
    <div
      className={cn(
        "min-w-[260px] overflow-hidden rounded-md border border-border bg-card text-card-foreground shadow-sm",
        "ring-offset-background transition-shadow",
        selected && "ring-primary/40 ring-2",
      )}
    >
      <div className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-2 py-1.5">
        <GripVertical
          className="text-muted-foreground h-3.5 w-3.5 shrink-0 cursor-grab"
          aria-hidden
        />
        <Input
          value={table.name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Table name"
          className="h-6 min-w-0 flex-1 border-transparent bg-transparent px-1 text-xs font-semibold focus-visible:border-input"
        />
        <button
          type="button"
          aria-label={expanded ? "Collapse columns" : "Expand columns"}
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
          aria-label="Delete table"
          className="text-muted-foreground hover:text-destructive inline-flex h-5 w-5 items-center justify-center rounded-md"
          onClick={() => onDelete(table.id)}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>

      {expanded ? (
        <ul className="m-0 flex flex-col p-0">
          {table.columns.map((col, i) => (
            <ColumnRow
              key={col.id}
              column={col}
              engine={engine}
              first={i === 0}
              last={i === table.columns.length - 1}
              onPatch={(p) => patchColumn(col.id, p)}
              onMove={(d) => moveColumn(col.id, d)}
              onRemove={() => removeColumn(col.id)}
            />
          ))}
          <li className="border-t border-border bg-muted/20 px-2 py-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 w-full justify-start text-[11px]"
              onClick={addColumn}
            >
              <Plus className="mr-1 h-3 w-3" aria-hidden />
              Add column
            </Button>
          </li>
        </ul>
      ) : null}
    </div>
  );
}

interface ColumnRowProps {
  column: RelationalColumn;
  engine: "postgresql" | "mysql";
  first: boolean;
  last: boolean;
  onPatch: (p: Partial<RelationalColumn>) => void;
  onMove: (d: -1 | 1) => void;
  onRemove: () => void;
}

function ColumnRow({
  column,
  engine,
  first,
  last,
  onPatch,
  onMove,
  onRemove,
}: ColumnRowProps) {
  const types = dataTypesFor(engine);
  const handlesVisible = !!column.isPrimaryKey || !!column.isForeignKey;
  return (
    <li
      className={cn(
        "relative grid grid-cols-[16px_1fr_auto_auto_auto] items-center gap-1.5 border-t border-border/60 px-2 py-1 text-[11px]",
        first && "border-t-0",
      )}
    >
      {/* Drag handles for PK/FK columns — left = "source/target", right = same.
         React Flow ignores hidden handles for connection start but they're
         still drawn; we conditionally render to keep the canvas tidy. */}
      {handlesVisible ? (
        <>
          <Handle
            id={`${column.id}-l`}
            type="source"
            position={Position.Left}
            className={cn(
              "!h-2 !w-2 !border !border-border !bg-background",
              column.isPrimaryKey ? "!bg-amber-400" : "!bg-sky-400",
            )}
          />
          <Handle
            id={`${column.id}-r`}
            type="source"
            position={Position.Right}
            className={cn(
              "!h-2 !w-2 !border !border-border !bg-background",
              column.isPrimaryKey ? "!bg-amber-400" : "!bg-sky-400",
            )}
          />
        </>
      ) : null}

      {column.isPrimaryKey ? (
        <KeyRound
          className="h-3 w-3 text-amber-400"
          aria-label="primary key"
        />
      ) : column.isForeignKey ? (
        <Key
          className="h-3 w-3 text-sky-400"
          aria-label="foreign key"
        />
      ) : (
        <span aria-hidden />
      )}
      <Input
        value={column.name}
        onChange={(e) => onPatch({ name: e.target.value })}
        aria-label="Column name"
        className="h-5 min-w-0 border-transparent bg-transparent px-1 text-[11px] focus-visible:border-input"
      />
      <select
        value={column.dataType}
        onChange={(e) => onPatch({ dataType: e.target.value })}
        aria-label="Data type"
        className="bg-muted/40 text-foreground border-border focus-visible:ring-ring/50 h-5 max-w-[140px] truncate rounded-md border px-1 font-mono text-[10px] outline-none focus-visible:ring-2"
      >
        {types.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
        {types.every((t) => t.id !== column.dataType) ? (
          <option value={column.dataType}>{column.dataType}</option>
        ) : null}
      </select>
      <div className="flex items-center gap-0.5">
        <FlagButton
          label="PK"
          tone="amber"
          active={!!column.isPrimaryKey}
          onClick={() =>
            onPatch({
              isPrimaryKey: !column.isPrimaryKey,
              // PK columns are implicitly unique + not null.
              isUnique: !column.isPrimaryKey ? true : column.isUnique,
              isNullable: !column.isPrimaryKey ? false : column.isNullable,
            })
          }
        />
        <FlagButton
          label="FK"
          tone="sky"
          active={!!column.isForeignKey}
          onClick={() => onPatch({ isForeignKey: !column.isForeignKey })}
        />
        <FlagButton
          label="UQ"
          tone="violet"
          active={!!column.isUnique}
          onClick={() => onPatch({ isUnique: !column.isUnique })}
        />
        <FlagButton
          label="NN"
          tone="emerald"
          // NN = NOT NULL: active when isNullable is false (or undefined,
          // since the default is non-null in most engines for new columns).
          active={!column.isNullable}
          onClick={() => onPatch({ isNullable: !column.isNullable })}
        />
      </div>
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          aria-label="Move column up"
          disabled={first}
          onClick={() => onMove(-1)}
          className="text-muted-foreground hover:text-foreground inline-flex h-4 w-4 items-center justify-center rounded-md disabled:opacity-30"
        >
          <ChevronUp className="h-3 w-3" />
        </button>
        <button
          type="button"
          aria-label="Move column down"
          disabled={last}
          onClick={() => onMove(1)}
          className="text-muted-foreground hover:text-foreground inline-flex h-4 w-4 items-center justify-center rounded-md disabled:opacity-30"
        >
          <ChevronDown className="h-3 w-3" />
        </button>
        <button
          type="button"
          aria-label="Remove column"
          onClick={onRemove}
          className="text-muted-foreground hover:text-destructive inline-flex h-4 w-4 items-center justify-center rounded-md"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </li>
  );
}

function FlagButton({
  label,
  tone,
  active,
  onClick,
}: {
  label: string;
  tone: "amber" | "sky" | "violet" | "emerald";
  active: boolean;
  onClick: () => void;
}) {
  const toneCls =
    tone === "amber"
      ? "data-[active=true]:bg-amber-400/15 data-[active=true]:text-amber-300 data-[active=true]:border-amber-400/40"
      : tone === "sky"
        ? "data-[active=true]:bg-sky-400/15 data-[active=true]:text-sky-300 data-[active=true]:border-sky-400/40"
        : tone === "violet"
          ? "data-[active=true]:bg-violet-400/15 data-[active=true]:text-violet-300 data-[active=true]:border-violet-400/40"
          : "data-[active=true]:bg-emerald-400/15 data-[active=true]:text-emerald-300 data-[active=true]:border-emerald-400/40";

  return (
    <button
      type="button"
      data-active={active}
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={cn(
        "text-muted-foreground hover:text-foreground border-border/60 inline-flex h-4 w-6 items-center justify-center rounded-md border font-mono text-[9px] uppercase",
        toneCls,
      )}
    >
      {label}
    </button>
  );
}

export const TableNode = memo(TableNodeBase);
