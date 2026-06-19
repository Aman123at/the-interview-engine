"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import type {
  DesignDocKind,
  DesignDocumentDTO,
  UpdateDesignDocRequest,
} from "@/contracts";

interface UseDesignDocOptions {
  id: string;
  /**
   * Expected kind — if the loaded row's kind differs, the consumer should
   * route to the right canvas. Set so the hook can flag a redirect.
   */
  expectedKind?: DesignDocKind;
  /**
   * Debounce window for autosave PATCHes, in ms. Default 800 — feels live
   * without spamming the server while the user drags nodes.
   */
  debounceMs?: number;
}

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export interface UseDesignDoc {
  doc: DesignDocumentDTO | null;
  loading: boolean;
  error: string | null;
  /** Wrong-kind redirect signal — the page should bounce to the right route. */
  wrongKind: boolean;

  /** Save status of the document field (autosave + manual save share it). */
  status: SaveStatus;
  /** Set the in-memory document AND schedule a debounced autosave. */
  setDocument: (next: unknown) => void;
  /** Rename. Patches the server immediately (no debounce). */
  setTitle: (title: string) => Promise<void>;
  /** Force a manual save now (cancels pending debounce). */
  saveNow: () => Promise<void>;
  /** Update the thumbnail; usually fired on save by the canvas. */
  setThumbnail: (dataUrl: string | null) => Promise<void>;
}

/**
 * Owns the lifecycle of a single design document. Loads it via
 * `GET /design-docs/:id`, exposes the typed row, and routes mutations
 * through `PATCH /design-docs/:id` with debounced autosave on the document
 * body. Errors surface via `sonner` toasts AND the `status` field so the
 * page can render an inline indicator.
 */
export function useDesignDoc({
  id,
  expectedKind,
  debounceMs = 800,
}: UseDesignDocOptions): UseDesignDoc {
  const [doc, setDoc] = useState<DesignDocumentDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wrongKind, setWrongKind] = useState(false);
  const [status, setStatus] = useState<SaveStatus>("idle");

  // Pending document payload (waiting to flush) + debounce timer.
  const pendingRef = useRef<unknown | undefined>(undefined);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True while a PATCH is in flight — used to coalesce duplicate flushes.
  const inflightRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await api.designDocs.get(id);
        if (cancelled) return;
        if (expectedKind && res.document.kind !== expectedKind) {
          setWrongKind(true);
          return;
        }
        setDoc(res.document);
        setStatus("idle");
      } catch (e) {
        if (cancelled) return;
        setError(
          e instanceof ApiError ? e.body?.message ?? e.message : "Couldn't load.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [id, expectedKind]);

  const flush = useCallback(async () => {
    if (inflightRef.current) return;
    const body: UpdateDesignDocRequest = {};
    if (pendingRef.current !== undefined) body.document = pendingRef.current;
    if (body.document === undefined) return;
    inflightRef.current = true;
    setStatus("saving");
    const pendingSnap = pendingRef.current;
    try {
      const res = await api.designDocs.update(id, body);
      // Only clear pending if no NEW edits arrived during the request.
      if (pendingRef.current === pendingSnap) {
        pendingRef.current = undefined;
        setStatus("saved");
      } else {
        setStatus("dirty");
      }
      setDoc(res.document);
    } catch (e) {
      setStatus("error");
      const msg =
        e instanceof ApiError ? e.body?.message ?? e.message : "Save failed.";
      toast.error("Couldn't save", { description: msg });
    } finally {
      inflightRef.current = false;
      // If new edits arrived mid-flight, schedule another flush.
      if (pendingRef.current !== undefined) {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => void flush(), debounceMs);
      }
    }
  }, [id, debounceMs]);

  const setDocument = useCallback(
    (next: unknown) => {
      pendingRef.current = next;
      setStatus("dirty");
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void flush(), debounceMs);
    },
    [flush, debounceMs],
  );

  const saveNow = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    await flush();
  }, [flush]);

  const setTitle = useCallback(
    async (title: string) => {
      try {
        const res = await api.designDocs.update(id, { title });
        setDoc(res.document);
      } catch (e) {
        const msg =
          e instanceof ApiError
            ? e.body?.message ?? e.message
            : "Rename failed.";
        toast.error("Couldn't rename", { description: msg });
      }
    },
    [id],
  );

  const setThumbnail = useCallback(
    async (dataUrl: string | null) => {
      try {
        const res = await api.designDocs.update(id, { thumbnail: dataUrl });
        setDoc(res.document);
      } catch {
        /* thumbnail saves are best-effort; ignore */
      }
    },
    [id],
  );

  return {
    doc,
    loading,
    error,
    wrongKind,
    status,
    setDocument,
    setTitle,
    saveNow,
    setThumbnail,
  };
}
