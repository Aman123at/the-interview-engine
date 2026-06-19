/**
 * Auth primitives: password hashing + JWT sign/verify.
 *
 * The verify functions here are the SINGLE source of truth for token
 * validation — reused by HTTP middleware (Phase 2) and the socket.io
 * handshake (Phase 7). Do not duplicate this logic anywhere else.
 */
import bcrypt from 'bcrypt';
import jwt, { type SignOptions, type JwtPayload } from 'jsonwebtoken';
import { config } from '@/config/index.js';
import { UnauthorizedError } from '@/errors/index.js';
import type { UserRole } from '@/db/schema/index.js';

const BCRYPT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}

// ---------- Token payloads ----------

export interface AccessTokenPayload {
  sub: string; // user id
  role: UserRole;
  typ: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  tv: number; // token version — must match user.token_version
  typ: 'refresh';
}

// ---------- Sign ----------

const accessSignOpts: SignOptions = {
  expiresIn: config.JWT_ACCESS_TTL as SignOptions['expiresIn'],
  algorithm: 'HS256',
  issuer: 'interview-sandbox-server',
  audience: 'interview-sandbox-client',
};
const refreshSignOpts: SignOptions = {
  expiresIn: config.JWT_REFRESH_TTL as SignOptions['expiresIn'],
  algorithm: 'HS256',
  issuer: 'interview-sandbox-server',
  audience: 'interview-sandbox-client',
};

export function signAccessToken(payload: Omit<AccessTokenPayload, 'typ'>): string {
  return jwt.sign({ ...payload, typ: 'access' }, config.JWT_ACCESS_SECRET, accessSignOpts);
}

export function signRefreshToken(payload: Omit<RefreshTokenPayload, 'typ'>): string {
  return jwt.sign({ ...payload, typ: 'refresh' }, config.JWT_REFRESH_SECRET, refreshSignOpts);
}

// ---------- Verify ----------

const verifyOpts = {
  algorithms: ['HS256' as const],
  issuer: 'interview-sandbox-server',
  audience: 'interview-sandbox-client',
};

function asPayload(decoded: string | JwtPayload): JwtPayload {
  if (typeof decoded === 'string') {
    throw new UnauthorizedError('Invalid token (unexpected string payload)');
  }
  return decoded;
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = asPayload(jwt.verify(token, config.JWT_ACCESS_SECRET, verifyOpts));
    if (decoded.typ !== 'access' || typeof decoded.sub !== 'string' || !decoded.role) {
      throw new UnauthorizedError('Invalid access token');
    }
    return { sub: decoded.sub, role: decoded.role as UserRole, typ: 'access' };
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err;
    throw new UnauthorizedError(
      err instanceof jwt.TokenExpiredError ? 'Access token expired' : 'Invalid access token',
    );
  }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const decoded = asPayload(jwt.verify(token, config.JWT_REFRESH_SECRET, verifyOpts));
    if (
      decoded.typ !== 'refresh' ||
      typeof decoded.sub !== 'string' ||
      typeof decoded.tv !== 'number'
    ) {
      throw new UnauthorizedError('Invalid refresh token');
    }
    return { sub: decoded.sub, tv: decoded.tv, typ: 'refresh' };
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err;
    throw new UnauthorizedError(
      err instanceof jwt.TokenExpiredError ? 'Refresh token expired' : 'Invalid refresh token',
    );
  }
}
