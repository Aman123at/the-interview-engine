/**
 * Socket.io handshake authentication.
 *
 * Reuses Phase 2's `verifyAccessToken` — the SAME verify helper protects
 * HTTP `requireAuth` and the socket handshake. Tokens are checked on EVERY
 * (re)connect; if the token is expired we tell the client clearly so it can
 * refresh and re-handshake.
 */
import type { Socket } from 'socket.io';
import { config } from '@/config/index.js';
import { verifyAccessToken } from '@/services/auth.js';
import { usersDal, sessionsDal, designDocumentsDal } from '@/dal/index.js';
import { UnauthorizedError } from '@/errors/index.js';

/**
 * The identity resolved from a handshake. An interviewer authenticates with a
 * JWT (and owns sessions); a candidate authenticates with a session's share
 * token (no account) and is scoped to that one session.
 */
export type HandshakeIdentity =
  | { role: 'interviewer'; userId: string }
  | { role: 'candidate'; sessionId: string; shareToken: string }
  | { role: 'design_guest'; docId: string; designShareToken: string };

/** Minimal RFC 6265 cookie-header parser — no dep needed. */
function parseCookieHeader(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (!name) continue;
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }
  return out;
}

function tokenFromHandshake(socket: Socket): string | null {
  // 1. socket.io standard `auth.token` (preferred by clients).
  const authToken =
    socket.handshake.auth && typeof socket.handshake.auth === 'object'
      ? (socket.handshake.auth as { token?: unknown }).token
      : undefined;
  if (typeof authToken === 'string' && authToken.length > 0) return authToken;

  // 2. Cookie header — same isb_at the HTTP middleware uses.
  const rawCookie = socket.handshake.headers.cookie;
  if (rawCookie) {
    const parsed = parseCookieHeader(rawCookie);
    const c = parsed[config.ACCESS_COOKIE_NAME];
    if (c) return c;
  }

  // 3. Authorization: Bearer <token>
  const authHeader = socket.handshake.headers.authorization;
  if (authHeader && typeof authHeader === 'string') {
    const [scheme, value] = authHeader.split(' ');
    if (scheme?.toLowerCase() === 'bearer' && value) return value.trim();
  }
  return null;
}

function shareTokenFromHandshake(socket: Socket): string | null {
  const auth = socket.handshake.auth;
  if (auth && typeof auth === 'object') {
    const t = (auth as { shareToken?: unknown }).shareToken;
    if (typeof t === 'string' && t.length > 0) return t;
  }
  return null;
}

function designShareTokenFromHandshake(socket: Socket): string | null {
  const auth = socket.handshake.auth;
  if (auth && typeof auth === 'object') {
    const t = (auth as { designShareToken?: unknown }).designShareToken;
    if (typeof t === 'string' && t.length > 0) return t;
  }
  return null;
}

export async function authenticateHandshake(socket: Socket): Promise<HandshakeIdentity> {
  // ---- Design guest path: a token authorizes access to ONE design doc ----
  // (Checked before the code-session candidate path so a client can mix both
  // tokens on the same auth blob without ambiguity — design wins.)
  const designShareToken = designShareTokenFromHandshake(socket);
  if (designShareToken) {
    const doc = await designDocumentsDal.findByShareToken(designShareToken);
    if (!doc) throw new UnauthorizedError('Invalid or expired share link');
    return { role: 'design_guest', docId: doc.id, designShareToken };
  }

  // ---- Candidate path: a share token authorizes access to ONE session ----
  const shareToken = shareTokenFromHandshake(socket);
  if (shareToken) {
    const session = await sessionsDal.findByShareToken(shareToken);
    if (!session) throw new UnauthorizedError('Invalid or expired share link');
    if (session.status === 'ended' || session.status === 'error') {
      throw new UnauthorizedError('Session has ended');
    }
    return { role: 'candidate', sessionId: session.id, shareToken };
  }

  // ---- Interviewer path: JWT (same verify helper as HTTP requireAuth) ----
  const token = tokenFromHandshake(socket);
  if (!token) throw new UnauthorizedError('Missing access token');
  const payload = verifyAccessToken(token); // throws UnauthorizedError on expiry/tamper
  const user = await usersDal.findById(payload.sub);
  if (!user || !user.isActive) throw new UnauthorizedError('User not found or inactive');
  return { role: 'interviewer', userId: user.id };
}
