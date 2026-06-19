"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { KvRow } from "@/types/api-client";

interface KvEditorProps {
  rows: KvRow[];
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  onPatch: (index: number, patch: Partial<KvRow>) => void;
  onRemove: (index: number) => void;
}

export function KvEditor({
  rows,
  keyPlaceholder = "key",
  valuePlaceholder = "value",
  onPatch,
  onRemove,
}: KvEditorProps) {
  return (
    <div className="flex flex-col">
      <div className="text-muted-foreground border-border/60 grid shrink-0 grid-cols-[auto_minmax(0,1fr)_minmax(0,1.5fr)_auto] items-center gap-2 border-b px-2 py-1 text-[10px] uppercase tracking-wider">
        <span aria-hidden className="w-4" />
        <span>Key</span>
        <span>Value</span>
        <span aria-hidden className="w-7" />
      </div>
      <div className="flex flex-col">
        {rows.map((row, i) => {
          const isLastBlank =
            i === rows.length - 1 && !row.key && !row.value;
          return (
            <div
              key={row.id}
              className="border-border/60 grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1.5fr)_auto] items-center gap-2 border-b px-2 py-1"
            >
              <Checkbox
                checked={row.enabled}
                onCheckedChange={(v) => onPatch(i, { enabled: v === true })}
                disabled={isLastBlank}
                aria-label="Enabled"
              />
              <Input
                value={row.key}
                onChange={(e) => onPatch(i, { key: e.target.value })}
                placeholder={keyPlaceholder}
                className="h-7 border-0 bg-transparent px-1 font-mono text-xs shadow-none focus-visible:ring-0"
              />
              <Input
                value={row.value}
                onChange={(e) => onPatch(i, { value: e.target.value })}
                placeholder={valuePlaceholder}
                className="h-7 border-0 bg-transparent px-1 font-mono text-xs shadow-none focus-visible:ring-0"
              />
              <Button
                variant="ghost"
                size="icon-sm"
                className="h-6 w-6 opacity-60 hover:opacity-100"
                aria-label="Remove row"
                onClick={() => onRemove(i)}
                disabled={isLastBlank}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
