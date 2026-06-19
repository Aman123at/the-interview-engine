"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  captureCanvasJpeg,
  captureCanvasPng,
  downloadDataUrl,
  resolveCanvasBackground,
} from "./canvas-export";

interface ExportMenuProps {
  wrapperRef: { current: HTMLDivElement | null };
  /** Used in the download filename. */
  kind: "db" | "system";
}

/**
 * A small popover offering PNG / JPG download of the canvas. The popover is a
 * plain inline panel — keeping it simple sidesteps the focus-trap issues a
 * full dialog would introduce inside a flow surface.
 */
export function ExportMenu({ wrapperRef, kind }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<null | "png" | "jpg">(null);

  async function run(format: "png" | "jpg") {
    setBusy(format);
    try {
      const bg = resolveCanvasBackground();
      const data =
        format === "png"
          ? await captureCanvasPng(wrapperRef.current, { background: bg })
          : await captureCanvasJpeg(wrapperRef.current, { background: bg });
      if (!data) return;
      downloadDataUrl(data, `${kind}-design.${format}`);
      setOpen(false);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="relative">
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden />
        Download
      </Button>
      {open ? (
        <div
          role="menu"
          className={cn(
            "bg-popover text-popover-foreground border-border/60 absolute right-0 top-9 z-20 flex w-32 flex-col gap-1 rounded-md border p-1 shadow-md",
          )}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => void run("png")}
            disabled={busy !== null}
            className="hover:bg-accent/60 inline-flex items-center justify-between rounded-md px-2 py-1 text-xs"
          >
            PNG
            {busy === "png" ? (
              <span className="text-muted-foreground text-[10px]">…</span>
            ) : null}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => void run("jpg")}
            disabled={busy !== null}
            className="hover:bg-accent/60 inline-flex items-center justify-between rounded-md px-2 py-1 text-xs"
          >
            JPG
            {busy === "jpg" ? (
              <span className="text-muted-foreground text-[10px]">…</span>
            ) : null}
          </button>
        </div>
      ) : null}
    </div>
  );
}
