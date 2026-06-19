"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  findNode,
  insertLeafWithParents,
  insertNode,
  removeNode,
  renameNode,
  sortTree,
} from "@/lib/fs-tree";
import type { SessionSocket } from "@/lib/socket";
import type {
  FileChangedEvent,
  FileNode,
  TypedErrorPayload,
} from "@/types/session";

interface Buffer {
  /** Last content committed by the editor. */
  content: string;
  /** Last content acknowledged by the server. */
  serverContent: string;
  /** Loading file content from server. */
  loading: boolean;
}

/**
 * Server ack shape. Success acks vary by endpoint (some return `{ ok: true,
 * ... }`, some omit `ok` entirely). Errors always come back as
 * `{ ok: false, error: { code, message, details? } }` from the server's
 * `wrap()` helper.
 */
type ServerAck<TSuccess> = TSuccess | { ok: false; error: TypedErrorPayload };

function isAckError<T>(
  ack: ServerAck<T>,
): ack is { ok: false; error: TypedErrorPayload } {
  return (
    !!ack &&
    typeof ack === "object" &&
    (ack as { ok?: unknown }).ok === false
  );
}

const AUTOSAVE_DEBOUNCE_MS = 600;

/**
 * Server contract: every path in `file:*` is **relative to /sandbox** — no
 * leading slash. The client tree uses bare relative paths from the server's
 * `file:tree` response, but path construction for `createNode` / `renamePath`
 * can synthesize a leading slash when the parent is the workspace root
 * (parentPath === "/"). This helper strips any leading slashes before the
 * value goes on the wire.
 */
function toServerPath(p: string): string {
  return p.replace(/^\/+/, "");
}

/**
 * Join a UI-side parent path with a new child name into a server-relative
 * path. The UI uses "/" or "" to mean "workspace root" — server-relative
 * means the root file is just `foo.txt`, not `/foo.txt`.
 */
function joinChildPath(parentPath: string, name: string): string {
  const parent = toServerPath(parentPath.replace(/\/+$/, ""));
  return parent ? `${parent}/${name}` : name;
}

export interface WorkspaceState {
  files: FileNode[];
  filesLoading: boolean;
  openTabs: string[];
  activePath: string | null;
  buffers: Record<string, Buffer>;
  dirtyByPath: Record<string, boolean>;

  openFile: (path: string) => void;
  closeFile: (path: string) => void;
  selectFile: (path: string) => void;
  setBufferContent: (path: string, content: string) => void;

  createNode: (
    parentPath: string,
    name: string,
    kind: FileNode["kind"],
  ) => Promise<void>;
  renamePath: (path: string, newName: string) => Promise<void>;
  deletePath: (path: string) => Promise<void>;
}

/**
 * Normalize whatever the server hands back into a hierarchical `FileNode[]`.
 *
 * The current server (`services/fileSync.ts → listTree`) returns a FLAT list
 * of file entries like `{ path: "src/App.tsx", type: "file", size: 1234 }` —
 * there are no directory entries at all. If we treat that as-is, the UI
 * renders every file as a sibling at the root, no `src/` folder exists, and
 * the only "+" buttons are the root ones. So when the input looks flat, we
 * synthesize the directory chain from the path segments.
 *
 * If the server later switches to nested input (`{ children: [...] }`), the
 * top branch handles that shape unchanged.
 */
function coerceNodes(input: unknown): FileNode[] {
  if (!Array.isArray(input)) return [];

  interface Raw {
    path: string;
    name: string;
    kindHint?: string;
    isDirectory?: boolean;
    children?: unknown;
  }

  const raws: Raw[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    let path =
      typeof r.path === "string" && r.path ? (r.path as string) : "";
    const explicitName =
      typeof r.name === "string" && r.name ? (r.name as string) : "";
    const name =
      explicitName || (path ? (path.split("/").pop() ?? "") : "");
    if (!path && !name) continue;
    if (!path && name) path = name;
    raws.push({
      path,
      name,
      kindHint:
        (typeof r.kind === "string" && r.kind) ||
        (typeof r.type === "string" && r.type) ||
        undefined,
      isDirectory: r.isDirectory === true,
      children:
        (Array.isArray(r.children) && r.children) ||
        (Array.isArray(r.entries) && r.entries) ||
        (Array.isArray(r.files) && r.files) ||
        undefined,
    });
  }

  const anyNested = raws.some((r) => Array.isArray(r.children));
  if (anyNested) {
    // Already structured — walk recursively (legacy shape).
    return raws.map((r) => {
      const isDir =
        r.kindHint === "directory" ||
        r.kindHint === "dir" ||
        r.kindHint === "folder" ||
        r.isDirectory ||
        Array.isArray(r.children);
      const node: FileNode = {
        path: r.path,
        name: r.name,
        kind: isDir ? "directory" : "file",
      };
      if (isDir) {
        node.children = Array.isArray(r.children)
          ? coerceNodes(r.children)
          : [];
      }
      return node;
    });
  }

  // Flat list — build the hierarchy from path segments.
  return buildHierarchyFromFlat(raws);
}

function buildHierarchyFromFlat(
  raws: Array<{ path: string; kindHint?: string; isDirectory?: boolean }>,
): FileNode[] {
  interface MutNode {
    path: string;
    name: string;
    kind: FileNode["kind"];
    children?: Map<string, MutNode>;
  }
  const rootMap = new Map<string, MutNode>();

  function ensureNode(
    map: Map<string, MutNode>,
    segment: string,
    pathSoFar: string,
    isDir: boolean,
  ): MutNode {
    let node = map.get(segment);
    if (!node) {
      node = {
        path: pathSoFar,
        name: segment,
        kind: isDir ? "directory" : "file",
      };
      if (isDir) node.children = new Map();
      map.set(segment, node);
      return node;
    }
    // Upgrade a previously-seen leaf to a directory if a later path needs it
    // (defensive — shouldn't normally happen for a sane server).
    if (isDir && node.kind === "file") {
      node.kind = "directory";
      node.children = node.children ?? new Map();
    }
    return node;
  }

  for (const r of raws) {
    const segments = r.path.split("/").filter(Boolean);
    if (segments.length === 0) continue;
    const explicitDir =
      r.kindHint === "directory" ||
      r.kindHint === "dir" ||
      r.kindHint === "folder" ||
      r.isDirectory === true;

    let cursor = rootMap;
    let acc = "";
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      acc = acc ? `${acc}/${seg}` : seg;
      const isLast = i === segments.length - 1;
      const isDir = !isLast || explicitDir;
      const node = ensureNode(cursor, seg, acc, isDir);
      if (!isLast) {
        if (!node.children) {
          node.kind = "directory";
          node.children = new Map();
        }
        cursor = node.children;
      }
    }
  }

  function toFileNodes(map: Map<string, MutNode>): FileNode[] {
    return Array.from(map.values()).map((n) => {
      const out: FileNode = {
        path: n.path,
        name: n.name,
        kind: n.kind,
      };
      if (n.kind === "directory") {
        out.children = n.children ? toFileNodes(n.children) : [];
      }
      return out;
    });
  }

  return toFileNodes(rootMap);
}

export function useWorkspace(
  socket: SessionSocket | null,
  initial: FileNode[] | null,
): WorkspaceState {
  const [files, setFiles] = useState<FileNode[]>(() =>
    initial && initial.length > 0 ? sortTree(initial) : [],
  );
  const [filesLoading, setFilesLoading] = useState<boolean>(
    () => !(initial && initial.length > 0),
  );
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [buffers, setBuffers] = useState<Record<string, Buffer>>({});
  // Mirror of `buffers` so async event handlers (file:changed, autosave) can
  // read the latest content without re-subscribing on every keystroke.
  const buffersRef = useRef(buffers);
  useEffect(() => {
    buffersRef.current = buffers;
  }, [buffers]);

  // Seed once the initial snapshot arrives (after lifecycle:ready).
  const seededRef = useRef(false);
  useEffect(() => {
    if (!initial || initial.length === 0 || seededRef.current) return;
    seededRef.current = true;
    setFiles(sortTree(initial));
    setFilesLoading(false);
  }, [initial]);

  // Fetch the workspace tree once we have a socket. The server returns
  // { tree: FileNode[] }; we still coerce in case the field shape drifts.
  useEffect(() => {
    if (!socket) return;
    if (initial && initial.length > 0) return;
    let cancelled = false;

    (async () => {
      setFilesLoading(true);
      try {
        const ack = (await socket.emitAck("file:tree", {})) as ServerAck<{
          tree: unknown;
        }>;
        console.log("[workspace] file:tree →", ack);
        if (cancelled) return;
        if (isAckError(ack)) {
          toast.error("Couldn't list files", {
            description: ack.error.message,
          });
          setFilesLoading(false);
          return;
        }
        const nodes = coerceNodes((ack as { tree: unknown }).tree);
        setFiles(sortTree(nodes));
        setFilesLoading(false);
      } catch (e) {
        console.warn("[workspace] file:tree failed", e);
        if (!cancelled) setFilesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [socket, initial]);

  // Subscribe to `file:changed` broadcasts. The server emits this after
  // every write / delete / rename — payload is `{ path, version, kind, from? }`
  // (no content). For writes we just bump the buffer's serverContent fence
  // via a refetch; remote rewrites of an open dirty buffer are surfaced as
  // a toast rather than clobbering local edits.
  useEffect(() => {
    if (!socket) return;
    const s = socket;
    async function refetch(path: string) {
      try {
        const ack = (await s.emitAck("file:read", {
          path: toServerPath(path),
        })) as ServerAck<{
          ok: true;
          content: string;
          version: number;
        }>;
        if (isAckError(ack)) return;
        const content = (ack as { content: string }).content;
        setBuffers((prev) => {
          const cur = prev[path];
          if (!cur) return prev;
          const dirty = cur.content !== cur.serverContent;
          if (dirty) {
            toast.message(`Remote update to ${path}`, {
              description: "Your local edits weren't replaced.",
            });
            return { ...prev, [path]: { ...cur, serverContent: content } };
          }
          return {
            ...prev,
            [path]: { ...cur, content, serverContent: content },
          };
        });
      } catch {
        /* socket queue retries; nothing else to do */
      }
    }

    function handler(ev: FileChangedEvent) {
      console.log("[workspace] file:changed", ev);
      if (ev.kind === "delete") {
        setFiles((prev) => removeNode(prev, ev.path));
        setOpenTabs((prev) =>
          prev.filter((p) => p !== ev.path && !p.startsWith(`${ev.path}/`)),
        );
        setActivePath((cur) =>
          cur === ev.path || cur?.startsWith(`${ev.path}/`) ? null : cur,
        );
        setBuffers((prev) => {
          const next = { ...prev };
          for (const k of Object.keys(next)) {
            if (k === ev.path || k.startsWith(`${ev.path}/`)) delete next[k];
          }
          return next;
        });
        return;
      }
      if (ev.kind === "rename" && ev.from) {
        setFiles((prev) => renameNode(prev, ev.from!, ev.path));
        setOpenTabs((prev) =>
          prev.map((p) =>
            p === ev.from || p.startsWith(`${ev.from}/`)
              ? p.replace(ev.from!, ev.path)
              : p,
          ),
        );
        setBuffers((prev) => {
          const next: typeof prev = {};
          for (const [k, v] of Object.entries(prev)) {
            const newKey =
              k === ev.from || k.startsWith(`${ev.from}/`)
                ? k.replace(ev.from!, ev.path)
                : k;
            next[newKey] = v;
          }
          return next;
        });
        setActivePath((cur) =>
          cur && (cur === ev.from || cur.startsWith(`${ev.from}/`))
            ? cur.replace(ev.from!, ev.path)
            : cur,
        );
        return;
      }
      if (ev.kind === "write") {
        // If we don't know about the file in our tree, it was just created.
        // Build the missing parent chain (defensive: server may not have a
        // matching directory entry; flat-list trees don't carry dirs at all).
        setFiles((prev) => {
          if (findNode(prev, ev.path)) return prev;
          return insertLeafWithParents(prev, ev.path, "file");
        });
        // If we already have this file open, refresh the buffer from disk.
        if (buffersRef.current[ev.path]) void refetch(ev.path);
      }
    }
    s.socket.on("file:changed", handler);
    return () => {
      s.socket.off("file:changed", handler);
    };
  }, [socket]);

  // Out-of-band tree changes (terminal commands like `npx shadcn add`,
  // scaffolders, DB tooling) don't go through `file:*`, so the server's
  // treeWatcher pushes `fs:invalidate`. Refetch the whole tree — debounced to
  // coalesce bursts. Expanded folders + the active file live in separate state
  // (FileTree-local + activePath), so replacing `files` doesn't disturb them.
  useEffect(() => {
    if (!socket) return;
    const s = socket;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    async function refetchTree() {
      try {
        const ack = (await s.emitAck("file:tree", {})) as ServerAck<{
          tree: unknown;
        }>;
        if (cancelled || isAckError(ack)) return;
        const nodes = coerceNodes((ack as { tree: unknown }).tree);
        setFiles(sortTree(nodes));
      } catch {
        /* socket queue retries; nothing else to do */
      }
    }

    function handler() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void refetchTree(), 300);
    }

    s.socket.on("fs:invalidate", handler);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      s.socket.off("fs:invalidate", handler);
    };
  }, [socket]);

  // Surface typed-error pushes from the server so the user sees a toast
  // instead of the socket silently swallowing them.
  useEffect(() => {
    if (!socket) return;
    function onTyped(err: TypedErrorPayload) {
      console.warn("[workspace] error:typed", err);
      toast.error(err.message || err.code || "Server error");
    }
    socket.socket.on("error:typed", onTyped);
    return () => {
      socket.socket.off("error:typed", onTyped);
    };
  }, [socket]);

  // ---- Tab management ----
  const openFile = useCallback(
    (path: string) => {
      setActivePath(path);
      setOpenTabs((prev) => (prev.includes(path) ? prev : [...prev, path]));
      if (!socket) return;
      setBuffers((prev) => {
        if (prev[path]) return prev;
        return {
          ...prev,
          [path]: { content: "", serverContent: "", loading: true },
        };
      });
      void (async () => {
        try {
          const ack = (await socket.emitAck("file:read", {
            path: toServerPath(path),
          })) as ServerAck<{
            ok: true;
            content: string;
            version: number;
            path: string;
          }>;
          if (isAckError(ack)) {
            toast.error("Couldn't open file", {
              description: ack.error.message || path,
            });
            setBuffers((prev) => {
              const next = { ...prev };
              delete next[path];
              return next;
            });
            return;
          }
          const content = (ack as { content: string }).content;
          setBuffers((prev) => ({
            ...prev,
            [path]: {
              content,
              serverContent: content,
              loading: false,
            },
          }));
        } catch {
          toast.error("Couldn't open file");
        }
      })();
    },
    [socket],
  );

  const closeFile = useCallback((path: string) => {
    setOpenTabs((prev) => {
      const next = prev.filter((p) => p !== path);
      setActivePath((cur) =>
        cur === path ? (next[next.length - 1] ?? null) : cur,
      );
      return next;
    });
    setBuffers((prev) => {
      const next = { ...prev };
      delete next[path];
      return next;
    });
  }, []);

  const selectFile = useCallback((path: string) => {
    setActivePath(path);
  }, []);

  // ---- Autosave ----
  // Debounce per-path. Timers live in a ref; the save function is captured
  // in another ref refreshed from an effect so the debounce closure can call
  // the latest version without depending on it.
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const inflight = useRef<Record<string, boolean>>({});
  const saveFnRef = useRef<(path: string) => Promise<void>>(async () => {});

  useEffect(() => {
    saveFnRef.current = async function doSave(path: string) {
      if (!socket) return;
      if (inflight.current[path]) {
        // Re-schedule after the in-flight save returns.
        timers.current[path] = setTimeout(() => {
          void saveFnRef.current(path);
        }, 100);
        return;
      }
      inflight.current[path] = true;
      try {
        const buf = buffersRef.current[path];
        if (!buf) return;
        if (buf.content === buf.serverContent) return;
        const ack = (await socket.emitAck("file:write", {
          path: toServerPath(path),
          content: buf.content,
        })) as ServerAck<{ ok: true; path: string; version: number }>;
        if (isAckError(ack)) {
          toast.error("Couldn't save", { description: ack.error.message });
          return;
        }
        setBuffers((prev) => {
          const cur = prev[path];
          if (!cur) return prev;
          return {
            ...prev,
            [path]: { ...cur, serverContent: buf.content },
          };
        });
      } catch {
        // socket queue will retry; nothing else to do here.
      } finally {
        inflight.current[path] = false;
      }
    };
  }, [socket]);

  const scheduleSave = useCallback((path: string) => {
    const existing = timers.current[path];
    if (existing) clearTimeout(existing);
    timers.current[path] = setTimeout(() => {
      delete timers.current[path];
      void saveFnRef.current(path);
    }, AUTOSAVE_DEBOUNCE_MS);
  }, []);

  const setBufferContent = useCallback(
    (path: string, content: string) => {
      setBuffers((prev) => {
        const cur = prev[path];
        if (!cur) return prev;
        if (cur.content === content) return prev;
        return { ...prev, [path]: { ...cur, content } };
      });
      scheduleSave(path);
    },
    [scheduleSave],
  );

  // ---- Tree mutations ----
  // Note: file:changed broadcasts from the server are what actually mutate
  // the in-memory tree. We don't optimistically insertNode here — that would
  // race with the broadcast and risk drift. The ack just confirms success.
  const createNode = useCallback(
    async (parentPath: string, name: string, kind: FileNode["kind"]) => {
      console.log("ON CREATE", parentPath, name, kind);
      if (!socket) return;
      // Server-relative path — `joinChildPath` strips the leading slash from
      // the UI's "/" root marker so the server's `normalizePath` accepts it.
      const path = joinChildPath(parentPath, name);
      try {
        if (kind === "directory") {
          const ack = (await socket.emitAck("file:mkdir", {
            path,
          })) as ServerAck<{ ok: true }>;
          if (isAckError(ack)) {
            toast.error("Couldn't create folder", {
              description: ack.error.message,
            });
            return;
          }
          // file:mkdir doesn't emit file:changed, so insert the dir ourselves.
          setFiles((prev) =>
            insertNode(prev, parentPath, {
              path,
              name,
              kind: "directory",
              children: [],
            }),
          );
        } else {
          const ack = (await socket.emitAck("file:write", {
            path,
            content: "",
          })) as ServerAck<{ ok: true; path: string; version: number }>;
          if (isAckError(ack)) {
            toast.error("Couldn't create file", {
              description: ack.error.message,
            });
            return;
          }
          // The corresponding file:changed { kind: "write" } broadcast will
          // run our handler and insert the leaf — nothing to do here.
        }
      } catch {
        toast.error("Couldn't create");
      }
    },
    [socket],
  );

  const renamePath = useCallback(
    async (path: string, newName: string) => {
      if (!socket) return;
      const parentPath = path.split("/").slice(0, -1).join("/");
      const toPath = parentPath ? `${parentPath}/${newName}` : newName;
      try {
        const ack = (await socket.emitAck("file:rename", {
          from: toServerPath(path),
          to: toServerPath(toPath),
        })) as ServerAck<{ ok: true }>;
        if (isAckError(ack)) {
          toast.error("Couldn't rename", { description: ack.error.message });
          return;
        }
        // The file:changed { kind: "rename", from } broadcast updates the
        // tree, open tabs, buffer keys, and active path in one place.
      } catch {
        toast.error("Couldn't rename");
      }
    },
    [socket],
  );

  const deletePath = useCallback(
    async (path: string) => {
      if (!socket) return;
      try {
        const ack = (await socket.emitAck("file:delete", {
          path: toServerPath(path),
        })) as ServerAck<{ ok: true }>;
        if (isAckError(ack)) {
          toast.error("Couldn't delete", { description: ack.error.message });
          return;
        }
        // The file:changed { kind: "delete" } broadcast prunes the tree,
        // open tabs, buffers, and active path.
      } catch {
        toast.error("Couldn't delete");
      }
    },
    [socket],
  );

  const dirtyByPath = useMemo(() => {
    const out: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(buffers)) {
      out[k] = v.content !== v.serverContent;
    }
    return out;
  }, [buffers]);

  return {
    files,
    filesLoading,
    openTabs,
    activePath,
    buffers,
    dirtyByPath,
    openFile,
    closeFile,
    selectFile,
    setBufferContent,
    createNode,
    renamePath,
    deletePath,
  };
}
