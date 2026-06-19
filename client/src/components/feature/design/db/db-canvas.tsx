"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RelationalCanvas } from "./relational-canvas";
import { MongoCanvas } from "./mongo-canvas";
import {
  captureCanvasPng,
  resolveCanvasBackground,
} from "./canvas-export";
import { hydrate, type DbCanvasModel } from "./types";
import type { DesignDbEngine } from "@/contracts";

interface DbCanvasProps {
  engine: DesignDbEngine;
  /** Raw document model from the server. */
  initialDocument: unknown;
  /** Push edits up to the autosave hook. */
  onChange: (next: DbCanvasModel) => void;
  /** Imperative hooks the parent grabs via ref — currently the thumbnail
   *  generator. */
  innerRef?: { current: DbCanvasHandle | null };
}

export interface DbCanvasHandle {
  /** Capture a small PNG of the current canvas, suitable as a gallery
   *  thumbnail (data URL). */
  captureThumbnail: () => Promise<string | null>;
}

/**
 * Mode-switching wrapper for the DB design canvas. Postgres / MySQL render
 * the relational table canvas; Mongo renders the JSON collection canvas.
 *
 * We hold the working model here so the engine switch and the canvases share
 * the same `onChange` source; the parent owns the document via useDesignDoc.
 */
export function DbCanvas({
  engine,
  initialDocument,
  onChange,
  innerRef,
}: DbCanvasProps) {
  // The canvas owns its working model. We seed it once from the server
  // payload; subsequent edits update local state synchronously AND bubble
  // up via onChange so `useDesignDoc`'s debounced PATCH stays the source
  // of persistence. We deliberately ignore later `initialDocument` changes
  // — they're just echoes of our own writes and would otherwise clobber
  // edits made while a save is in flight.
  const [model, setModel] = useState<DbCanvasModel>(() => hydrate(initialDocument));
  const captureRef = useRef<HTMLDivElement | null>(null);

  // Expose the thumbnail-capture helper via the parent's ref. Wired in an
  // effect to avoid mutating a ref during render.
  useEffect(() => {
    if (!innerRef) return;
    innerRef.current = {
      captureThumbnail: async () => {
        const bg = resolveCanvasBackground();
        return captureCanvasPng(captureRef.current, {
          background: bg,
          pixelRatio: 1,
          width: 480,
          height: 270,
        });
      },
    };
    return () => {
      if (innerRef) innerRef.current = null;
    };
  }, [innerRef]);

  const handleChange = useCallback(
    (next: DbCanvasModel) => {
      setModel(next);
      onChange(next);
    },
    [onChange],
  );

  if (engine === "mongodb") {
    return (
      <MongoCanvas
        model={model}
        onChange={handleChange}
        captureRef={captureRef}
      />
    );
  }
  return (
    <RelationalCanvas
      engine={engine}
      model={model}
      onChange={handleChange}
      captureRef={captureRef}
    />
  );
}
