"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { useTheme } from "next-themes";
import "@excalidraw/excalidraw/index.css";
import {
  convertToExcalidrawElements,
  exportToBlob,
  viewportCoordsToSceneCoords,
} from "@excalidraw/excalidraw";
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { StencilPalette, STENCIL_DRAG_MIME } from "./stencil-palette";
import { stencilById, type StencilId } from "./stencils";
import defaultLibraryFile from "./default-library.json";
import drwnioLibraryFile from "./drwnio-library.json";
import dbEngLibraryFile from "./db-eng-library.json";
import gadgetsLibraryFile from "./gadgets-library.json";

// Bundled Excalidraw libraries — show up in the canvas's built-in library
// panel by default so candidates have ready-made shapes (databases, servers,
// devices, network gear, etc.) without importing anything. The .excalidrawlib
// v1 format stores each item as an array of elements, which is exactly what
// Excalidraw's `initialData.libraryItems` accepts.
function readLibrary(file: unknown): ExcalidrawElement[][] {
  return ((file as { library?: ExcalidrawElement[][] }).library) ?? [];
}
const DEFAULT_LIBRARY_ITEMS: ExcalidrawElement[][] = [
  ...readLibrary(defaultLibraryFile),
  ...readLibrary(drwnioLibraryFile),
  ...readLibrary(dbEngLibraryFile),
  ...readLibrary(gadgetsLibraryFile),
];

// Excalidraw is a heavy lib (and reads `window` at import time). Load it
// client-only via next/dynamic so the route's static optimization holds and
// SSR doesn't crash on the missing browser globals.
const Excalidraw = dynamic(
  async () => {
    const mod = await import("@excalidraw/excalidraw");
    return mod.Excalidraw;
  },
  {
    ssr: false,
    loading: () => (
      <div className="text-muted-foreground flex h-full items-center justify-center gap-2 text-xs">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading canvas…
      </div>
    ),
  },
);

/** The persisted scene shape — a thin projection of Excalidraw's runtime
 *  state. Stored under the contract's `SystemDesignDocument.document`. */
export interface SystemSceneModel {
  version: 1;
  elements: readonly ExcalidrawElement[];
  appState?: Partial<AppState>;
  files?: BinaryFiles;
}

export interface SystemCanvasHandle {
  /** Capture a 480×270 PNG of the current scene for the gallery card. */
  captureThumbnail: () => Promise<string | null>;
  /** Download the canvas as PNG or JPG. */
  download: (format: "png" | "jpg") => Promise<void>;
  /**
   * Hydrate the scene from a remote peer's snapshot. Idempotent; the canvas
   * suppresses the resulting `handleChange` so we don't bounce the change
   * back to the network.
   */
  applyRemoteScene: (next: { elements?: unknown; appState?: unknown; files?: unknown }) => void;
}

/** Remote peer overlay for multi-user share. */
export interface RemotePeer {
  peerId: string;
  name: string;
  color: string;
  /** Last-known cursor in SCENE coords; null means "off-canvas". */
  x: number | null;
  y: number | null;
}

interface SystemCanvasProps {
  initialDocument: unknown;
  onChange: (next: SystemSceneModel) => void;
  innerRef?: { current: SystemCanvasHandle | null };
  /**
   * If set, the canvas streams local pointer SCENE coords on movement (with
   * built-in throttling) and renders an overlay for every entry in `peers`.
   * `null` x/y → hide that peer's cursor (off-canvas).
   */
  onPointerMove?: (x: number | null, y: number | null) => void;
  peers?: RemotePeer[];
}

/**
 * Excalidraw-backed freeform canvas (eraser.io feel — chosen over tldraw to
 * match the prompt's default + to use Excalidraw's clean exportToBlob path).
 *
 * Stencil drops: HTML5 drag/drop. The palette puts the stencil id on
 * dataTransfer; this canvas reads it in `onDrop`, projects the cursor into
 * scene coords via Excalidraw's `viewportCoordsToSceneCoords`, then mutates
 * the scene via the imperative API. Inserted shapes are real Excalidraw
 * rectangles with a bound text label — arrow binding, selection, and theme
 * application all work via the library's own primitives.
 *
 * Persistence: every `onChange` emits a projected `SystemSceneModel` upstream
 * for the autosave hook to PATCH. We strip transient appState fields
 * (selection ids, cursor, collaborators) so reload restores the document
 * without the editing scaffolding.
 */
export function SystemCanvas({
  initialDocument,
  onChange,
  innerRef,
  onPointerMove,
  peers,
}: SystemCanvasProps) {
  const { resolvedTheme } = useTheme();
  const [apiReady, setApiReady] = useState(false);
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  // Track the most recent files map so PNG/JPG export can resolve images.
  const filesRef = useRef<BinaryFiles>({});
  // When applying a remote snapshot we suppress the next handleChange so the
  // edit doesn't bounce back across the network (and stomp newer local input).
  const suppressNextChangeRef = useRef(false);

  const initial = useMemo(() => projectInitial(initialDocument), [
    initialDocument,
  ]);

  // --- Imperative API hookup ----------------------------------------------

  useEffect(() => {
    if (!innerRef) return;
    innerRef.current = {
      captureThumbnail: () => exportCurrent("png", { width: 480, height: 270 }),
      download: (format) => downloadCurrent(format),
      applyRemoteScene: (next) => {
        const api = apiRef.current;
        if (!api) return;
        suppressNextChangeRef.current = true;
        try {
          api.updateScene({
            // Replace elements with the remote snapshot when provided.
            ...(Array.isArray(next.elements)
              ? { elements: next.elements as readonly ExcalidrawElement[] }
              : {}),
            // Don't apply remote appState (zoom, scroll) — every peer keeps
            // their own viewport. We DO apply files so newly-added images
            // resolve.
            ...(next.files ? { files: next.files as BinaryFiles } : {}),
          });
        } catch {
          /* malformed remote scene; ignore */
        } finally {
          // Excalidraw fires onChange asynchronously after updateScene; clear
          // the suppression flag on the next macrotask so only THIS update is
          // dropped (not subsequent local edits).
          setTimeout(() => {
            suppressNextChangeRef.current = false;
          }, 0);
        }
      },
    };
    return () => {
      if (innerRef) innerRef.current = null;
    };
    // The handles only need to capture the same closures across the lifetime
    // of this component; the closures themselves read from refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [innerRef]);

  // --- Scene persistence --------------------------------------------------

  const lastSerializedRef = useRef<string>("");
  const handleChange = useCallback(
    (
      elements: readonly ExcalidrawElement[],
      appState: AppState,
      files: BinaryFiles,
    ) => {
      filesRef.current = files;
      // A scene update triggered by `applyRemoteScene` already came from the
      // network — don't loop it back as a local change.
      if (suppressNextChangeRef.current) return;
      const projected = projectScene(elements, appState, files);
      // Cheap stringify-diff so unrelated app-state churn (mouse position,
      // selection ticks) doesn't trigger a server PATCH.
      const next = JSON.stringify({
        elements: projected.elements,
        files: projected.files,
        appState: projected.appState,
      });
      if (next === lastSerializedRef.current) return;
      lastSerializedRef.current = next;
      onChange(projected);
    },
    [onChange],
  );

  // --- Pointer broadcast (multi-user share) --------------------------------

  const pointerStateRef = useRef<{
    last: number;
    rafId: number | null;
    next: { x: number; y: number } | null;
  }>({ last: 0, rafId: null, next: null });

  function emitPointer(x: number | null, y: number | null) {
    if (!onPointerMove) return;
    onPointerMove(x, y);
  }

  function onMouseMove(e: ReactMouseEvent<HTMLDivElement>) {
    if (!onPointerMove) return;
    const api = apiRef.current;
    const wrapper = wrapperRef.current;
    if (!api || !wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    const appState = api.getAppState();
    const { x, y } = viewportCoordsToSceneCoords(
      { clientX: e.clientX, clientY: e.clientY },
      {
        zoom: appState.zoom,
        offsetLeft: rect.left,
        offsetTop: rect.top,
        scrollX: appState.scrollX,
        scrollY: appState.scrollY,
      },
    );
    // ~60Hz upper bound — coalesce burst events into the next rAF.
    pointerStateRef.current.next = { x, y };
    if (pointerStateRef.current.rafId !== null) return;
    pointerStateRef.current.rafId = requestAnimationFrame(() => {
      pointerStateRef.current.rafId = null;
      const n = pointerStateRef.current.next;
      pointerStateRef.current.next = null;
      if (n) emitPointer(n.x, n.y);
    });
  }

  function onMouseLeave() {
    if (!onPointerMove) return;
    if (pointerStateRef.current.rafId !== null) {
      cancelAnimationFrame(pointerStateRef.current.rafId);
      pointerStateRef.current.rafId = null;
    }
    emitPointer(null, null);
  }

  // --- Drop handling -------------------------------------------------------

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    if (e.dataTransfer.types.includes(STENCIL_DRAG_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    const id = e.dataTransfer.getData(STENCIL_DRAG_MIME) as StencilId;
    if (!id) return;
    e.preventDefault();
    const api = apiRef.current;
    if (!api) return;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    const appState = api.getAppState();
    const { x, y } = viewportCoordsToSceneCoords(
      { clientX: e.clientX, clientY: e.clientY },
      {
        zoom: appState.zoom,
        // viewportCoordsToSceneCoords reads page-absolute offsets, not
        // wrapper-relative — pass the wrapper rect so the drop lands under
        // the cursor regardless of where the canvas sits on the page.
        offsetLeft: rect.left,
        offsetTop: rect.top,
        scrollX: appState.scrollX,
        scrollY: appState.scrollY,
      },
    );
    insertStencil(id, x, y);
  }

  function insertStencilCentered(id: StencilId) {
    const api = apiRef.current;
    if (!api) return;
    const appState = api.getAppState();
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    const { x, y } = viewportCoordsToSceneCoords(
      {
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      },
      {
        zoom: appState.zoom,
        offsetLeft: rect.left,
        offsetTop: rect.top,
        scrollX: appState.scrollX,
        scrollY: appState.scrollY,
      },
    );
    insertStencil(id, x, y);
  }

  function insertStencil(id: StencilId, sceneX: number, sceneY: number) {
    const api = apiRef.current;
    if (!api) return;
    const stencil = stencilById(id);
    if (!stencil) return;
    // Spawn centered at the drop point — Excalidraw skeletons use top-left
    // coords, so offset by half the stencil's size.
    const x = sceneX - stencil.width / 2;
    const y = sceneY - stencil.height / 2;

    const newElements = convertToExcalidrawElements([
      {
        type: "rectangle",
        x,
        y,
        width: stencil.width,
        height: stencil.height,
        backgroundColor: stencil.backgroundColor,
        strokeColor: stencil.strokeColor,
        fillStyle: "solid",
        strokeWidth: 2,
        roundness: { type: 3 },
        label: {
          text: stencil.label,
          fontSize: 18,
          strokeColor: stencil.strokeColor,
        },
        // Tag for any future "find stencil instances" tooling.
        customData: { stencilId: stencil.id },
      },
    ]);

    const current = api.getSceneElements();
    api.updateScene({
      // updateScene accepts the full list; concat keeps existing scene intact.
      elements: [...current, ...newElements],
    });
    // Select the new shape so arrow-drag is immediate.
    const insertedRect = newElements.find((el) => el.type === "rectangle");
    if (insertedRect) {
      api.updateScene({
        appState: { selectedElementIds: { [insertedRect.id]: true } },
      });
    }
  }

  // --- Export -------------------------------------------------------------

  async function exportCurrent(
    format: "png" | "jpg",
    dim?: { width: number; height: number },
  ): Promise<string | null> {
    const api = apiRef.current;
    if (!api) return null;
    const elements = api.getSceneElements();
    if (elements.length === 0) return null;
    const appState = api.getAppState();
    const files = filesRef.current;
    try {
      const blob = await exportToBlob({
        elements,
        appState: {
          ...appState,
          exportBackground: true,
          exportWithDarkMode: resolvedTheme === "dark",
        },
        files,
        mimeType: format === "png" ? "image/png" : "image/jpeg",
        quality: 0.92,
        ...(dim ? { getDimensions: () => ({ ...dim, scale: 1 }) } : {}),
      });
      return await blobToDataUrl(blob);
    } catch (e) {
      console.error("[system-canvas] export failed", e);
      return null;
    }
  }

  async function downloadCurrent(format: "png" | "jpg") {
    const dataUrl = await exportCurrent(format);
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `system-design.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // ------------------------------------------------------------------------

  return (
    <div className="relative flex h-full min-h-0 w-full">
      <StencilPalette onInsert={insertStencilCentered} />
      <div
        ref={wrapperRef}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        className="relative min-h-0 flex-1"
      >
        <Excalidraw
          excalidrawAPI={(api) => {
            apiRef.current = api;
            setApiReady(true);
          }}
          initialData={initial}
          onChange={handleChange}
          theme={resolvedTheme === "dark" ? "dark" : "light"}
          UIOptions={{
            canvasActions: {
              // We provide our own Download menu in the chrome — hide the
              // built-in image-export button to avoid duplicate affordances.
              export: false,
              saveAsImage: false,
              // Keep clearCanvas (handy during interviews); hide loadScene to
              // keep the doc model authoritative on this route.
              loadScene: false,
              saveToActiveFile: false,
              toggleTheme: false,
            },
          }}
        />
        {peers && peers.length > 0 && apiReady ? (
          <PeerCursorOverlay
            peers={peers}
            apiRef={apiRef}
            wrapperRef={wrapperRef}
          />
        ) : null}
      </div>
    </div>
  );
}

// --- Peer cursor overlay --------------------------------------------------

/**
 * Renders an overlay div per remote peer with their colored cursor + name tag.
 * Coordinates are projected from SCENE space → viewport pixels using the
 * current Excalidraw viewport (zoom + scroll). The overlay sits ON TOP of the
 * canvas so it doesn't have to fight with the scene's z-order, and uses
 * `pointer-events: none` so it never blocks drawing.
 */
function PeerCursorOverlay({
  peers,
  apiRef,
  wrapperRef,
}: {
  peers: RemotePeer[];
  apiRef: { current: ExcalidrawImperativeAPI | null };
  wrapperRef: { current: HTMLDivElement | null };
}) {
  const api = apiRef.current;
  if (!api) return null;
  const appState = api.getAppState();
  const wrapper = wrapperRef.current;
  if (!wrapper) return null;
  const zoom = appState.zoom.value;

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {peers.map((p) => {
        if (p.x === null || p.y === null) return null;
        const left = (p.x + appState.scrollX) * zoom;
        const top = (p.y + appState.scrollY) * zoom;
        return (
          <div
            key={p.peerId}
            className="absolute -translate-x-1 -translate-y-1 transition-transform duration-75"
            style={{ left: `${left}px`, top: `${top}px` }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              aria-hidden
              style={{ filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.25))" }}
            >
              <path
                d="M2 2 L18 9 L9 10 L7 18 Z"
                fill={p.color}
                stroke="#fff"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
            </svg>
            <span
              className="absolute left-3 top-3 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium text-white shadow"
              style={{ background: p.color }}
            >
              {p.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// --- Helpers ----------------------------------------------------------------

const TRANSIENT_APP_STATE_KEYS = new Set<keyof AppState>([
  "collaborators",
  "selectedElementIds",
  "selectedGroupIds",
  "editingGroupId",
  "editingElement",
  "draggingElement",
  "resizingElement",
  "multiElement",
  "selectionElement",
  "cursorButton",
  "scrollX",
  "scrollY",
  "zoom",
  "openMenu",
  "openSidebar",
  "openDialog",
  "isLoading",
  "errorMessage",
  "toast",
  "showWelcomeScreen",
  "contextMenu",
  "snapLines",
  "originSnapOffset",
] as unknown as Array<keyof AppState>);

function projectScene(
  elements: readonly ExcalidrawElement[],
  appState: AppState,
  files: BinaryFiles,
): SystemSceneModel {
  const cleanAppState: Partial<AppState> = {};
  for (const k of Object.keys(appState) as Array<keyof AppState>) {
    if (TRANSIENT_APP_STATE_KEYS.has(k)) continue;
    // Only persist serializable, scalar-ish state — skip functions, DOM refs.
    const v = appState[k];
    if (typeof v === "function") continue;
    (cleanAppState as Record<string, unknown>)[k as string] = v;
  }
  return {
    version: 1,
    elements,
    appState: cleanAppState,
    files,
  };
}

function projectInitial(raw: unknown): {
  elements?: readonly ExcalidrawElement[];
  appState?: Partial<AppState>;
  files?: BinaryFiles;
  libraryItems?: ExcalidrawElement[][];
  scrollToContent?: boolean;
} {
  if (!raw || typeof raw !== "object") {
    return { libraryItems: DEFAULT_LIBRARY_ITEMS, scrollToContent: true };
  }
  const r = raw as Partial<SystemSceneModel>;
  return {
    elements: Array.isArray(r.elements) ? r.elements : [],
    appState: r.appState ?? undefined,
    files: r.files ?? undefined,
    libraryItems: DEFAULT_LIBRARY_ITEMS,
    scrollToContent: true,
  };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Couldn't read blob"));
    reader.onerror = () => reject(reader.error ?? new Error("FileReader error"));
    reader.readAsDataURL(blob);
  });
}
