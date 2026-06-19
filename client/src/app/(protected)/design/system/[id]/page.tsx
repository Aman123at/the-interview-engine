"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Download, Loader2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DesignCanvasChrome } from "@/components/feature/design/design-canvas-chrome";
import {
  SystemCanvas,
  type SystemCanvasHandle,
  type RemotePeer,
} from "@/components/feature/design/system/system-canvas";
import { ShareDesignDialog } from "@/components/feature/design/system/share-design-dialog";
import { useDesignDoc } from "@/lib/hooks/use-design-doc";
import { useDesignRoom } from "@/lib/hooks/use-design-room";
import { cn } from "@/lib/utils";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Phase 21 — freeform System Design canvas at `/design/system/[id]`.
 * Excalidraw owns the drawing surface; the stencil palette inserts bindable
 * infra-component rectangles. Lifecycle (load → debounced autosave → manual
 * save with thumbnail → reload) goes through `useDesignDoc`.
 */
export default function SystemDesignPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const doc = useDesignDoc({ id, expectedKind: "system_design" });
  const [manualSaving, setManualSaving] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  // Local mirror of the share token — driven by both the loaded doc and the
  // dialog's mint/revoke. We never refetch the doc when sharing toggles.
  const [shareToken, setShareToken] = useState<string | null>(null);
  useEffect(() => {
    setShareToken(doc.doc?.shareToken ?? null);
  }, [doc.doc?.shareToken]);
  const canvasHandle = useRef<SystemCanvasHandle | null>(null);

  // Multi-user room — joined as the OWNER (no shareToken). Only meaningful
  // once the doc is loaded. The hook is a no-op until `enabled` is true.
  const room = useDesignRoom({
    docId: id,
    enabled: !doc.loading && !!doc.doc && !doc.wrongKind,
    canvasHandleRef: canvasHandle,
  });

  useEffect(() => {
    if (doc.wrongKind) {
      router.replace(`/design/db/${id}`);
    }
  }, [doc.wrongKind, id, router]);

  if (doc.loading || doc.wrongKind) {
    return (
      <div className="text-muted-foreground flex h-[100dvh] flex-1 items-center justify-center gap-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading design…
      </div>
    );
  }

  if (doc.error || !doc.doc) {
    return (
      <div className="flex h-[100dvh] flex-1 items-center justify-center px-6">
        <div className="border-destructive/30 bg-destructive/5 flex max-w-md flex-col items-start gap-3 rounded-lg border p-6">
          <div className="flex items-center gap-2">
            <AlertTriangle className="text-destructive h-4 w-4" aria-hidden />
            <p className="text-foreground text-sm font-medium">
              Couldn&apos;t load this design
            </p>
          </div>
          <p className="text-muted-foreground text-xs">
            {doc.error ?? "The document is missing or you don't have access."}
          </p>
          <Button size="sm" variant="outline" onClick={() => router.replace("/dashboard")}>
            Back to dashboard
          </Button>
        </div>
      </div>
    );
  }

  async function manualSave() {
    setManualSaving(true);
    try {
      const thumb = await canvasHandle.current?.captureThumbnail();
      if (thumb) void doc.setThumbnail(thumb);
      await doc.saveNow();
    } finally {
      setManualSaving(false);
    }
  }

  return (
    <DesignCanvasChrome
      docId={doc.doc.id}
      title={doc.doc.title}
      status={doc.status}
      saving={manualSaving}
      onSave={manualSave}
      onRename={doc.setTitle}
      rightSlot={
        <span className="border-border/60 bg-muted/40 text-muted-foreground inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 font-mono text-[10px] uppercase">
          Freeform
        </span>
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="border-border/60 flex shrink-0 items-center justify-end gap-2 border-b px-3 py-1.5">
          <PeerBadge peers={room.peers} />
          <Button
            size="sm"
            variant={shareToken ? "secondary" : "outline"}
            onClick={() => setShareOpen(true)}
          >
            <Users className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            {shareToken ? "Sharing" : "Share"}
          </Button>
          <DownloadMenu handleRef={canvasHandle} />
        </div>
        <div className="min-h-0 flex-1">
          <SystemCanvasOwner
            initialDocument={doc.doc.document}
            setDocument={doc.setDocument}
            sendScene={room.sendScene}
            sendCursor={room.sendCursor}
            peers={room.peers}
            canvasHandle={canvasHandle}
          />
        </div>
      </div>
      <ShareDesignDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        docId={id}
        initialToken={shareToken}
        onTokenChange={setShareToken}
      />
    </DesignCanvasChrome>
  );
}

/**
 * Tiny wrapper that owns a STABLE onChange so SystemCanvas (which memoizes
 * handleChange against `onChange`) doesn't see a fresh prop every parent
 * render. Re-renders from peer cursor/presence updates would otherwise keep
 * recomputing the Excalidraw onChange binding and flood it with renders.
 */
function SystemCanvasOwner({
  initialDocument,
  setDocument,
  sendScene,
  sendCursor,
  peers,
  canvasHandle,
}: {
  initialDocument: unknown;
  setDocument: (next: unknown) => void;
  sendScene: (next: unknown) => void;
  sendCursor: (x: number | null, y: number | null) => void;
  peers: RemotePeer[];
  canvasHandle: { current: SystemCanvasHandle | null };
}) {
  // Keep the latest callbacks in refs so onChange is referentially stable.
  const setDocumentRef = useRef(setDocument);
  const sendSceneRef = useRef(sendScene);
  useEffect(() => {
    setDocumentRef.current = setDocument;
    sendSceneRef.current = sendScene;
  }, [setDocument, sendScene]);

  const onChange = useCallback((next: unknown) => {
    setDocumentRef.current(next);
    sendSceneRef.current(next);
  }, []);

  return (
    <SystemCanvas
      initialDocument={initialDocument}
      onChange={onChange}
      innerRef={canvasHandle}
      onPointerMove={sendCursor}
      peers={peers}
    />
  );
}

/** "x / N" peer count chip — only renders when more than the owner is in. */
function PeerBadge({ peers }: { peers: RemotePeer[] }) {
  if (peers.length === 0) return null;
  return (
    <div className="border-border/60 bg-muted/40 text-muted-foreground hidden items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] sm:flex">
      <Users className="h-3 w-3" aria-hidden />
      <span>
        {peers.length} {peers.length === 1 ? "guest" : "guests"} editing
      </span>
      <div className="ml-1 flex -space-x-1">
        {peers.slice(0, 4).map((p) => (
          <span
            key={p.peerId}
            title={p.name}
            className="ring-background h-3 w-3 rounded-full ring-2"
            style={{ background: p.color }}
            aria-hidden
          />
        ))}
      </div>
    </div>
  );
}

/** Small dropdown that mirrors the DB canvas's ExportMenu UX. */
function DownloadMenu({
  handleRef,
}: {
  handleRef: { current: SystemCanvasHandle | null };
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<null | "png" | "jpg">(null);

  async function run(format: "png" | "jpg") {
    setBusy(format);
    try {
      await handleRef.current?.download(format);
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
