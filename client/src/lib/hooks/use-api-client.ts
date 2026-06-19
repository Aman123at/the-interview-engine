"use client";

import { useCallback, useState } from "react";
import { api, ApiError } from "@/lib/api";
import {
  METHODS_WITH_BODY,
  type ApiRequest,
  type ApiResponse,
  type ApiResponseHeader,
  type BodyMode,
  type HistoryEntry,
  type HttpMethod,
  type KvRow,
} from "@/types/api-client";
import type { ProxyResponse } from "@/contracts";

const MAX_HISTORY = 50;

/** localhost / loopback hostnames the container preview is served on. */
function isLoopbackHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
}

/** Decode a base64 body (from the proxy) into UTF-8 text + byte length. */
function base64ToText(b64: string): { text: string; bytes: number } {
  try {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return { text: new TextDecoder().decode(arr), bytes: arr.length };
  } catch {
    return { text: "", bytes: 0 };
  }
}

function buildProxyHeaders(req: ApiRequest): Array<{ name: string; value: string }> {
  const out: Array<{ name: string; value: string }> = [];
  const seen = new Set<string>();
  for (const h of req.headers) {
    if (!h.enabled || !h.key) continue;
    out.push({ name: h.key, value: h.value });
    seen.add(h.key.toLowerCase());
  }
  if (METHODS_WITH_BODY.has(req.method) && !seen.has("content-type")) {
    if (req.bodyMode === "json") out.push({ name: "Content-Type", value: "application/json" });
    else if (req.bodyMode === "text") out.push({ name: "Content-Type", value: "text/plain" });
    else if (req.bodyMode === "form")
      out.push({ name: "Content-Type", value: "application/x-www-form-urlencoded" });
  }
  return out;
}

function buildProxyBody(req: ApiRequest): string | undefined {
  if (!METHODS_WITH_BODY.has(req.method)) return undefined;
  switch (req.bodyMode) {
    case "none":
      return undefined;
    case "json":
    case "text":
      return req.bodyText || undefined;
    case "form": {
      const params = new URLSearchParams();
      for (const r of req.bodyForm) {
        if (!r.enabled || !r.key) continue;
        params.append(r.key, r.value ?? "");
      }
      const s = params.toString();
      return s || undefined;
    }
  }
}

let kvCounter = 0;
function kvId() {
  kvCounter += 1;
  return `kv${kvCounter}`;
}
export function emptyKv(): KvRow {
  return { id: kvId(), key: "", value: "", enabled: true };
}

function defaultRequest(): ApiRequest {
  return {
    method: "GET",
    url: "",
    params: [emptyKv()],
    headers: [emptyKv()],
    bodyMode: "none",
    bodyText: "",
    bodyForm: [emptyKv()],
  };
}

function ensureTrailingBlank(rows: KvRow[]): KvRow[] {
  if (rows.length === 0) return [emptyKv()];
  const last = rows[rows.length - 1];
  if (!last.key && !last.value) return rows;
  return [...rows, emptyKv()];
}

function buildUrl(base: string, params: KvRow[]): string {
  if (!base.trim()) return base;
  const active = params.filter((p) => p.enabled && p.key);
  if (active.length === 0) return base;
  const qs = active
    .map(
      (p) =>
        `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value ?? "")}`,
    )
    .join("&");
  return base.includes("?") ? `${base}&${qs}` : `${base}?${qs}`;
}

function buildHeaders(req: ApiRequest): HeadersInit {
  const out = new Headers();
  for (const h of req.headers) {
    if (!h.enabled || !h.key) continue;
    try {
      out.append(h.key, h.value);
    } catch {
      // Invalid header name; ignore so one bad row doesn't kill the request.
    }
  }
  // Auto Content-Type if the user didn't set one.
  const hasBody = METHODS_WITH_BODY.has(req.method);
  if (hasBody && !out.has("content-type")) {
    if (req.bodyMode === "json") out.set("content-type", "application/json");
    else if (req.bodyMode === "text") out.set("content-type", "text/plain");
    // form: leave it to fetch (it sets multipart boundary itself).
  }
  return out;
}

function buildBody(req: ApiRequest): BodyInit | undefined {
  if (!METHODS_WITH_BODY.has(req.method)) return undefined;
  switch (req.bodyMode) {
    case "none":
      return undefined;
    case "json":
    case "text":
      return req.bodyText || undefined;
    case "form": {
      const fd = new FormData();
      for (const r of req.bodyForm) {
        if (!r.enabled || !r.key) continue;
        fd.append(r.key, r.value ?? "");
      }
      return fd;
    }
  }
}

function headersToList(h: Headers): ApiResponseHeader[] {
  const out: ApiResponseHeader[] = [];
  h.forEach((value, name) => {
    out.push({ name, value });
  });
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

function tryParseJson(text: string): unknown | undefined {
  if (!text) return undefined;
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  if (trimmed[0] !== "{" && trimmed[0] !== "[") return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

let historyCounter = 0;
function historyId() {
  historyCounter += 1;
  return `h${historyCounter}_${Date.now()}`;
}

/**
 * True when `url` points at the sandbox container's preview origin. Same-origin
 * (host + port + protocol) is the general case; we ALSO treat any pair of
 * loopback hosts on the same port as equivalent so localhost↔127.0.0.1 typos
 * still proxy correctly in dev. Works for both localhost previews
 * (`http://localhost:<port>`) and subdomain previews (`https://<id>.<base>`).
 */
function isContainerUrl(url: string, containerOrigin: string | null | undefined): boolean {
  if (!containerOrigin) return false;
  try {
    const u = new URL(url);
    const c = new URL(containerOrigin);
    if (u.origin === c.origin) return true;
    return (
      u.protocol === c.protocol &&
      u.port === c.port &&
      isLoopbackHost(u.hostname) &&
      isLoopbackHost(c.hostname)
    );
  } catch {
    return false;
  }
}

/** Send a container-bound request through the server proxy — the authed
 * /sessions/:id/proxy for the interviewer, or the public /share/:token/proxy
 * for a candidate. */
async function sendViaProxy(
  route: { sessionId?: string | null; shareToken?: string | null },
  url: string,
  req: ApiRequest,
  started: number,
): Promise<ApiResponse> {
  const finishAt = () =>
    typeof performance !== "undefined" ? performance.now() : Date.now();
  try {
    const u = new URL(url);
    const path = u.pathname + u.search;
    const payload = {
      method: req.method,
      path,
      headers: buildProxyHeaders(req),
      body: buildProxyBody(req),
      bodyEncoding: "utf8" as const,
    };
    const proxyResult = (await (route.shareToken
      ? api.share.proxy(route.shareToken, payload)
      : api.sessions.proxy(route.sessionId!, payload))) as ProxyResponse;

    if (!proxyResult.ok) {
      return {
        status: 0,
        statusText: "Network error",
        ok: false,
        headers: [],
        body: "",
        json: undefined,
        timeMs: proxyResult.timeMs ?? Math.round(finishAt() - started),
        sizeBytes: 0,
        networkError: { message: proxyResult.error.message },
      };
    }

    const { text, bytes } = base64ToText(proxyResult.bodyBase64);
    const headers: ApiResponseHeader[] = proxyResult.headers
      .map((h) => ({ name: h.name, value: h.value }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return {
      status: proxyResult.status,
      statusText: proxyResult.statusText,
      ok: proxyResult.status >= 200 && proxyResult.status < 300,
      headers,
      body: text,
      json: tryParseJson(text),
      timeMs: proxyResult.timeMs,
      sizeBytes: proxyResult.sizeBytes || bytes,
    };
  } catch (e) {
    // The proxy endpoint itself errored (e.g. 409 session not running, 403).
    const message =
      e instanceof ApiError
        ? e.body?.message || `Proxy failed (${e.status})`
        : e instanceof Error
          ? e.message
          : "Proxy request failed";
    return {
      status: 0,
      statusText: "Proxy error",
      ok: false,
      headers: [],
      body: "",
      json: undefined,
      timeMs: Math.round(finishAt() - started),
      sizeBytes: 0,
      networkError: { message },
    };
  }
}

export interface UseApiClient {
  request: ApiRequest;
  response: ApiResponse | null;
  sending: boolean;
  history: HistoryEntry[];

  setMethod: (m: HttpMethod) => void;
  setUrl: (u: string) => void;
  setBodyMode: (m: BodyMode) => void;
  setBodyText: (t: string) => void;
  setParam: (i: number, patch: Partial<KvRow>) => void;
  removeParam: (i: number) => void;
  setHeader: (i: number, patch: Partial<KvRow>) => void;
  removeHeader: (i: number) => void;
  setFormRow: (i: number, patch: Partial<KvRow>) => void;
  removeFormRow: (i: number) => void;

  /** Replace the URL outright — used by the "Use container URL" quick-target. */
  loadUrl: (u: string) => void;
  /** Restore a request from history. */
  restore: (entry: HistoryEntry) => void;

  send: () => Promise<void>;
}

export interface UseApiClientOptions {
  /** Current session id — required to proxy container requests. */
  sessionId?: string | null;
  /** The container preview origin from the server (localhost:port in dev, https subdomain in prod), if known. */
  containerOrigin?: string | null;
  /** Candidate share token — when set, container requests use the public
   * /share/:token/proxy endpoint instead of the authed /sessions/:id/proxy. */
  shareToken?: string | null;
}

export function useApiClient(options: UseApiClientOptions = {}): UseApiClient {
  const { sessionId, containerOrigin, shareToken } = options;
  const [request, setRequest] = useState<ApiRequest>(defaultRequest);
  const [response, setResponse] = useState<ApiResponse | null>(null);
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const patchRequest = useCallback((p: Partial<ApiRequest>) => {
    setRequest((prev) => ({ ...prev, ...p }));
  }, []);

  const setMethod = useCallback(
    (m: HttpMethod) => {
      patchRequest({ method: m });
    },
    [patchRequest],
  );

  const setUrl = useCallback(
    (u: string) => {
      patchRequest({ url: u });
    },
    [patchRequest],
  );

  const setBodyMode = useCallback(
    (m: BodyMode) => {
      patchRequest({ bodyMode: m });
    },
    [patchRequest],
  );

  const setBodyText = useCallback(
    (t: string) => {
      patchRequest({ bodyText: t });
    },
    [patchRequest],
  );

  function rowMutator<K extends "params" | "headers" | "bodyForm">(key: K) {
    return {
      patch: (i: number, p: Partial<KvRow>) =>
        setRequest((prev) => {
          const rows = prev[key].slice();
          rows[i] = { ...rows[i], ...p };
          return { ...prev, [key]: ensureTrailingBlank(rows) };
        }),
      remove: (i: number) =>
        setRequest((prev) => {
          const rows = prev[key].slice();
          rows.splice(i, 1);
          return { ...prev, [key]: ensureTrailingBlank(rows) };
        }),
    };
  }

  const paramOps = rowMutator("params");
  const headerOps = rowMutator("headers");
  const formOps = rowMutator("bodyForm");

  const loadUrl = useCallback((u: string) => {
    setRequest((prev) => ({ ...prev, url: u }));
  }, []);

  const restore = useCallback((entry: HistoryEntry) => {
    setRequest(entry.request);
    setResponse(entry.response);
  }, []);

  const send = useCallback(async () => {
    if (sending) return;
    const snapshot: ApiRequest = JSON.parse(JSON.stringify(request));
    const url = buildUrl(snapshot.url.trim(), snapshot.params);
    if (!url) return;

    setSending(true);
    setResponse(null);

    // Decide whether this request targets the sandbox CONTAINER. If so we route
    // it through the server proxy (POST /sessions/:id/proxy) — a browser fetch
    // straight to the container is cross-origin and the candidate's server
    // sends no CORS headers, so the browser blocks it. External URLs keep the
    // direct browser fetch (those rely on the target's own CORS).
    const targetsContainer = isContainerUrl(url, containerOrigin);

    const started =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    let result: ApiResponse;

    if (targetsContainer && (sessionId || shareToken)) {
      result = await sendViaProxy({ sessionId, shareToken }, url, snapshot, started);
    } else {
      try {
        const res = await fetch(url, {
          method: snapshot.method,
          headers: buildHeaders(snapshot),
          body: buildBody(snapshot),
          // Don't send the app's auth cookie/header to arbitrary user-targeted
          // hosts; this is a sandbox client, not the app's API client.
          credentials: "omit",
        });
        const buf = await res.arrayBuffer();
        const text = new TextDecoder().decode(buf);
        const finished =
          typeof performance !== "undefined" ? performance.now() : Date.now();
        result = {
          status: res.status,
          statusText: res.statusText,
          ok: res.ok,
          headers: headersToList(res.headers),
          body: text,
          json: tryParseJson(text),
          timeMs: Math.round(finished - started),
          sizeBytes: buf.byteLength,
        };
      } catch (e) {
        const finished =
          typeof performance !== "undefined" ? performance.now() : Date.now();
        const message = e instanceof Error ? e.message : "Network error";
        result = {
          status: 0,
          statusText: "Network error",
          ok: false,
          headers: [],
          body: "",
          json: undefined,
          timeMs: Math.round(finished - started),
          sizeBytes: 0,
          networkError: {
            message:
              message +
              " — if this is the sandbox container, use the \"Use container\" button so the request is proxied.",
          },
        };
      }
    }

    setResponse(result);
    setHistory((prev) => {
      const entry: HistoryEntry = {
        id: historyId(),
        request: snapshot,
        response: result,
        sentAt: Date.now(),
      };
      return [entry, ...prev].slice(0, MAX_HISTORY);
    });
    setSending(false);
  }, [request, sending, sessionId, containerOrigin, shareToken]);

  return {
    request,
    response,
    sending,
    history,
    setMethod,
    setUrl,
    setBodyMode,
    setBodyText,
    setParam: paramOps.patch,
    removeParam: paramOps.remove,
    setHeader: headerOps.patch,
    removeHeader: headerOps.remove,
    setFormRow: formOps.patch,
    removeFormRow: formOps.remove,
    loadUrl,
    restore,
    send,
  };
}
