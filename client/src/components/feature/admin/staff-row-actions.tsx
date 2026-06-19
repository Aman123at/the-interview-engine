"use client";

import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  onEdit: () => void;
  onDelete: () => void;
  busy?: boolean;
}

export function StaffRowActions({ onEdit, onDelete, busy }: Props) {
  return (
    <div className="flex justify-end gap-1">
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Edit"
        onClick={onEdit}
        disabled={busy}
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Delete"
        onClick={onDelete}
        disabled={busy}
        className="text-destructive hover:text-destructive"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
