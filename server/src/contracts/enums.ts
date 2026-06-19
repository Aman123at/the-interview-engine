/**
 * Shared literal unions + matching zod schemas. The single source of truth for
 * every enum-ish value that crosses the wire. Keep this file dependency-light
 * (only `zod`) so it can be copied verbatim into the client repo.
 */
import { z } from 'zod';

// --- Session lifecycle -----------------------------------------------------

export const SESSION_STATUSES = [
  'pending',
  'initializing',
  'running',
  'saving',
  'ended',
  'error',
  'recoverable',
] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];
export const sessionStatusSchema = z.enum(SESSION_STATUSES);

/** Non-terminal states for the hard one-session rule. */
export const NON_TERMINAL_SESSION_STATUSES = [
  'pending',
  'initializing',
  'running',
  'saving',
  'recoverable',
] as const satisfies readonly SessionStatus[];

export const TERMINAL_SESSION_STATUSES = [
  'ended',
  'error',
] as const satisfies readonly SessionStatus[];

// --- Session kind (Phase 19 forward-compat) --------------------------------

export const SESSION_KINDS = ['code', 'db_design', 'system_design'] as const;
export type SessionKind = (typeof SESSION_KINDS)[number];
export const sessionKindSchema = z.enum(SESSION_KINDS);

// --- Framework ids ---------------------------------------------------------

export const FRAMEWORK_IDS = [
  'react',
  'node',
  'python',
  'golang',
  'javascript',
  'cpp',
  'fullstack',
] as const;
export type FrameworkId = (typeof FRAMEWORK_IDS)[number];
export const frameworkIdSchema = z.enum(FRAMEWORK_IDS);

// --- Preview ---------------------------------------------------------------

export const PREVIEW_KINDS = ['iframe', 'api', 'none'] as const;
export type PreviewKind = (typeof PREVIEW_KINDS)[number];
export const previewKindSchema = z.enum(PREVIEW_KINDS);

// --- Terminal --------------------------------------------------------------

export const TERMINAL_KINDS = ['shell', 'psql', 'mongosh', 'mysql'] as const;
export type TerminalKind = (typeof TERMINAL_KINDS)[number];
export const terminalKindSchema = z.enum(TERMINAL_KINDS);

// --- Sharing ---------------------------------------------------------------

export const SHARE_ROLES = ['interviewer', 'candidate'] as const;
export type ShareRole = (typeof SHARE_ROLES)[number];
export const shareRoleSchema = z.enum(SHARE_ROLES);

// --- Design canvas roles (multi-user share, separate from ShareRole) -------

/**
 * Roles inside a shared design-canvas room. Distinct from `ShareRole` because
 * design sharing is multi-user (up to 5 peers) and has no read-only swap —
 * everyone admitted can draw. The owner (`design_owner`) is the authenticated
 * doc owner; guests (`design_guest`) hold the share token.
 */
export const DESIGN_ROLES = ['design_owner', 'design_guest'] as const;
export type DesignRole = (typeof DESIGN_ROLES)[number];
export const designRoleSchema = z.enum(DESIGN_ROLES);

/** Hard cap on concurrent peers in a single shared design canvas. */
export const DESIGN_ROOM_MAX_PEERS = 5;

// --- User role -------------------------------------------------------------

export const USER_ROLES = ['admin', 'hr', 'interviewer'] as const;
export type UserRole = (typeof USER_ROLES)[number];
/** Alias to make the role's meaning at call sites obvious. */
export type Role = UserRole;
export const userRoleSchema = z.enum(USER_ROLES);

// --- Interviewer specialization levels ------------------------------------

export const LEVELS = ['L1', 'L2', 'L3'] as const;
export type Level = (typeof LEVELS)[number];
export const levelSchema = z.enum(LEVELS);

// --- Design documents (Phase 19) ------------------------------------------

export const DESIGN_DOC_KINDS = ['db_design', 'system_design'] as const;
export type DesignDocKind = (typeof DESIGN_DOC_KINDS)[number];
export const designDocKindSchema = z.enum(DESIGN_DOC_KINDS);

export const DESIGN_DB_ENGINES = ['postgresql', 'mysql', 'mongodb'] as const;
export type DesignDbEngine = (typeof DESIGN_DB_ENGINES)[number];
export const designDbEngineSchema = z.enum(DESIGN_DB_ENGINES);

// --- Session-event types (the WS lifecycle relay) --------------------------

export const SESSION_EVENT_TYPES = [
  'ws_init',
  'ws_reconnect',
  'ws_disconnect',
  'container_create',
  'container_start',
  'container_ready',
  'container_stop',
  'container_destroy',
  'container_die',
  'container_oom',
  'preview_ready',
  'session_resume',
  'session_close',
  'error',
] as const;
export type SessionEventType = (typeof SESSION_EVENT_TYPES)[number] | (string & {});

export const SESSION_EVENT_LEVELS = ['info', 'warn', 'error'] as const;
export type SessionEventLevel = (typeof SESSION_EVENT_LEVELS)[number];
export const sessionEventLevelSchema = z.enum(SESSION_EVENT_LEVELS);

// --- Error codes (what the global error handler emits) --------------------

export const ERROR_CODES = [
  'INTERNAL',
  'VALIDATION',
  'NOT_FOUND',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'CONFLICT',
  'RATE_LIMITED',
  'CONTAINER_ERROR',
  'CONTAINER',
  'BAD_REQUEST',
  'SHARE_IN_USE',
  // Multi-user design canvas room — max-peer cap (DESIGN_ROOM_MAX_PEERS) hit.
  'ROOM_FULL',
  // Phase 23: GET /sessions/:id/download — past session's volume is gone
  // (deleted / pruned / never existed). The client uses this to render the
  // "code no longer available" fallback message.
  'VOLUME_UNAVAILABLE',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number] | (string & {});
export const errorCodeSchema = z.string();

// --- Proxy HTTP methods ----------------------------------------------------

export const PROXY_METHODS = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
] as const;
export type ProxyMethod = (typeof PROXY_METHODS)[number];
export const proxyMethodSchema = z.enum(PROXY_METHODS);
