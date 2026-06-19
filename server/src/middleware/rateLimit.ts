import rateLimit from 'express-rate-limit';
import type { Request } from 'express';
import { config } from '@/config/index.js';
import { RateLimitError } from '@/errors/index.js';

/** Normalize an IPv4-mapped IPv6 (::ffff:1.2.3.4) and strip an embedded port. */
function normalizeIp(raw: string): string {
  let ip = raw;
  if (ip.startsWith('::ffff:')) ip = ip.slice('::ffff:'.length);
  const colon = ip.lastIndexOf(':');
  // Only strip a trailing port if this looks like IPv4:PORT.
  if (colon > 0 && ip.indexOf(':') === colon) ip = ip.slice(0, colon);
  return ip;
}

/**
 * Per-IP+email rate limit for /auth/login. Treats unknown emails the same as
 * a malformed body so probing for valid emails costs the same as random
 * gibberish. Throws our RateLimitError so the global error handler renders
 * the standard JSON shape (with requestId).
 */
export const loginRateLimiter = rateLimit({
  windowMs: config.LOGIN_RATE_WINDOW_MS,
  limit: config.LOGIN_RATE_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req: Request): string => {
    const ip = normalizeIp(req.ip ?? '');
    const email =
      typeof req.body === 'object' && req.body !== null && 'email' in req.body
        ? String((req.body as { email?: unknown }).email ?? '').toLowerCase()
        : '';
    return `${ip}:${email}`;
  },
  handler: (_req, _res, next) => {
    next(new RateLimitError('Too many login attempts — please slow down'));
  },
});
