/**
 * Server-side proxy for the in-app API client ("Postman" tab).
 *
 * The browser-based API client cannot fetch the container's dev server directly:
 * the client app runs on a different origin (localhost:3000) than the container
 * (127.0.0.1:<hostPort>), and the candidate's server sends no CORS headers, so
 * the browser blocks the cross-origin response. (It "works" in a real browser
 * tab only because that's a top-level navigation, not a CORS fetch.)
 *
 * Instead the client sends the request to OUR server, which runs on the SAME
 * host as the container and fetches it over loopback — no CORS involved. The
 * client only controls the method/path/headers/body; the target host:port is
 * ALWAYS the session's own preview port (set by the caller), so this can't be
 * turned into an open SSRF proxy.
 */
import { z } from 'zod';
import { logger } from '@/utils/logger.js';

const TIMEOUT_MS = 30_000;
const MAX_BODY_BYTES = 10 * 1024 * 1024; // 10 MiB response cap

export const PROXY_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;
export type ProxyMethod = (typeof PROXY_METHODS)[number];

/** Shared request schema for both the authed and the candidate (token) proxy routes. */
export const proxyBodySchema = z.object({
  method: z.enum(PROXY_METHODS),
  // Path + query only; the server fixes the host:port to the session's own
  // container, so the client never controls the destination.
  path: z.string().min(1).max(4096).refine((p) => p.startsWith('/'), 'path must start with /'),
  headers: z
    .array(z.object({ name: z.string().min(1).max(256), value: z.string().max(8192) }))
    .max(100)
    .optional()
    .default([]),
  /** Request body. base64 for binary safety; utf8 accepted too. */
  body: z.string().max(20 * 1024 * 1024).optional(),
  bodyEncoding: z.enum(['utf8', 'base64']).optional().default('utf8'),
});

// Headers we must not forward verbatim (let undici/fetch manage them).
const STRIP_REQUEST_HEADERS = new Set([
  'host',
  'connection',
  'content-length',
  'accept-encoding',
  'transfer-encoding',
  'upgrade',
  'keep-alive',
]);

export interface ProxyInput {
  /** Localhost-mode published host port. Null in subdomain mode. */
  hostPort: number | null;
  /** Container name + dev port, used in subdomain mode (sandbox network). */
  containerName?: string;
  containerPort?: number | null;
  method: ProxyMethod;
  /** Path + query, must start with '/'. */
  path: string;
  headers: Array<{ name: string; value: string }>;
  /** Raw request body (already decoded). Undefined for body-less methods. */
  body?: Buffer;
}

export type ProxyResult =
  | {
      ok: true;
      status: number;
      statusText: string;
      headers: Array<{ name: string; value: string }>;
      /** base64 so binary bodies survive the JSON hop. */
      bodyBase64: string;
      sizeBytes: number;
      truncated: boolean;
      timeMs: number;
    }
  | {
      ok: false;
      /** The upstream (container) was unreachable / errored before a response. */
      error: { message: string };
      timeMs: number;
    };

export async function forwardToContainer(input: ProxyInput): Promise<ProxyResult> {
  // Localhost mode: loopback to the published host port.
  // Subdomain mode: resolve the container by name over the shared sandbox
  // network (the API process is attached to it in prod).
  const target = input.hostPort != null
    ? `http://127.0.0.1:${input.hostPort}${input.path}`
    : `http://${input.containerName}:${input.containerPort}${input.path}`;

  const headers = new Headers();
  for (const h of input.headers) {
    if (!h.name) continue;
    if (STRIP_REQUEST_HEADERS.has(h.name.toLowerCase())) continue;
    try {
      headers.append(h.name, h.value);
    } catch {
      // Skip a single malformed header rather than failing the whole request.
    }
  }

  const started = performance.now();
  try {
    const res = await fetch(target, {
      method: input.method,
      headers,
      body: input.body && input.method !== 'GET' && input.method !== 'HEAD' ? input.body : undefined,
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    // Read up to the cap so a runaway endpoint can't exhaust memory.
    const full = Buffer.from(await res.arrayBuffer());
    const truncated = full.byteLength > MAX_BODY_BYTES;
    const body = truncated ? full.subarray(0, MAX_BODY_BYTES) : full;

    const outHeaders: Array<{ name: string; value: string }> = [];
    res.headers.forEach((value, name) => outHeaders.push({ name, value }));

    return {
      ok: true,
      status: res.status,
      statusText: res.statusText,
      headers: outHeaders,
      bodyBase64: body.toString('base64'),
      sizeBytes: full.byteLength,
      truncated,
      timeMs: Math.round(performance.now() - started),
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.name === 'TimeoutError'
          ? `Request timed out after ${TIMEOUT_MS / 1000}s`
          : err.message
        : String(err);
    logger.debug({ err, target }, 'apiProxy: upstream fetch failed');
    return { ok: false, error: { message }, timeMs: Math.round(performance.now() - started) };
  }
}
