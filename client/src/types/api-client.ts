// Postman-like API client UI types. The over-the-wire proxy request/response
// shapes (ProxyRequest / ProxyResponse) live in `@/contracts` — those are NOT
// redefined here.

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

export const METHODS_WITH_BODY: ReadonlySet<HttpMethod> = new Set([
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
]);

export type BodyMode = "none" | "json" | "text" | "form";

export interface KvRow {
  /** Stable id so React reorders don't lose focus. */
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

export interface ApiRequest {
  method: HttpMethod;
  url: string;
  params: KvRow[];
  headers: KvRow[];
  bodyMode: BodyMode;
  /** JSON / text body. */
  bodyText: string;
  /** Form rows when bodyMode === "form". */
  bodyForm: KvRow[];
}

export interface ApiResponseHeader {
  name: string;
  value: string;
}

export interface ApiResponse {
  /** 0 if the network failed before a response. */
  status: number;
  statusText: string;
  ok: boolean;
  headers: ApiResponseHeader[];
  body: string;
  /** Best-effort parsed JSON (set when content-type is json or body parses). */
  json: unknown | undefined;
  /** Wall-clock duration in milliseconds. */
  timeMs: number;
  /** Body byte length. */
  sizeBytes: number;
  /** True when fetch threw — typically CORS or unreachable host. */
  networkError?: { message: string };
}

export interface HistoryEntry {
  id: string;
  /** Snapshot of the request at send time. */
  request: ApiRequest;
  response: ApiResponse | null;
  /** ms since epoch — used for display. */
  sentAt: number;
}

// Proxy request/response wire shapes used by the API client tab live in
// `@/contracts` (ProxyRequest, ProxyResponse). Import them at the call site.
