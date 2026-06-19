// Client-side session VIEW MODELS. Wire shapes (socket event payloads, the
// join ack, terminal acks, etc.) live in `@/contracts` — this file only
// defines types the CLIENT derives from those shapes (loader stages, the
// preview discriminated union the UI renders, the local file-tree node).

import type {
  ServerToClientEvents,
  TerminalKind,
  TypedError,
} from "@/contracts";

// ---------------------------------------------------------------------------
// Lifecycle loader (client view of the lifecycle:event stream)
// ---------------------------------------------------------------------------

export type LifecycleStage =
  | "queued"
  | "starting"
  | "image-pull"
  | "container"
  | "deps"
  | "scaffold"
  | "ready"
  | "errored";

export interface LifecycleEvent {
  stage: LifecycleStage;
  message: string;
  /** 0..1 if the server knows it. */
  progress?: number;
  /** Set when stage === "errored". */
  error?: string;
}

export interface SessionReadyPayload {
  /** Initial workspace snapshot the editor uses for fast first paint. */
  workspace: {
    root: string;
    files: FileNode[];
  };
}

// ---------------------------------------------------------------------------
// Filesystem (client view-model tree). The wire shape is `TreeNode` in the
// contract — flat entries. The client hydrates it into a hierarchical tree.
// ---------------------------------------------------------------------------

export type FileKind = "file" | "directory";

export interface FileNode {
  path: string;
  name: string;
  kind: FileKind;
  children?: FileNode[];
}

/** Server → client file:changed payload, sourced from the contract. */
export type FileChangedEvent = Parameters<
  ServerToClientEvents["file:changed"]
>[0];
export type FileChangedKind = FileChangedEvent["kind"];

// ---------------------------------------------------------------------------
// Terminal — every wire shape comes from the contract. These re-exports keep
// imports tidy at the consumer sites.
// ---------------------------------------------------------------------------

export type ShellKind = TerminalKind;

export type TermDataPayload = Parameters<ServerToClientEvents["term:data"]>[0];
export type TermExitPayload = Parameters<ServerToClientEvents["term:exit"]>[0];

/** Source-of-truth typed-error payload from the contract. */
export type TypedErrorPayload = TypedError["error"];

// ---------------------------------------------------------------------------
// Preview (client view; the contract's PreviewInfo is the raw wire shape).
// ---------------------------------------------------------------------------

export type PreviewInfo =
  | { status: "unknown" }
  | { status: "starting" }
  | { status: "ready"; url: string }
  | { status: "request"; baseUrl: string; hint?: string }
  | { status: "none" }
  | { status: "errored"; message: string };

/** Server → client. Server emits this on dev-server boot, error, or teardown. */
export interface PreviewEventPayload {
  status: PreviewInfo["status"];
  url?: string;
  baseUrl?: string;
  hint?: string;
  message?: string;
}
