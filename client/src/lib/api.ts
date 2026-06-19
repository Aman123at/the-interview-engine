import { toast } from "sonner";
import { z } from "zod";
import { env } from "@/lib/env";
import {
  clearAccessToken,
  getAccessToken,
  setAccessToken,
} from "@/lib/auth/token-store";
import {
  adminInspectSessionResponse,
  adminInterviewerResponse,
  adminListHrsResponse,
  adminListInterviewersResponse,
  adminListInterviewTypesResponse,
  adminStaffUserResponse,
  authResponse,
  candidateResponse,
  hrSessionsResponse,
  interviewerCandidatesResponse,
  listCandidatesResponse,
  closeSessionResponse,
  deleteDesignDocResponse,
  deleteSessionFromHistoryResponse,
  designDocResponse,
  designShareGetResponse,
  enableDesignShareResponse,
  endpoints,
  enableShareResponse,
  frameworksResponse,
  listDesignDocsResponse,
  meResponse,
  okResponse,
  proxyResponse,
  recoverableSessionResponse,
  sessionEventsResponse,
  sessionsHistoryResponse,
  sessionWithPreviewResponse,
  shareGetResponse,
  type AdminInspectSessionResponse,
  type AdminInterviewerResponse,
  type AdminListHrsResponse,
  type AdminListInterviewersResponse,
  type AdminListInterviewTypesResponse,
  type AdminStaffUserResponse,
  bulkImportResponse,
  type BulkImportRequest,
  type BulkImportResponse,
  type BulkTemplateKind,
  type AuthResponse,
  type AttachCandidateRequest,
  type CandidateResponse,
  type CreateCandidateRequest,
  type HrSessionsExportQuery,
  type HrSessionsQuery,
  type HrSessionsResponse,
  type InterviewerCandidatesResponse,
  type ListCandidatesResponse,
  type UpdateCandidateRequest,
  type OnboardHrRequest,
  type OnboardInterviewerRequest,
  type UpdateHrRequest,
  type UpdateInterviewerRequest,
  type CloseSessionRequest,
  type CloseSessionResponse,
  type CreateDesignDocRequest,
  type CreateSessionRequest,
  type DeleteDesignDocResponse,
  type DeleteSessionFromHistoryRequest,
  type DeleteSessionFromHistoryResponse,
  type DesignDocKind,
  type DesignDocResponse,
  type DesignShareGetResponse,
  type EnableDesignShareResponse,
  type EnableShareResponse,
  type FrameworksResponse,
  type ListDesignDocsResponse,
  type LoginRequest,
  type MeResponse,
  type OkResponse,
  type ProxyRequest,
  type ProxyResponse,
  type RecoverableSessionResponse,
  type SessionEventsResponse,
  type SessionsHistoryQuery,
  type SessionsHistoryResponse,
  type SessionWithPreviewResponse,
  type ShareGetResponse,
  type UpdateDesignDocRequest,
} from "@/contracts";

// ApiErrorBody is not defined in the shared contract yet (the server's global
// error handler emits this shape but a response schema for it hasn't been
// added). Keep this hand-defined here as the lone exception until the
// contract carries it.
export interface ApiErrorBody {
  error?: string;
  message?: string;
  details?: unknown;
  code?: string;
}

export class ApiError extends Error {
  status: number;
  body: ApiErrorBody | undefined;
  constructor(status: number, message: string, body?: ApiErrorBody) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  /** Suppress the default error toast. */
  silent?: boolean;
  /** Override the base URL (rarely needed). */
  baseUrl?: string;
  /** Internal: disable the 401 silent-refresh retry (used by /auth/* itself). */
  skipAuthRetry?: boolean;
  /** Internal: skip injecting the Authorization header (used by login/refresh). */
  skipAuth?: boolean;
  /** Internal: contract response schema for the dev-only drift guard. */
  responseSchema?: z.ZodTypeAny;
  /** Internal: stable label for drift-guard log lines. */
  schemaLabel?: string;
}

// --- Global inflight tracking ---------------------------------------------
//
// Every successful or failed HTTP request bumps a counter; the top progress
// bar (and any other UI) subscribes via `subscribeApiLoading`. Silent calls
// still tick the counter — the user wants visual feedback for ALL network
// activity, so the suppression flag only governs the toast.

let inflightCount = 0;
type LoadingHandler = (count: number) => void;
const loadingHandlers = new Set<LoadingHandler>();

function notifyLoading(): void {
  for (const fn of loadingHandlers) {
    try {
      fn(inflightCount);
    } catch {
      /* never let a subscriber break the request pipeline */
    }
  }
}

function beginRequest(): void {
  inflightCount += 1;
  notifyLoading();
}

function endRequest(): void {
  inflightCount = Math.max(0, inflightCount - 1);
  notifyLoading();
}

/** Subscribe to global API in-flight changes. Returns an unsubscribe. */
export function subscribeApiLoading(fn: LoadingHandler): () => void {
  loadingHandlers.add(fn);
  // Replay current count so late subscribers don't miss an active request.
  try {
    fn(inflightCount);
  } catch {
    /* ignore */
  }
  return () => loadingHandlers.delete(fn);
}

/** Current in-flight count — handy for SSR-safe reads / debugging. */
export function getApiInflightCount(): number {
  return inflightCount;
}

// Coalesce concurrent refreshes so a burst of 401s triggers a single
// /auth/refresh round-trip.
let refreshInflight: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (refreshInflight) return refreshInflight;
  refreshInflight = (async () => {
    try {
      const res = await rawRequest<AuthResponse>("/auth/refresh", {
        method: "POST",
        silent: true,
        skipAuthRetry: true,
        skipAuth: true,
        responseSchema: authResponse,
        schemaLabel: "POST /auth/refresh",
        // Send refresh token in body if we have one; otherwise the server
        // is expected to use a session cookie.
        credentials: "include",
      });
      if (res?.accessToken) setAccessToken(res.accessToken);
      return !!res?.accessToken;
    } catch {
      return false;
    } finally {
      queueMicrotask(() => {
        refreshInflight = null;
      });
    }
  })();
  return refreshInflight;
}

/** Subscribers (e.g. AuthProvider) get notified when silent refresh fails. */
type AuthFailHandler = () => void;
const authFailHandlers = new Set<AuthFailHandler>();
export function onAuthFailure(fn: AuthFailHandler): () => void {
  authFailHandlers.add(fn);
  return () => authFailHandlers.delete(fn);
}
function emitAuthFailure() {
  clearAccessToken();
  for (const fn of authFailHandlers) {
    try {
      fn();
    } catch {
      // handler errors must never break the response pipeline
    }
  }
}

/** Subscribers get notified when the access token rotates (login / refresh). */
type TokenChangeHandler = (token: string | null) => void;
const tokenChangeHandlers = new Set<TokenChangeHandler>();
export function onTokenChange(fn: TokenChangeHandler): () => void {
  tokenChangeHandlers.add(fn);
  return () => tokenChangeHandlers.delete(fn);
}
function emitTokenChange(token: string | null) {
  for (const fn of tokenChangeHandlers) {
    try {
      fn(token);
    } catch {
      // ignore
    }
  }
}

const IS_DEV = process.env.NODE_ENV !== "production";

/**
 * Encode HR session filters into a URL query string. Drops empty strings,
 * stringifies Dates as ISO, and lets the server's zod schema coerce. Returns
 * an empty string when no filters are set so the URL stays tidy.
 */
function buildHrQuery(
  q: Record<string, string | number | Date | undefined>,
): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined) continue;
    if (typeof v === "string") {
      const t = v.trim();
      if (!t) continue;
      sp.set(k, t);
    } else if (v instanceof Date) {
      sp.set(k, v.toISOString());
    } else {
      sp.set(k, String(v));
    }
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/**
 * Parse the filename out of a `Content-Disposition` header. Handles the
 * common `filename="foo.zip"` form and the RFC 5987 `filename*=UTF-8''foo`
 * extended form (preferred when present). Returns null on any parse miss.
 */
export function parseContentDispositionFilename(
  header: string | null,
): string | null {
  if (!header) return null;
  const ext = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/i.exec(header);
  if (ext?.[1]) {
    try {
      return decodeURIComponent(ext[1].trim());
    } catch {
      // fall through to the simple form
    }
  }
  const simple = /filename\s*=\s*"?([^";]+)"?/i.exec(header);
  return simple?.[1]?.trim() ?? null;
}

/**
 * Dev-only drift guard: parse the JSON payload through the contract response
 * schema; on mismatch warn loudly so the developer notices the server moved
 * out from under the client. Stripped from production builds by the IS_DEV
 * branch (dead-code-eliminated by the bundler).
 */
function driftCheck(
  payload: unknown,
  schema: z.ZodTypeAny | undefined,
  label: string | undefined,
) {
  if (!IS_DEV || !schema) return;
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    console.warn(
      `[contracts] response drift ${label ?? "<unknown>"}`,
      parsed.error.issues,
      payload,
    );
  }
}

async function rawRequest<T>(
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  const {
    body,
    silent,
    baseUrl,
    headers,
    skipAuthRetry,
    skipAuth,
    responseSchema,
    schemaLabel,
    ...rest
  } = opts;
  void skipAuthRetry;
  const url = `${baseUrl ?? env.API_URL}${path}`;

  const token = skipAuth ? null : getAccessToken();

  const init: RequestInit = {
    ...rest,
    headers: {
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Network error";
    // Network failures bypass `silent` — the user almost always needs to know
    // the API is unreachable, even when the calling code has a local error UI.
    // Dedup with a stable id so a burst of failed calls doesn't stack toasts.
    toast.error("Network error", { id: `net-err:${path}`, description: msg });
    throw new ApiError(0, msg);
  }

  const contentType = res.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? await res.json().catch(() => undefined) : undefined;

  if (!res.ok) {
    const errBody = payload as ApiErrorBody | undefined;
    const msg = errBody?.message ?? errBody?.error ?? res.statusText;
    // 5xx is "server fell over" — always surface, even silent calls. 4xx is
    // typically expected (409 conflict, 410 ended, 401 retry path) and stays
    // governed by the explicit `silent` flag so callers with local UIs
    // (login form, share-full state, etc.) don't double-toast.
    const severe = res.status >= 500;
    if (!silent || severe) {
      const label = severe ? "Server error" : "Request failed";
      toast.error(`${label} (${res.status})`, {
        id: `req-err:${path}:${res.status}`,
        description: msg,
      });
    }
    throw new ApiError(res.status, msg, errBody);
  }

  driftCheck(payload, responseSchema, schemaLabel);
  return payload as T;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  beginRequest();
  try {
    try {
      return await rawRequest<T>(path, opts);
    } catch (e) {
      // Silent-refresh retry: one shot, only on 401, never for /auth/* itself.
      if (
        e instanceof ApiError &&
        e.status === 401 &&
        !opts.skipAuthRetry &&
        !path.startsWith("/auth/")
      ) {
        const ok = await tryRefresh();
        if (ok) {
          emitTokenChange(getAccessToken());
          return await rawRequest<T>(path, { ...opts, skipAuthRetry: true });
        }
        emitAuthFailure();
      }
      throw e;
    }
  } finally {
    endRequest();
  }
}

// Sanity: the call sites below should be the only places that bind a method
// to a contract endpoint. If a path here doesn't appear in `endpoints`, the
// contract is missing an entry — fail at module load so we notice in dev.
function ensureKnown<K extends keyof typeof endpoints>(key: K): K {
  if (IS_DEV && !(key in endpoints)) {
    console.warn(`[contracts] unknown endpoint key ${key}`);
  }
  return key;
}

export const api = {
  request,
  get: <T>(path: string, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: "GET" }),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: "PATCH", body }),
  delete: <T>(path: string, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: "DELETE" }),

  // ---- Typed endpoints (filled in over phases) -----------------------------

  getFrameworks: () =>
    request<FrameworksResponse>("/config/frameworks", {
      responseSchema: frameworksResponse,
      schemaLabel: ensureKnown("GET /config/frameworks"),
    }),

  sessions: {
    /**
     * Create a new sandbox session. The form surfaces 409 ("active session
     * already exists") inline, so we suppress the default toast.
     */
    create: (body: CreateSessionRequest) =>
      request<SessionWithPreviewResponse>("/sessions", {
        method: "POST",
        body,
        silent: true,
        responseSchema: sessionWithPreviewResponse,
        schemaLabel: ensureKnown("POST /sessions"),
      }),
    /**
     * Most-recent recoverable session for the current user, or null. Drives
     * the dashboard "Continue previous session" card.
     */
    getRecoverable: () =>
      request<RecoverableSessionResponse>("/sessions/recoverable", {
        silent: true,
        responseSchema: recoverableSessionResponse,
        schemaLabel: ensureKnown("GET /sessions/recoverable"),
      }),
    /**
     * Resume a recoverable session. Server returns 202 with status=pending;
     * the session then re-runs the normal lifecycle (initializing → running)
     * over the socket.
     */
    resume: (id: string) =>
      request<SessionWithPreviewResponse>(`/sessions/${id}/resume`, {
        method: "POST",
        silent: true,
        responseSchema: sessionWithPreviewResponse,
        schemaLabel: ensureKnown("POST /sessions/:id/resume"),
      }),
    /**
     * Close a session — flushes pending file syncs, persists into the DB,
     * prunes node_modules etc., stops + removes the container, releases the
     * preview port. Slow path (0.5–5s) for live sessions; fast path
     * (<100ms) for recoverable.
     */
    close: (id: string, body?: CloseSessionRequest) =>
      request<CloseSessionResponse>(`/sessions/${id}`, {
        method: "DELETE",
        body,
        silent: true,
        responseSchema: closeSessionResponse,
        schemaLabel: ensureKnown("DELETE /sessions/:id"),
      }),
    /**
     * Attach (or detach with `candidateRecordId: null`) a Phase-30c candidate
     * record to a session. Server stamps the candidate's `externalId` into
     * the Phase-25 `candidateId` text column inside the same write, so
     * subsequent history rows carry both the link and the snapshot.
     */
    attachCandidate: (id: string, body: AttachCandidateRequest) =>
      request<SessionWithPreviewResponse>(`/sessions/${id}/candidate`, {
        method: "PATCH",
        body,
        silent: true,
        responseSchema: sessionWithPreviewResponse,
        schemaLabel: ensureKnown("PATCH /sessions/:id/candidate"),
      }),
    /**
     * Proxy an API-client request to the session's container dev server. The
     * server fetches it over loopback (no browser CORS).
     */
    proxy: (id: string, body: ProxyRequest) =>
      request<ProxyResponse>(`/sessions/${id}/proxy`, {
        method: "POST",
        body,
        silent: true,
        responseSchema: proxyResponse,
        schemaLabel: ensureKnown("POST /sessions/:id/proxy"),
      }),
    /** Enable sharing — mint (or fetch) the candidate token. */
    share: (id: string) =>
      request<EnableShareResponse>(`/sessions/${id}/share`, {
        method: "POST",
        body: {},
        silent: true,
        responseSchema: enableShareResponse,
        schemaLabel: ensureKnown("POST /sessions/:id/share"),
      }),
    /** Revoke sharing — the existing link stops working. */
    unshare: (id: string) =>
      request<OkResponse>(`/sessions/${id}/share`, {
        method: "DELETE",
        silent: true,
        responseSchema: okResponse,
        schemaLabel: ensureKnown("DELETE /sessions/:id/share"),
      }),
    /**
     * Phase 22 — paginated list of the user's past sessions for the
     * "Past Sessions" page. Server pre-projects each row (framework label,
     * customization summary, downloadable flag).
     */
    history: (query?: SessionsHistoryQuery) => {
      const params = new URLSearchParams();
      if (query?.limit !== undefined) params.set("limit", String(query.limit));
      if (query?.cursor) params.set("cursor", query.cursor);
      const qs = params.toString();
      return request<SessionsHistoryResponse>(
        `/sessions/history${qs ? `?${qs}` : ""}`,
        {
          silent: true,
          responseSchema: sessionsHistoryResponse,
          schemaLabel: ensureKnown("GET /sessions/history"),
        },
      );
    },
    /**
     * Phase 23 — download a past code session's stored volume contents as a
     * `.zip`. Bypasses the JSON request pipeline because the response body is
     * a binary stream with a `Content-Disposition` filename. Returns the
     * blob + filename; the caller triggers the browser save. Throws
     * `ApiError` (with `body.code === "VOLUME_UNAVAILABLE"` on 410) on
     * non-2xx so the UI can show the unavailable fallback.
     */
    download: async (id: string): Promise<{ blob: Blob; filename: string }> => {
      // Binary endpoint bypasses `request()`, so tick the global counter by
      // hand so the loading bar covers downloads too.
      beginRequest();
      try {
        const url = `${env.API_URL}/sessions/${id}/download`;
        const token = getAccessToken();
        const res = await fetch(url, {
          method: "GET",
          headers: {
            Accept: "application/zip",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        }).catch((e: unknown) => {
          const msg = e instanceof Error ? e.message : "Network error";
          throw new ApiError(0, msg);
        });
        if (!res.ok) {
          let body: ApiErrorBody | undefined;
          try {
            body = (await res.json()) as ApiErrorBody;
          } catch {
            // non-JSON error body
          }
          const msg = body?.message ?? body?.error ?? res.statusText;
          toast.error(`Download failed (${res.status})`, { description: msg });
          throw new ApiError(res.status, msg, body);
        }
        const blob = await res.blob();
        const filename =
          parseContentDispositionFilename(
            res.headers.get("content-disposition"),
          ) ?? `session-${id}.zip`;
        return { blob, filename };
      } finally {
        endRequest();
      }
    },
    /**
     * Phase 24 — soft-delete a past session from the user's history. Pass
     * `deleteVolume: true` to ALSO permanently destroy the stored code
     * volume (irreversible — subsequent downloads will 410). Distinct from
     * `close` (which ends a live session); this only removes a terminal
     * one from history. Returns 409 if the session is still non-terminal.
     */
    removeFromHistory: (
      id: string,
      body: DeleteSessionFromHistoryRequest,
    ) =>
      request<DeleteSessionFromHistoryResponse>(`/sessions/${id}/history`, {
        method: "DELETE",
        body,
        silent: true,
        responseSchema: deleteSessionFromHistoryResponse,
        schemaLabel: ensureKnown("DELETE /sessions/:id/history"),
      }),
    /** Per-session lifecycle event timeline (admin inspect view consumer). */
    getEvents: (id: string) =>
      request<SessionEventsResponse>(`/sessions/${id}/events`, {
        silent: true,
        responseSchema: sessionEventsResponse,
        schemaLabel: ensureKnown("GET /sessions/:id/events"),
      }),
  },

  /**
   * Public (UNAUTHENTICATED) candidate endpoints, keyed by share token. No
   * Authorization header — the token IS the authorization.
   */
  share: {
    get: (token: string) =>
      request<ShareGetResponse>(`/share/${token}`, {
        silent: true,
        skipAuth: true,
        skipAuthRetry: true,
        responseSchema: shareGetResponse,
        schemaLabel: ensureKnown("GET /share/:token"),
      }),
    proxy: (token: string, body: ProxyRequest) =>
      request<ProxyResponse>(`/share/${token}/proxy`, {
        method: "POST",
        body,
        silent: true,
        skipAuth: true,
        skipAuthRetry: true,
        responseSchema: proxyResponse,
        schemaLabel: ensureKnown("POST /share/:token/proxy"),
      }),
  },

  /**
   * Admin-only inspect endpoints. Server checks the bearer token's role
   * server-side; the client only uses these to render the inspect view.
   * The contract bundles session + preview + events + container + stats +
   * logs into a single response so the page makes one round-trip.
   */
  admin: {
    getInspect: (id: string) =>
      request<AdminInspectSessionResponse>(`/admin/sessions/${id}`, {
        silent: true,
        responseSchema: adminInspectSessionResponse,
        schemaLabel: ensureKnown("GET /admin/sessions/:id"),
      }),

    // Phase 30b — staff management. All endpoints are server-gated by
    // requireRole('admin'); the client surfaces typed wrappers per route.
    listInterviewTypes: () =>
      request<AdminListInterviewTypesResponse>("/admin/interview-types", {
        silent: true,
        responseSchema: adminListInterviewTypesResponse,
        schemaLabel: ensureKnown("GET /admin/interview-types"),
      }),

    listHrs: () =>
      request<AdminListHrsResponse>("/admin/hrs", {
        silent: true,
        responseSchema: adminListHrsResponse,
        schemaLabel: ensureKnown("GET /admin/hrs"),
      }),
    onboardHr: (body: OnboardHrRequest) =>
      request<AdminStaffUserResponse>("/admin/hrs", {
        method: "POST",
        body,
        silent: true,
        responseSchema: adminStaffUserResponse,
        schemaLabel: ensureKnown("POST /admin/hrs"),
      }),
    updateHr: (id: string, body: UpdateHrRequest) =>
      request<AdminStaffUserResponse>(`/admin/hrs/${id}`, {
        method: "PATCH",
        body,
        silent: true,
        responseSchema: adminStaffUserResponse,
        schemaLabel: ensureKnown("PATCH /admin/hrs/:id"),
      }),
    deleteHr: (id: string) =>
      request<OkResponse>(`/admin/hrs/${id}`, {
        method: "DELETE",
        silent: true,
        responseSchema: okResponse,
        schemaLabel: ensureKnown("DELETE /admin/hrs/:id"),
      }),

    listInterviewers: () =>
      request<AdminListInterviewersResponse>("/admin/interviewers", {
        silent: true,
        responseSchema: adminListInterviewersResponse,
        schemaLabel: ensureKnown("GET /admin/interviewers"),
      }),
    onboardInterviewer: (body: OnboardInterviewerRequest) =>
      request<AdminInterviewerResponse>("/admin/interviewers", {
        method: "POST",
        body,
        silent: true,
        responseSchema: adminInterviewerResponse,
        schemaLabel: ensureKnown("POST /admin/interviewers"),
      }),
    updateInterviewer: (id: string, body: UpdateInterviewerRequest) =>
      request<AdminInterviewerResponse>(`/admin/interviewers/${id}`, {
        method: "PATCH",
        body,
        silent: true,
        responseSchema: adminInterviewerResponse,
        schemaLabel: ensureKnown("PATCH /admin/interviewers/:id"),
      }),
    deleteInterviewer: (id: string) =>
      request<OkResponse>(`/admin/interviewers/${id}`, {
        method: "DELETE",
        silent: true,
        responseSchema: okResponse,
        schemaLabel: ensureKnown("DELETE /admin/interviewers/:id"),
      }),
  },

  /**
   * Phase 30e — HR cross-interviewer reporting. List + xlsx export. Server
   * gates with `requireRole('hr')`; admins / interviewers get 403.
   */
  hr: {
    listSessions: (query: HrSessionsQuery = {}) => {
      const qs = buildHrQuery(query);
      return request<HrSessionsResponse>(`/hr/sessions${qs}`, {
        silent: true,
        responseSchema: hrSessionsResponse,
        schemaLabel: ensureKnown("GET /hr/sessions"),
      });
    },
    /**
     * Streams a `.xlsx` from `GET /hr/sessions/export.xlsx`. Bypasses the
     * JSON pipeline (binary stream); reads the filename from
     * `Content-Disposition` (server sends
     * `interview-sessions_<from>_<to>.xlsx`). Throws `ApiError` on non-2xx
     * so the UI can surface 400 (missing/invalid range) inline.
     */
    exportSessionsXlsx: async (
      query: HrSessionsExportQuery,
    ): Promise<{ blob: Blob; filename: string }> => {
      beginRequest();
      try {
        const qs = buildHrQuery(query);
        const url = `${env.API_URL}/hr/sessions/export.xlsx${qs}`;
        const token = getAccessToken();
        const res = await fetch(url, {
          method: "GET",
          headers: {
            Accept:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        }).catch((e: unknown) => {
          const msg = e instanceof Error ? e.message : "Network error";
          throw new ApiError(0, msg);
        });
        if (!res.ok) {
          let body: ApiErrorBody | undefined;
          try {
            body = (await res.json()) as ApiErrorBody;
          } catch {
            // non-JSON error body
          }
          const msg = body?.message ?? body?.error ?? res.statusText;
          throw new ApiError(res.status, msg, body);
        }
        const blob = await res.blob();
        const filename =
          parseContentDispositionFilename(
            res.headers.get("content-disposition"),
          ) ?? "interview-sessions.xlsx";
        return { blob, filename };
      } finally {
        endRequest();
      }
    },
    /**
     * Phase 35 — download the HR bulk-onboarding xlsx template. Returns the
     * blob + server-stamped filename so the caller can save it via `<a download>`.
     */
    downloadBulkTemplate: async (
      kind: BulkTemplateKind,
    ): Promise<{ blob: Blob; filename: string }> => {
      beginRequest();
      try {
        const url = `${env.API_URL}/hr/bulk/template?kind=${encodeURIComponent(kind)}`;
        const token = getAccessToken();
        const res = await fetch(url, {
          method: "GET",
          headers: {
            Accept:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        }).catch((e: unknown) => {
          const msg = e instanceof Error ? e.message : "Network error";
          throw new ApiError(0, msg);
        });
        if (!res.ok) {
          let body: ApiErrorBody | undefined;
          try {
            body = (await res.json()) as ApiErrorBody;
          } catch {
            /* non-JSON */
          }
          throw new ApiError(
            res.status,
            body?.message ?? body?.error ?? res.statusText,
            body,
          );
        }
        const blob = await res.blob();
        const filename =
          parseContentDispositionFilename(
            res.headers.get("content-disposition"),
          ) ?? `bulk-${kind}-template.xlsx`;
        return { blob, filename };
      } finally {
        endRequest();
      }
    },
    /**
     * Phase 35 — submit a parsed + edited batch. 422 on validation surfaces
     * `details.rowErrors[]` (mapped back onto rows by the UI); 201 on success
     * returns the inserted records (+ generated temp passwords for interviewers).
     */
    bulkImport: (body: BulkImportRequest) =>
      request<BulkImportResponse>("/hr/bulk/import", {
        method: "POST",
        body,
        silent: true,
        responseSchema: bulkImportResponse,
        schemaLabel: ensureKnown("POST /hr/bulk/import"),
      }),
  },

  /**
   * Phase 30d — interviewer-scoped reads. Returns ONLY candidates whose
   * interview-type set intersects the caller's specializations. HRs/admins
   * cannot hit this endpoint (server gates with `requireRole('interviewer')`).
   */
  interviewer: {
    listCandidates: (search?: string) => {
      const qs = search ? `?search=${encodeURIComponent(search)}` : "";
      return request<InterviewerCandidatesResponse>(
        `/interviewer/candidates${qs}`,
        {
          silent: true,
          responseSchema: interviewerCandidatesResponse,
          schemaLabel: ensureKnown("GET /interviewer/candidates"),
        },
      );
    },
  },

  /**
   * Phase 30c — candidates (HR-owned). Server gates all routes with
   * `requireRole('hr')`. The candidate's stable `id` is the immutable UUID;
   * `externalId` is HR-typed and editable, with uniqueness enforced by the
   * partial unique index (409 CONFLICT on duplicate).
   */
  candidates: {
    list: (search?: string) => {
      const qs = search ? `?search=${encodeURIComponent(search)}` : "";
      return request<ListCandidatesResponse>(`/candidates${qs}`, {
        silent: true,
        responseSchema: listCandidatesResponse,
        schemaLabel: ensureKnown("GET /candidates"),
      });
    },
    get: (id: string) =>
      request<CandidateResponse>(`/candidates/${id}`, {
        silent: true,
        responseSchema: candidateResponse,
        schemaLabel: ensureKnown("GET /candidates/:id"),
      }),
    create: (body: CreateCandidateRequest) =>
      request<CandidateResponse>("/candidates", {
        method: "POST",
        body,
        silent: true,
        responseSchema: candidateResponse,
        schemaLabel: ensureKnown("POST /candidates"),
      }),
    update: (id: string, body: UpdateCandidateRequest) =>
      request<CandidateResponse>(`/candidates/${id}`, {
        method: "PATCH",
        body,
        silent: true,
        responseSchema: candidateResponse,
        schemaLabel: ensureKnown("PATCH /candidates/:id"),
      }),
    delete: (id: string) =>
      request<OkResponse>(`/candidates/${id}`, {
        method: "DELETE",
        silent: true,
        responseSchema: okResponse,
        schemaLabel: ensureKnown("DELETE /candidates/:id"),
      }),
  },

  /**
   * Phase 19 — design-interview documents. Separate track from code sessions;
   * the one-session rule does NOT apply here (no container, no port, no
   * volume). All routes are validated against the contract's discriminated
   * unions, so the kind/dbEngine pairing is enforced server-side.
   */
  designDocs: {
    list: (kind?: DesignDocKind) => {
      const qs = kind ? `?kind=${encodeURIComponent(kind)}` : "";
      return request<ListDesignDocsResponse>(`/design-docs${qs}`, {
        silent: true,
        responseSchema: listDesignDocsResponse,
        schemaLabel: ensureKnown("GET /design-docs"),
      });
    },
    get: (id: string) =>
      request<DesignDocResponse>(`/design-docs/${id}`, {
        silent: true,
        responseSchema: designDocResponse,
        schemaLabel: ensureKnown("GET /design-docs/:id"),
      }),
    create: (body: CreateDesignDocRequest) =>
      request<DesignDocResponse>("/design-docs", {
        method: "POST",
        body,
        silent: true,
        responseSchema: designDocResponse,
        schemaLabel: ensureKnown("POST /design-docs"),
      }),
    /** Autosave + manual save. Server validates the document per-kind. */
    update: (id: string, body: UpdateDesignDocRequest) =>
      request<DesignDocResponse>(`/design-docs/${id}`, {
        method: "PATCH",
        body,
        silent: true,
        responseSchema: designDocResponse,
        schemaLabel: ensureKnown("PATCH /design-docs/:id"),
      }),
    delete: (id: string) =>
      request<DeleteDesignDocResponse>(`/design-docs/${id}`, {
        method: "DELETE",
        silent: true,
        responseSchema: deleteDesignDocResponse,
        schemaLabel: ensureKnown("DELETE /design-docs/:id"),
      }),
    /**
     * Enable sharing on a system_design doc — mint (or fetch) the stable
     * token a guest can open via /d/<token>. Idempotent.
     */
    share: (id: string) =>
      request<EnableDesignShareResponse>(`/design-docs/${id}/share`, {
        method: "POST",
        body: {},
        silent: true,
        responseSchema: enableDesignShareResponse,
        schemaLabel: ensureKnown("POST /design-docs/:id/share"),
      }),
    /** Revoke sharing — the existing link stops working immediately. */
    unshare: (id: string) =>
      request<OkResponse>(`/design-docs/${id}/share`, {
        method: "DELETE",
        silent: true,
        responseSchema: okResponse,
        schemaLabel: ensureKnown("DELETE /design-docs/:id/share"),
      }),
  },

  /**
   * Public (UNAUTHENTICATED) design-canvas endpoint, keyed by share token.
   * Mirrors `api.share` for code sessions. Used by the /d/[token] guest page
   * to fetch the initial document + render the "session full / ended" empty
   * states without first opening a socket.
   */
  designShare: {
    get: (token: string) =>
      request<DesignShareGetResponse>(`/design-share/${token}`, {
        silent: true,
        skipAuth: true,
        skipAuthRetry: true,
        responseSchema: designShareGetResponse,
        schemaLabel: ensureKnown("GET /design-share/:token"),
      }),
  },

  auth: {
    me: (opts?: { silent?: boolean }) =>
      request<MeResponse>("/auth/me", {
        method: "GET",
        silent: opts?.silent ?? true,
        skipAuthRetry: true,
        responseSchema: meResponse,
        schemaLabel: ensureKnown("GET /auth/me"),
      }),
    login: async (body: LoginRequest) => {
      const res = await request<AuthResponse>("/auth/login", {
        method: "POST",
        body,
        silent: true, // form surfaces its own error UI
        skipAuthRetry: true,
        skipAuth: true,
        responseSchema: authResponse,
        schemaLabel: ensureKnown("POST /auth/login"),
      });
      if (res.accessToken) {
        setAccessToken(res.accessToken);
        emitTokenChange(res.accessToken);
      }
      return res;
    },
    logout: async () => {
      try {
        await request<void>("/auth/logout", {
          method: "POST",
          silent: true,
          skipAuthRetry: true,
        });
      } finally {
        clearAccessToken();
        emitTokenChange(null);
      }
    },
    refresh: () => tryRefresh(),
  },
};
