/**
 * Test environment shim. Sets env vars BEFORE the config module is imported so
 * the zod validator passes without requiring a real .env. Importing this file
 * via vitest `setupFiles` guarantees it runs first.
 */
process.env.NODE_ENV ??= 'test';
process.env.LOG_LEVEL ??= 'silent';
process.env.CORS_ORIGINS ??= 'http://localhost:3000';
process.env.DATABASE_URL ??= 'postgres://postgres:postgres@localhost:5432/interview_sandbox';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
process.env.JWT_ACCESS_TTL ??= '15m';
process.env.JWT_REFRESH_TTL ??= '7d';
process.env.REFRESH_COOKIE_NAME ??= 'isb_rt';
process.env.ACCESS_COOKIE_NAME ??= 'isb_at';
process.env.LOGIN_RATE_WINDOW_MS ??= '60000';
process.env.LOGIN_RATE_MAX ??= '10';
