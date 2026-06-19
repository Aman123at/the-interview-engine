import { Router, type Request, type Response, type CookieOptions } from 'express';

import { config, cookieSecure } from '@/config/index.js';
import { logger } from '@/utils/logger.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  verifyPassword,
} from '@/services/auth.js';
import { usersDal, interviewerSpecializationsDal } from '@/dal/index.js';
import { UnauthorizedError } from '@/errors/index.js';
import { requireAuth } from '@/middleware/auth.js';
import { loginRateLimiter } from '@/middleware/rateLimit.js';
import type { User } from '@/db/schema/index.js';
import {
  loginRequest,
  type AuthResponse,
  type MeResponse,
  type PublicUser,
} from '@/contracts/index.js';

export const authRouter = Router();

/** Public shape we return for a user — never includes the password hash. */
function publicUser(u: User): PublicUser {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    role: u.role,
  };
}

// Cookie attrs are env-driven so the same code runs in localhost dev (host-only,
// Secure=false, SameSite=lax) and in a multi-subdomain prod deploy
// (Domain=.<base>, Secure=true, SameSite=lax|none).
function baseCookieAttrs(): Pick<CookieOptions, 'sameSite' | 'secure' | 'domain'> {
  const attrs: Pick<CookieOptions, 'sameSite' | 'secure' | 'domain'> = {
    sameSite: config.COOKIE_SAMESITE,
    secure: cookieSecure,
  };
  if (config.COOKIE_DOMAIN) attrs.domain = config.COOKIE_DOMAIN;
  return attrs;
}

function refreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    ...baseCookieAttrs(),
    path: '/auth', // only /auth/* — refresh is never needed elsewhere
    // Cookie lifetime is a generous cap; the JWT's `exp` is the authoritative expiry.
    maxAge: 30 * 24 * 60 * 60 * 1000,
  };
}

function accessCookieOptions(): CookieOptions {
  return {
    httpOnly: true, // never readable by JS — XSS can't steal the token
    ...baseCookieAttrs(),
    path: '/', // sent on every API request
    // 1h browser-side cap. The JWT itself expires at JWT_ACCESS_TTL (default 15m)
    // and that check in verifyAccessToken is authoritative — this is just to
    // bound the cookie's life if the user walks away.
    maxAge: 60 * 60 * 1000,
  };
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(config.REFRESH_COOKIE_NAME, { ...refreshCookieOptions(), maxAge: undefined });
}

function clearAccessCookie(res: Response): void {
  res.clearCookie(config.ACCESS_COOKIE_NAME, { ...accessCookieOptions(), maxAge: undefined });
}

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(config.REFRESH_COOKIE_NAME, token, refreshCookieOptions());
}

function setAccessCookie(res: Response, token: string): void {
  res.cookie(config.ACCESS_COOKIE_NAME, token, accessCookieOptions());
}

// ---------- POST /auth/login ----------
authRouter.post('/auth/login', loginRateLimiter, async (req: Request, res: Response, next) => {
  try {
    const parsed = loginRequest.parse(req.body);
    const email = (parsed.email ?? parsed.identifier ?? '').trim().toLowerCase();
    const password = parsed.password;

    const user = await usersDal.findByEmail(email);
    if (!user) {
      req.log.warn({ email, ip: req.ip }, 'login failed: unknown email');
      throw new UnauthorizedError('Invalid credentials');
    }
    if (!user.isActive) {
      req.log.warn({ userId: user.id, email, ip: req.ip }, 'login failed: user inactive');
      throw new UnauthorizedError('Invalid credentials');
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      req.log.warn({ userId: user.id, email, ip: req.ip }, 'login failed: bad password');
      throw new UnauthorizedError('Invalid credentials');
    }

    const accessToken = signAccessToken({ sub: user.id, role: user.role });
    const refreshToken = signRefreshToken({ sub: user.id, tv: user.tokenVersion });
    setAccessCookie(res, accessToken);
    setRefreshCookie(res, refreshToken);

    req.log.info({ userId: user.id, email }, 'login success');
    // accessToken returned in body too so non-browser clients (curl, the
    // socket.io handshake, future API consumers) can use the Bearer fallback.
    const body: AuthResponse = { accessToken, user: publicUser(user) };
    res.json(body);
  } catch (err) {
    next(err);
  }
});

// ---------- POST /auth/refresh ----------
authRouter.post('/auth/refresh', async (req: Request, res: Response, next) => {
  try {
    const cookieToken: string | undefined = (req.cookies as Record<string, string> | undefined)?.[
      config.REFRESH_COOKIE_NAME
    ];
    if (!cookieToken) throw new UnauthorizedError('Missing refresh token');

    const payload = verifyRefreshToken(cookieToken);
    const user = await usersDal.findById(payload.sub);
    if (!user || !user.isActive) throw new UnauthorizedError('User not found or inactive');

    // tokenVersion must match — bumped on logout, this is how we revoke.
    if (payload.tv !== user.tokenVersion) {
      req.log.warn(
        { userId: user.id, tokenTv: payload.tv, userTv: user.tokenVersion },
        'refresh failed: token version mismatch',
      );
      throw new UnauthorizedError('Refresh token revoked');
    }

    // Rotate: mint fresh access + refresh pair. Same tokenVersion (rotation
    // doesn't invalidate — only logout does), but a brand-new token string.
    const accessToken = signAccessToken({ sub: user.id, role: user.role });
    const refreshToken = signRefreshToken({ sub: user.id, tv: user.tokenVersion });
    setAccessCookie(res, accessToken);
    setRefreshCookie(res, refreshToken);

    const body: AuthResponse = { accessToken, user: publicUser(user) };
    res.json(body);
  } catch (err) {
    next(err);
  }
});

// ---------- POST /auth/logout ----------
authRouter.post('/auth/logout', async (req: Request, res: Response, next) => {
  try {
    // Best-effort: if a valid refresh cookie is present, bump tokenVersion to
    // invalidate every outstanding refresh token for this user. If anything is
    // off (missing/invalid cookie), still clear and return 204 — logout is
    // idempotent.
    const cookieToken: string | undefined = (req.cookies as Record<string, string> | undefined)?.[
      config.REFRESH_COOKIE_NAME
    ];
    if (cookieToken) {
      try {
        const payload = verifyRefreshToken(cookieToken);
        await usersDal.bumpTokenVersion(payload.sub);
        req.log.info({ userId: payload.sub }, 'logout: bumped token version');
      } catch {
        // ignore — still clear cookie
      }
    }
    clearAccessCookie(res);
    clearRefreshCookie(res);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ---------- GET /auth/me ----------
authRouter.get('/auth/me', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const user = req.user;
    if (!user) {
      logger.error('GET /auth/me reached without req.user — middleware bug');
      res.status(500).json({ error: { code: 'INTERNAL', message: 'auth state missing' } });
      return;
    }
    // Interviewers carry their (type, level) specializations so the client can
    // gate candidate visibility. Admin/HR get `undefined`.
    const body: MeResponse = { user: publicUser(user) };
    if (user.role === 'interviewer') {
      body.specializations = await interviewerSpecializationsDal.listForUser(user.id);
    }
    res.json(body);
  } catch (err) {
    next(err);
  }
});
