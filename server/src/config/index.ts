import 'dotenv/config';
import { existsSync } from 'node:fs';
import { z } from 'zod';

/**
 * Docker Desktop on macOS publishes the daemon socket under $HOME, not
 * /var/run. Detect the user-scoped path at runtime and fall back to the
 * standard Linux path. Override with `DOCKER_SOCKET` in .env if needed.
 */
function detectDockerSocket(): string {
  const userSock = process.env.HOME ? `${process.env.HOME}/.docker/run/docker.sock` : null;
  if (userSock && existsSync(userSock)) return userSock;
  return '/var/run/docker.sock';
}

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('debug'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((s) =>
      s
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    ),
  DATABASE_URL: z.string().url(),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  // Phase 1 seed: JSON array of { email, password, displayName, role? }
  // (role defaults to 'interviewer'). Used by `pnpm seed` only.
  SEED_USERS: z.string().optional(),
  // Optional. JSON array of { externalId, name, types: string[] (interview-type keys) }
  // Used by `pnpm seed` only. Falls back to a small built-in sample if unset.
  SEED_CANDIDATES: z.string().optional(),
  // ---- Phase 2 auth ----
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be ≥ 32 chars'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be ≥ 32 chars'),
  // Token TTLs accept the standard jsonwebtoken syntax: `15m`, `1h`, `7d`, …
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  REFRESH_COOKIE_NAME: z.string().default('isb_rt'),
  ACCESS_COOKIE_NAME: z.string().default('isb_at'),
  // Login rate-limit
  LOGIN_RATE_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  LOGIN_RATE_MAX: z.coerce.number().int().positive().default(10),
  // ---- Phase 6 orchestrator ----
  PREVIEW_PORT_MIN: z.coerce.number().int().min(1024).max(65_535).default(4100),
  PREVIEW_PORT_MAX: z.coerce.number().int().min(1024).max(65_535).default(4199),
  // Hard cap on concurrent sessions — see docker/README.md per-host budget.
  MAX_CONCURRENT_SESSIONS: z.coerce.number().int().positive().max(50).default(20),
  // How long we wait for the dev server / init to reach `PROGRESS ready done`.
  INIT_TIMEOUT_MS: z.coerce.number().int().positive().default(180_000),
  // Idle ceiling — reaper marks running-but-idle sessions recoverable past this.
  SESSION_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().default(30 * 60 * 1000),
  // How often the reaper wakes (default 60 s — light load).
  REAPER_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
  // Sessions stuck in `error` longer than this get their port+volume reclaimed.
  REAPER_ERROR_TTL_MS: z.coerce.number().int().positive().default(60 * 60 * 1000), // 1 h
  // Sessions in `recoverable` longer than this get force-ended (volume kept).
  REAPER_RECOVERABLE_TTL_MS: z.coerce.number().int().positive().default(24 * 60 * 60 * 1000), // 24 h
  // Docker socket — auto-detected at boot; override via env if needed.
  // Ignored when DOCKER_HOST (tcp://…) is set.
  DOCKER_SOCKET: z.string().default(detectDockerSocket()),
  // Optional. When set (e.g. tcp://dockerproxy:2375) dockerode connects via TCP
  // instead of the local unix socket. Used in prod where the API talks to a
  // docker-socket-proxy sidecar; unset in dev → falls back to DOCKER_SOCKET.
  DOCKER_HOST: z.string().optional(),

  // ---- Preview wiring (Phase deployment-aware) ----
  // 'localhost' — publish a host port per session (current dev behavior).
  // 'subdomain' — no host port; attach container to SANDBOX_NETWORK and stamp
  //               Traefik labels so https://<id>.<base-domain> routes to it.
  PREVIEW_MODE: z.enum(['localhost', 'subdomain']).default('localhost'),
  PREVIEW_BASE_DOMAIN: z.string().optional(),
  PREVIEW_SCHEME: z.enum(['http', 'https']).optional(),
  SANDBOX_NETWORK: z.string().default('sandbox'),
  TRAEFIK_CERTRESOLVER: z.string().default('le'),
  TRAEFIK_ENTRYPOINT: z.string().default('websecure'),
  TRAEFIK_PREVIEW_MIDDLEWARE: z.string().default('preview-csp@file'),

  // ---- Auth cookies + CORS (env-driven, both modes) ----
  CLIENT_ORIGIN: z.string().optional(),
  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SECURE: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .optional()
    .transform((v) => (typeof v === 'string' ? v === 'true' : v)),
  COOKIE_SAMESITE: z.enum(['lax', 'none', 'strict']).default('lax'),
}).superRefine((env, ctx) => {
  if (env.PREVIEW_MODE === 'subdomain' && !env.PREVIEW_BASE_DOMAIN) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['PREVIEW_BASE_DOMAIN'],
      message: 'PREVIEW_BASE_DOMAIN is required when PREVIEW_MODE=subdomain',
    });
  }
});

export type AppConfig = z.infer<typeof EnvSchema>;

function loadConfig(): AppConfig {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    // Fail fast: print and exit, before logger is even up.
    // eslint-disable-next-line no-console
    console.error(
      '[config] Invalid environment variables:\n',
      JSON.stringify(parsed.error.flatten().fieldErrors, null, 2),
    );
    process.exit(1);
  }
  return parsed.data;
}

export const config: AppConfig = loadConfig();

export const isProd = config.NODE_ENV === 'production';
export const isDev = config.NODE_ENV === 'development';

/** Centralized derivations so callers don't repeat env branching. */
export const previewScheme: 'http' | 'https' =
  config.PREVIEW_SCHEME ?? (config.PREVIEW_MODE === 'subdomain' ? 'https' : 'http');

export const cookieSecure: boolean = config.COOKIE_SECURE ?? isProd;

/** CORS origin list — CLIENT_ORIGIN (if set) is unioned with CORS_ORIGINS. */
export const corsOrigins: string[] = (() => {
  const set = new Set(config.CORS_ORIGINS);
  if (config.CLIENT_ORIGIN) set.add(config.CLIENT_ORIGIN);
  return [...set];
})();
