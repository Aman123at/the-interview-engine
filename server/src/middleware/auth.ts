import type { Request, RequestHandler } from 'express';
import { config } from '@/config/index.js';
import { UnauthorizedError, ForbiddenError } from '@/errors/index.js';
import { verifyAccessToken, type AccessTokenPayload } from '@/services/auth.js';
import { usersDal } from '@/dal/index.js';
import type { User, UserRole } from '@/db/schema/index.js';

declare global {
  namespace Express {
    interface Request {
      auth?: AccessTokenPayload;
      user?: User;
    }
  }
}

function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim();
}

/**
 * Pull the access token from (in order):
 *   1. the httpOnly cookie named `ACCESS_COOKIE_NAME` (the primary path —
 *      browser clients never see the raw token)
 *   2. `Authorization: Bearer <token>` (for curl, the socket.io handshake in
 *      Phase 7, and any future non-browser API consumer)
 *
 * Exported so the socket.io handshake can reuse the same extraction logic
 * over its `handshake.headers` / `handshake.auth.token`.
 */
export function extractAccessToken(req: Request): string | null {
  const cookies = req.cookies as Record<string, string> | undefined;
  const fromCookie = cookies?.[config.ACCESS_COOKIE_NAME];
  if (fromCookie) return fromCookie;
  return extractBearer(req.header('authorization'));
}

/**
 * Verify the access token, load the user, attach both to req.
 * Rejects inactive or deleted users.
 */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const token = extractAccessToken(req);
    if (!token) throw new UnauthorizedError('Missing access token');

    const payload = verifyAccessToken(token);
    const user = await usersDal.findById(payload.sub);
    if (!user || !user.isActive) throw new UnauthorizedError('User not found or inactive');

    req.auth = payload;
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};

export function requireRole(...allowed: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(new UnauthorizedError());
    if (!allowed.includes(req.user.role)) return next(new ForbiddenError());
    next();
  };
}
