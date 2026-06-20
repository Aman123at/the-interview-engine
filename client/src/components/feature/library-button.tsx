"use client";

import { Book } from "lucide-react";
import { cn } from "@/lib/utils";

interface LibraryButtonProps {
  className?: string;
}

/** Opens /library in a new tab. The library is public — no auth required. */
export function LibraryButton({ className }: LibraryButtonProps) {
  return (
    <button
      type="button"
      onClick={() => window.open("/library", "_blank", "noopener,noreferrer")}
      className={cn(
        "inline-flex items-center gap-2 rounded-[10px] border border-bd-2 px-3.5 py-[9px] text-[13px] font-medium text-t-mid transition-colors hover:bg-panel-2 hover:text-t-hi",
        className,
      )}
    >
      <Book className="h-4 w-4" aria-hidden />
      Access Component Library
    </button>
  );
}
