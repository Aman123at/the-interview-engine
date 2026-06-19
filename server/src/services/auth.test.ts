import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import {
  hashPassword,
  verifyPassword,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from './auth.js';
import { UnauthorizedError } from '@/errors/index.js';
import { config } from '@/config/index.js';

describe('password hashing', () => {
  it('hashes and verifies a correct password', async () => {
    const hash = await hashPassword('hunter22-correct');
    expect(hash).not.toEqual('hunter22-correct');
    expect(hash.startsWith('$2')).toBe(true);
    await expect(verifyPassword('hunter22-correct', hash)).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('right-password');
    await expect(verifyPassword('wrong-password', hash)).resolves.toBe(false);
  });

  it('rejects against an empty hash', async () => {
    await expect(verifyPassword('whatever', '')).resolves.toBe(false);
  });

  it('produces different hashes for the same input (salt)', async () => {
    const a = await hashPassword('same-pw');
    const b = await hashPassword('same-pw');
    expect(a).not.toEqual(b);
    await expect(verifyPassword('same-pw', a)).resolves.toBe(true);
    await expect(verifyPassword('same-pw', b)).resolves.toBe(true);
  });
});

describe('access tokens', () => {
  it('signs and verifies a valid access token round-trip', () => {
    const token = signAccessToken({ sub: 'user-123', role: 'interviewer' });
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe('user-123');
    expect(payload.role).toBe('interviewer');
    expect(payload.typ).toBe('access');
  });

  it('rejects a token signed with a different secret', () => {
    const bad = jwt.sign(
      { sub: 'user-123', role: 'interviewer', typ: 'access' },
      'wrong-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      { algorithm: 'HS256', issuer: 'interview-sandbox-server', audience: 'interview-sandbox-client' },
    );
    expect(() => verifyAccessToken(bad)).toThrow(UnauthorizedError);
  });

  it('rejects a refresh token passed to verifyAccessToken', () => {
    const refresh = signRefreshToken({ sub: 'user-123', tv: 0 });
    expect(() => verifyAccessToken(refresh)).toThrow(UnauthorizedError);
  });

  it('rejects an expired access token', () => {
    const expired = jwt.sign(
      { sub: 'user-123', role: 'interviewer', typ: 'access' },
      config.JWT_ACCESS_SECRET,
      {
        algorithm: 'HS256',
        issuer: 'interview-sandbox-server',
        audience: 'interview-sandbox-client',
        expiresIn: '-1s',
      },
    );
    expect(() => verifyAccessToken(expired)).toThrow(/expired/i);
  });

  it('rejects a tampered token', () => {
    const token = signAccessToken({ sub: 'user-123', role: 'interviewer' });
    const tampered = token.slice(0, -4) + 'AAAA';
    expect(() => verifyAccessToken(tampered)).toThrow(UnauthorizedError);
  });

  it('rejects a token with wrong issuer/audience', () => {
    const bad = jwt.sign(
      { sub: 'user-123', role: 'interviewer', typ: 'access' },
      config.JWT_ACCESS_SECRET,
      { algorithm: 'HS256', issuer: 'someone-else', audience: 'someone-else' },
    );
    expect(() => verifyAccessToken(bad)).toThrow(UnauthorizedError);
  });
});

describe('refresh tokens', () => {
  it('signs and verifies a valid refresh token round-trip', () => {
    const token = signRefreshToken({ sub: 'user-abc', tv: 3 });
    const payload = verifyRefreshToken(token);
    expect(payload.sub).toBe('user-abc');
    expect(payload.tv).toBe(3);
    expect(payload.typ).toBe('refresh');
  });

  it('rejects an access token passed to verifyRefreshToken', () => {
    const access = signAccessToken({ sub: 'user-abc', role: 'admin' });
    expect(() => verifyRefreshToken(access)).toThrow(UnauthorizedError);
  });

  it('rejects a refresh token missing tv', () => {
    const bad = jwt.sign(
      { sub: 'user-abc', typ: 'refresh' },
      config.JWT_REFRESH_SECRET,
      { algorithm: 'HS256', issuer: 'interview-sandbox-server', audience: 'interview-sandbox-client' },
    );
    expect(() => verifyRefreshToken(bad)).toThrow(UnauthorizedError);
  });

  it('rejects garbage', () => {
    expect(() => verifyRefreshToken('not.a.jwt')).toThrow(UnauthorizedError);
  });
});
