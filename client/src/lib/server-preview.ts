import type { PreviewInfo as ServerPreview } from "@/contracts";
import type { PreviewInfo } from "@/types/session";

/**
 * Map the wire-level preview descriptor (kind/url/hostPort/hint) onto the
 * client's `PreviewInfo` state machine used by the workspace.
 *
 * Both `/sessions/recoverable` and `/sessions/:id/resume` return this shape;
 * `session:join` carries the same via the socket. The session socket also
 * delivers richer transitions via `lifecycle:event preview_ready` once the
 * dev server actually responds.
 */
export function previewFromServer(
  p: ServerPreview | null | undefined,
): PreviewInfo {
  if (!p) return { status: "unknown" };
  switch (p.kind) {
    case "iframe":
      return p.url
        ? { status: "ready", url: p.url }
        : { status: "starting" };
    case "api":
      return p.url
        ? { status: "request", baseUrl: p.url, hint: p.hint ?? undefined }
        : { status: "unknown" };
    case "none":
      return { status: "none" };
    default:
      return { status: "unknown" };
  }
}
