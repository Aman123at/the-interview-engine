// ============================================================
// AUTO-GENERATED — DO NOT EDIT
// Source of truth: interview-sandbox-server/src/contracts/
// Regenerate via `pnpm contracts:sync` in the server repo.
// ============================================================
/**
 * HTTP contract — request + response zod schemas for every endpoint the
 * server exposes. Both client and server consume this file so the wire shapes
 * stay in sync. Dependency-light (zod only).
 *
 * Conventions:
 *   - Each endpoint exports `xxRequest` (zod) and `xxResponse` (zod) plus the
 *     inferred TS types.
 *   - Endpoints with no request body use `z.object({}).passthrough()`.
 *   - The `endpoints` registry at the bottom maps `${METHOD} ${path}` to the
 *     pair, so call sites can be discovered by grep.
 */
import { z } from 'zod';
import {
  sessionStatusSchema,
  userRoleSchema,
  levelSchema,
  sessionEventLevelSchema,
  proxyMethodSchema,
  previewKindSchema,
} from './enums.js';
import type { Session, SessionEvent, PreviewInfo } from './ws.js';
import {
  createDesignDocRequest,
  listDesignDocsQuery,
  listDesignDocsResponse,
  designDocResponse,
  updateDesignDocRequest,
  deleteDesignDocResponse,
  enableDesignShareResponse,
  designShareGetResponse,
} from './design.js';

// --- Tiny shared shapes ----------------------------------------------------

const uuidSchema = z.string().uuid();
const isoDateLike = z.union([z.string(), z.date()]);

const publicUserSchema = z.object({
  id: uuidSchema,
  email: z.string().email(),
  displayName: z.string(),
  role: userRoleSchema,
});
export type PublicUser = z.infer<typeof publicUserSchema>;

/**
 * Wire shape of a `sessions` row. Matches the Drizzle row structurally so the
 * server can hand a raw row to res.json() without translation.
 */
const sessionSchema: z.ZodType<Session> = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  framework: z.string(),
  customization: z.unknown(),
  status: sessionStatusSchema,
  containerId: z.string().nullable(),
  volumeName: z.string().nullable(),
  hostPreviewPort: z.number().int().nullable(),
  shareToken: z.string().nullable(),
  startedAt: isoDateLike.nullable(),
  endedAt: isoDateLike.nullable(),
  lastActiveAt: isoDateLike,
  createdAt: isoDateLike,
  updatedAt: isoDateLike,
  candidateRating: z.number().int().min(1).max(5).nullable(),
  candidateId: z.string().nullable(),
  volumeDeleted: z.boolean(),
  deletedAt: isoDateLike.nullable(),
  candidateRecordId: uuidSchema.nullable(),
}) as z.ZodType<Session>;

const sessionEventSchema: z.ZodType<SessionEvent> = z.object({
  id: uuidSchema,
  sessionId: uuidSchema,
  type: z.string(),
  payload: z.unknown(),
  level: sessionEventLevelSchema,
  createdAt: isoDateLike,
}) as z.ZodType<SessionEvent>;

const previewSchema: z.ZodType<PreviewInfo> = z.object({
  kind: previewKindSchema,
  url: z.string().nullable(),
  hostPort: z.number().int().nullable(),
  hint: z.string().nullable(),
}) as z.ZodType<PreviewInfo>;

const emptyBody = z.object({}).passthrough();

// --- Auth ------------------------------------------------------------------

export const loginRequest = z
  .object({
    email: z.string().email().optional(),
    identifier: z.string().email().optional(),
    password: z.string().min(1).max(256),
  })
  .refine((b) => b.email !== undefined || b.identifier !== undefined, {
    message: 'Required',
    path: ['email'],
  });
export type LoginRequest = z.infer<typeof loginRequest>;

export const authResponse = z.object({
  accessToken: z.string(),
  user: publicUserSchema,
});
export type AuthResponse = z.infer<typeof authResponse>;

// --- Interview types + interviewer specializations ------------------------

export const interviewTypeSchema = z.object({
  id: uuidSchema,
  key: z.string(),
  label: z.string(),
  isActive: z.boolean(),
});
export type InterviewType = z.infer<typeof interviewTypeSchema>;

export const interviewerSpecializationSchema = z.object({
  interviewTypeId: uuidSchema,
  /** Convenience: server joins so the client has the type key + label inline. */
  interviewType: interviewTypeSchema,
  level: levelSchema,
});
export type InterviewerSpecialization = z.infer<typeof interviewerSpecializationSchema>;

/**
 * /auth/me response. `specializations` is present (possibly empty) only for
 * interviewers; admins and HRs get `undefined`.
 */
export const meResponse = z.object({
  user: publicUserSchema,
  specializations: z.array(interviewerSpecializationSchema).optional(),
});
export type MeResponse = z.infer<typeof meResponse>;

export const logoutResponse = z.void();
export type LogoutResponse = void;

// --- Config ----------------------------------------------------------------

/**
 * /config/frameworks runtime shape is left as `unknown` here so the contract
 * doesn't have to track every group-type permutation. The server's
 * frameworkConfig module owns the inner schema; this just types the envelope.
 */
const optionDefSchema = z.object({ id: z.string(), label: z.string() });
const groupDefSchema = z.union([
  z.object({
    id: z.string(),
    label: z.string(),
    type: z.literal('radio'),
    required: z.literal(true),
    default: z.string(),
    options: z.array(optionDefSchema),
  }),
  z.object({
    id: z.string(),
    label: z.string(),
    type: z.literal('radio'),
    required: z.literal(false),
    default: z.string().nullable(),
    options: z.array(optionDefSchema),
  }),
  z.object({
    id: z.string(),
    label: z.string(),
    type: z.literal('checkbox'),
    required: z.literal(false),
    default: z.array(z.string()),
    options: z.array(optionDefSchema),
  }),
]);
export const frameworkDefSchema = z.object({
  id: z.string(),
  label: z.string(),
  groups: z.array(groupDefSchema),
});
export type FrameworkDef = z.infer<typeof frameworkDefSchema>;

export const frameworksResponse = z.object({
  frameworks: z.array(frameworkDefSchema),
});
export type FrameworksResponse = z.infer<typeof frameworksResponse>;

// --- Sessions --------------------------------------------------------------

export const createSessionRequest = z.object({
  framework: z.string().min(1).max(40),
  // Authoritatively validated by frameworkConfig.validateCustomization.
  customization: z.unknown().optional(),
  /**
   * Phase 30d: optional link to a candidates row. Validated against the
   * interviewer's specialization types BEFORE the container is created — an
   * out-of-scope candidate returns 403 with no resources allocated.
   */
  candidateRecordId: uuidSchema.optional(),
});
export type CreateSessionRequest = z.infer<typeof createSessionRequest>;

// PATCH /sessions/:id/candidate
export const attachCandidateRequest = z.object({
  /** `null` clears the link; a uuid sets it (subject to scope check). */
  candidateRecordId: uuidSchema.nullable(),
});
export type AttachCandidateRequest = z.infer<typeof attachCandidateRequest>;

export const sessionWithPreviewResponse = z.object({
  session: sessionSchema,
  preview: previewSchema,
});
export type SessionWithPreviewResponse = z.infer<typeof sessionWithPreviewResponse>;

export const sessionIdParams = z.object({ id: uuidSchema });
export type SessionIdParams = z.infer<typeof sessionIdParams>;

export const recoverableSessionResponse = z.union([
  sessionWithPreviewResponse,
  z.object({ session: z.null(), preview: z.null() }),
]);
export type RecoverableSessionResponse = z.infer<typeof recoverableSessionResponse>;

export const sessionEventsResponse = z.object({
  events: z.array(sessionEventSchema),
});
export type SessionEventsResponse = z.infer<typeof sessionEventsResponse>;

export const enableShareResponse = z.object({ shareToken: z.string() });
export type EnableShareResponse = z.infer<typeof enableShareResponse>;

export const okResponse = z.object({ ok: z.literal(true) });
export type OkResponse = z.infer<typeof okResponse>;

/**
 * DELETE /sessions/:id (close) body. Both fields are optional — the close
 * dialog (Phase 25) lets the interviewer skip. Absent fields leave the
 * existing column values intact (null on a fresh row).
 */
export const closeSessionRequest = z
  .object({
    candidateRating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).optional(),
    candidateId: z
      .string()
      .trim()
      .max(128)
      .optional()
      .transform((v) => (v === undefined || v === '' ? undefined : v)),
  })
  .partial();
export type CloseSessionRequest = z.infer<typeof closeSessionRequest>;

export const closeSessionResponse = z.object({ session: sessionSchema });
export type CloseSessionResponse = z.infer<typeof closeSessionResponse>;

// --- Session history (Phase 22) -------------------------------------------

/**
 * One row in the user's "Past Sessions" page. Pre-projected by the server
 * from the `sessions` table so the client doesn't need to know the storage
 * shape. `downloadable` is a metadata-level flag (it's a code session AND
 * `volume_name` is set AND NOT `volume_deleted`); the actual Docker volume
 * existence check lives in the Phase 23 download endpoint.
 */
export const sessionHistoryItemSchema = z.object({
  id: uuidSchema,
  framework: z.string(),
  customizationSummary: z.string(),
  status: sessionStatusSchema,
  startedAt: isoDateLike.nullable(),
  endedAt: isoDateLike.nullable(),
  lastActiveAt: isoDateLike,
  candidateRating: z.number().int().min(1).max(5).nullable(),
  candidateId: z.string().nullable(),
  downloadable: z.boolean(),
});
export type SessionHistoryItem = z.infer<typeof sessionHistoryItemSchema>;

export const sessionsHistoryQuery = z.object({
  limit: z.coerce.number().int().positive().max(100).default(25).optional(),
  cursor: z.string().min(1).max(64).optional(),
});
export type SessionsHistoryQuery = z.infer<typeof sessionsHistoryQuery>;

export const sessionsHistoryResponse = z.object({
  items: z.array(sessionHistoryItemSchema),
  nextCursor: z.string().nullable(),
});
export type SessionsHistoryResponse = z.infer<typeof sessionsHistoryResponse>;

/**
 * GET /sessions/:id/download (Phase 23).
 *
 * Path params: `{ id: uuid }`.
 *
 * On SUCCESS the server streams `application/zip` with a
 * `Content-Disposition: attachment; filename=...` header — the body is NOT
 * JSON and NOT zod-parsed. The client should treat any 2xx response as a
 * binary download.
 *
 * On FAILURE the server uses the standard error JSON shape. Notably:
 *   - 404 NOT_FOUND          — session missing, foreign, soft-deleted, or
 *                              not a code session.
 *   - 410 VOLUME_UNAVAILABLE — the past session's Docker volume is gone
 *                              (manually deleted, pruned, or
 *                              `volume_deleted=true`). The client renders
 *                              the "code no longer available" fallback on
 *                              this code; do not retry.
 *
 * The marker schema below intentionally describes a sentinel so the
 * contracts registry stays exhaustive without lying about the wire shape.
 */
export const downloadSessionCodeResponse = z.object({
  __binaryStream: z.literal('application/zip'),
});
export type DownloadSessionCodeResponse = z.infer<typeof downloadSessionCodeResponse>;

/**
 * DELETE /sessions/:id/history (Phase 24).
 *
 * Soft-deletes a past session so it disappears from the history list. The
 * row is intentionally KEPT (with `deleted_at` set) so the volume it
 * references — when the user opts to keep it — is never seen as an orphan
 * by the reaper.
 *
 * `deleteVolume: true` ALSO removes the Docker volume permanently. The
 * code becomes unrecoverable from that moment on; a later download for
 * this session will return 410 `VOLUME_UNAVAILABLE`.
 *
 * This is DISTINCT from `DELETE /sessions/:id` (which is the close route).
 * Closing ends a live session; this removes a past one from history.
 *
 * Guards: session must exist, be owned, not already soft-deleted, AND be
 * in a terminal status (`ended | error | recoverable`). A non-terminal
 * session returns 409 (`CONFLICT`) — the client should close first.
 */
export const deleteSessionFromHistoryRequest = z.object({
  deleteVolume: z.boolean(),
});
export type DeleteSessionFromHistoryRequest = z.infer<typeof deleteSessionFromHistoryRequest>;

export const deleteSessionFromHistoryResponse = z.object({
  id: uuidSchema,
  removedFromHistory: z.literal(true),
  volumeDeleted: z.boolean(),
});
export type DeleteSessionFromHistoryResponse = z.infer<typeof deleteSessionFromHistoryResponse>;

// Proxy ---------------------------------------------------------------------

const headerKV = z.object({
  name: z.string().min(1).max(256),
  value: z.string().max(8192),
});

export const proxyRequest = z.object({
  method: proxyMethodSchema,
  path: z
    .string()
    .min(1)
    .max(4096)
    .refine((p) => p.startsWith('/'), 'path must start with /'),
  headers: z.array(headerKV).max(100).optional().default([]),
  body: z.string().max(20 * 1024 * 1024).optional(),
  bodyEncoding: z.enum(['utf8', 'base64']).optional().default('utf8'),
});
export type ProxyRequest = z.infer<typeof proxyRequest>;

export const proxyResponse = z.union([
  z.object({
    ok: z.literal(true),
    status: z.number().int(),
    statusText: z.string(),
    headers: z.array(headerKV),
    bodyBase64: z.string(),
    sizeBytes: z.number().int(),
    truncated: z.boolean(),
    timeMs: z.number().int(),
  }),
  z.object({
    ok: z.literal(false),
    error: z.object({ message: z.string() }),
    timeMs: z.number().int(),
  }),
]);
export type ProxyResponse = z.infer<typeof proxyResponse>;

// Container inspect --------------------------------------------------------

export const inspectContainerResponse = z
  .object({
    session: sessionSchema,
    container: z
      .object({
        id: z.string(),
        state: z.string(),
        running: z.boolean(),
        exitCode: z.number().int(),
        startedAt: z.string(),
        finishedAt: z.string(),
        oomKilled: z.boolean().optional(),
        restartCount: z.number().int().optional(),
      })
      .partial()
      .nullable(),
    stats: z.unknown().nullable(),
    logs: z.string().optional(),
  })
  .passthrough();
export type InspectContainerResponse = z.infer<typeof inspectContainerResponse>;

// --- Share (public, token-scoped) -----------------------------------------

export const shareTokenParams = z.object({
  token: z.string().min(10).max(64),
});
export type ShareTokenParams = z.infer<typeof shareTokenParams>;

export const shareGetResponse = z.union([
  z.object({
    ok: z.literal(true),
    session: z.object({
      id: uuidSchema,
      framework: z.string(),
      status: sessionStatusSchema,
    }),
    preview: previewSchema,
  }),
  z.object({ ok: z.literal(false), reason: z.string() }),
]);
export type ShareGetResponse = z.infer<typeof shareGetResponse>;

// --- Admin -----------------------------------------------------------------

export const adminListSessionsQuery = z.object({
  limit: z.coerce.number().int().positive().max(200).default(50).optional(),
});
export type AdminListSessionsQuery = z.infer<typeof adminListSessionsQuery>;

export const adminListSessionsResponse = z.object({
  active: z.array(sessionSchema.and(z.object({ preview: previewSchema }))),
  limit: z.number().int(),
});
export type AdminListSessionsResponse = z.infer<typeof adminListSessionsResponse>;

export const adminInspectSessionResponse = z
  .object({
    session: sessionSchema,
    preview: previewSchema,
    events: z.array(sessionEventSchema),
    container: z.unknown().nullable(),
    stats: z.unknown().nullable(),
    logs: z.string(),
  })
  .passthrough();
export type AdminInspectSessionResponse = z.infer<typeof adminInspectSessionResponse>;

export const adminHealthResponse = z
  .object({
    reaper: z.unknown(),
    portPool: z.object({ allocated: z.unknown() }),
  })
  .passthrough();
export type AdminHealthResponse = z.infer<typeof adminHealthResponse>;

// --- Admin staff management (Phase 30b) -----------------------------------

/**
 * Staff user shape returned by /admin/* lists + onboard/update responses.
 * Includes `isActive` (admins need to see deactivated staff).
 */
export const adminStaffUserSchema = publicUserSchema.extend({
  isActive: z.boolean(),
  createdAt: isoDateLike,
});
export type AdminStaffUser = z.infer<typeof adminStaffUserSchema>;

export const adminInterviewerUserSchema = adminStaffUserSchema.extend({
  specializations: z.array(interviewerSpecializationSchema),
});
export type AdminInterviewerUser = z.infer<typeof adminInterviewerUserSchema>;

const passwordSchema = z.string().min(8, 'password must be ≥ 8 chars').max(256);

// Specialization payload uses the public interview-type `key`, not its uuid —
// the admin UI binds to keys so the catalogue can be reseeded without a UI change.
const specializationInputSchema = z.object({
  interviewTypeKey: z.string().min(1),
  level: levelSchema,
});
export type SpecializationInput = z.infer<typeof specializationInputSchema>;

// ---- HR ----

export const adminListHrsResponse = z.object({
  users: z.array(adminStaffUserSchema),
});
export type AdminListHrsResponse = z.infer<typeof adminListHrsResponse>;

export const onboardHrRequest = z.object({
  email: z.string().email().max(320),
  displayName: z.string().trim().min(1).max(120),
  password: passwordSchema,
});
export type OnboardHrRequest = z.infer<typeof onboardHrRequest>;

export const updateHrRequest = z
  .object({
    displayName: z.string().trim().min(1).max(120).optional(),
    isActive: z.boolean().optional(),
    password: passwordSchema.optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'at least one field required' });
export type UpdateHrRequest = z.infer<typeof updateHrRequest>;

export const adminStaffUserResponse = z.object({ user: adminStaffUserSchema });
export type AdminStaffUserResponse = z.infer<typeof adminStaffUserResponse>;

// ---- Interviewer ----

export const adminListInterviewersResponse = z.object({
  users: z.array(adminInterviewerUserSchema),
});
export type AdminListInterviewersResponse = z.infer<typeof adminListInterviewersResponse>;

export const onboardInterviewerRequest = z.object({
  email: z.string().email().max(320),
  displayName: z.string().trim().min(1).max(120),
  password: passwordSchema,
  specializations: z.array(specializationInputSchema).default([]),
});
export type OnboardInterviewerRequest = z.infer<typeof onboardInterviewerRequest>;

export const updateInterviewerRequest = z
  .object({
    displayName: z.string().trim().min(1).max(120).optional(),
    isActive: z.boolean().optional(),
    password: passwordSchema.optional(),
    /** If present, REPLACES the entire specializations set for this user. */
    specializations: z.array(specializationInputSchema).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'at least one field required' });
export type UpdateInterviewerRequest = z.infer<typeof updateInterviewerRequest>;

export const adminInterviewerResponse = z.object({ user: adminInterviewerUserSchema });
export type AdminInterviewerResponse = z.infer<typeof adminInterviewerResponse>;

// Shared params shape for /admin/{hrs,interviewers}/:id
export const adminUserIdParams = z.object({ id: uuidSchema });
export type AdminUserIdParams = z.infer<typeof adminUserIdParams>;

// --- Candidates (Phase 30c) -----------------------------------------------

const externalIdSchema = z.string().trim().min(1).max(120);
const candidateNameSchema = z.string().trim().min(1).max(200);
const interviewTypeKeysSchema = z.array(z.string().min(1)).min(1, 'at least one interview type required');

/**
 * Wire shape of a candidate row. `id` is the immutable stable UUID;
 * `externalId` is the HR-typed identifier (editable). `interviewTypes` is the
 * joined catalogue, returned inline to avoid a second roundtrip in the UI.
 */
export const candidateSchema = z.object({
  id: uuidSchema,
  externalId: z.string(),
  name: z.string(),
  createdBy: uuidSchema,
  createdAt: isoDateLike,
  updatedAt: isoDateLike,
  interviewTypes: z.array(interviewTypeSchema),
});
/** Wire shape for a candidate row (joined with interview types). */
export type CandidateDto = z.infer<typeof candidateSchema>;

export const createCandidateRequest = z.object({
  externalId: externalIdSchema,
  name: candidateNameSchema,
  interviewTypeKeys: interviewTypeKeysSchema,
});
export type CreateCandidateRequest = z.infer<typeof createCandidateRequest>;

export const listCandidatesQuery = z.object({
  search: z.string().trim().min(1).max(200).optional(),
});
export type ListCandidatesQuery = z.infer<typeof listCandidatesQuery>;

export const listCandidatesResponse = z.object({
  candidates: z.array(candidateSchema),
});
export type ListCandidatesResponse = z.infer<typeof listCandidatesResponse>;

export const candidateResponse = z.object({ candidate: candidateSchema });
export type CandidateResponse = z.infer<typeof candidateResponse>;

export const updateCandidateRequest = z
  .object({
    externalId: externalIdSchema.optional(),
    name: candidateNameSchema.optional(),
    /** If present, REPLACES the candidate's interview-type set. */
    interviewTypeKeys: interviewTypeKeysSchema.optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'at least one field required' });
export type UpdateCandidateRequest = z.infer<typeof updateCandidateRequest>;

export const candidateIdParams = z.object({ id: uuidSchema });
export type CandidateIdParams = z.infer<typeof candidateIdParams>;

// --- HR cross-interviewer reporting (Phase 30e) ---------------------------

/**
 * HR filters. All optional EXCEPT for the export endpoint, which additionally
 * requires both `dateFrom` and `dateTo`.
 */
const hrFiltersBase = {
  interviewerSearch: z.string().trim().min(1).max(200).optional(),
  candidateSearch: z.string().trim().min(1).max(200).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
} as const;

export const hrSessionsQuery = z.object({
  ...hrFiltersBase,
  limit: z.coerce.number().int().positive().max(200).optional(),
  cursor: z.string().min(1).optional(),
});
export type HrSessionsQuery = z.infer<typeof hrSessionsQuery>;

export const hrSessionRowSchema = z.object({
  id: uuidSchema,
  framework: z.string(),
  status: sessionStatusSchema,
  startedAt: isoDateLike.nullable(),
  endedAt: isoDateLike.nullable(),
  candidateRating: z.number().int().min(1).max(5).nullable(),
  interviewer: z
    .object({ id: uuidSchema, displayName: z.string(), email: z.string().email() })
    .nullable(),
  candidate: z
    .object({ id: uuidSchema, externalId: z.string(), name: z.string() })
    .nullable(),
  candidateInterviewTypes: z.array(z.object({ key: z.string(), label: z.string() })),
});
export type HrSessionRow = z.infer<typeof hrSessionRowSchema>;

export const hrSessionsResponse = z.object({
  items: z.array(hrSessionRowSchema),
  nextCursor: z.string().nullable(),
});
export type HrSessionsResponse = z.infer<typeof hrSessionsResponse>;

/**
 * Export endpoint adds the dateRange requirement at the application layer so
 * the filename can carry it. The success response is a BINARY .xlsx stream;
 * the schema is a marker — do NOT zod-parse the response body.
 */
export const hrSessionsExportQuery = z
  .object({
    ...hrFiltersBase,
    dateFrom: z.coerce.date(),
    dateTo: z.coerce.date(),
  })
  .refine((q) => q.dateFrom <= q.dateTo, {
    message: 'dateFrom must be ≤ dateTo',
    path: ['dateFrom'],
  });
export type HrSessionsExportQuery = z.infer<typeof hrSessionsExportQuery>;
/** Marker — the response is `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`. */
export const hrSessionsExportResponse = z.unknown();
export type HrSessionsExportResponse = unknown;

// --- Interviewer-scoped candidate view (Phase 30d) ------------------------

/**
 * GET /interviewer/candidates returns only candidates whose interview_types
 * INTERSECT the caller's specialization types. Same wire shape as the HR list.
 */
export const interviewerCandidatesQuery = listCandidatesQuery;
export type InterviewerCandidatesQuery = ListCandidatesQuery;
export const interviewerCandidatesResponse = listCandidatesResponse;
export type InterviewerCandidatesResponse = ListCandidatesResponse;

// --- HR bulk import (Phase 35) --------------------------------------------

export const BULK_TEMPLATE_KINDS = ['candidates', 'interviewers'] as const;
export type BulkTemplateKind = (typeof BULK_TEMPLATE_KINDS)[number];
export const bulkTemplateKindSchema = z.enum(BULK_TEMPLATE_KINDS);

/** Hard cap on rows accepted by `POST /hr/bulk/import` per request. */
export const BULK_IMPORT_MAX_ROWS = 500;
/** Number of type columns rendered in templates + validated in import rows. */
export const BULK_MAX_TYPE_COLUMNS = 3;

export const bulkTemplateQuery = z.object({ kind: bulkTemplateKindSchema });
export type BulkTemplateQuery = z.infer<typeof bulkTemplateQuery>;

/** Marker — the response is a binary `.xlsx`. Do NOT zod-parse the body. */
export const bulkTemplateResponse = z.unknown();
export type BulkTemplateResponse = unknown;

/**
 * Strict per-row shapes. NOT used to parse the import request directly
 * (that would reject the whole batch on a single bad row, defeating
 * row-level error reporting). The service runs these via `safeParse` per
 * row to collect every problem in one pass.
 */
export const bulkCandidateRowSchema = z.object({
  name: candidateNameSchema,
  externalId: externalIdSchema,
  interviewTypeKeys: z.array(z.string().min(1)).min(1).max(BULK_MAX_TYPE_COLUMNS),
});
export type BulkCandidateRow = z.infer<typeof bulkCandidateRowSchema>;

export const bulkInterviewerSpecSchema = z.object({
  interviewTypeKey: z.string().min(1),
  level: levelSchema,
});

export const bulkInterviewerRowSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  email: z.string().email().max(320),
  specializations: z.array(bulkInterviewerSpecSchema).min(1).max(BULK_MAX_TYPE_COLUMNS),
});
export type BulkInterviewerRow = z.infer<typeof bulkInterviewerRowSchema>;

/**
 * Envelope schema — kind + rows-as-array, but each row is `z.unknown()` so
 * the request always reaches the service. The service then validates each
 * row against the strict schema above and collects row-level errors.
 */
export const bulkImportRequest = z.object({
  kind: bulkTemplateKindSchema,
  rows: z.array(z.unknown()).min(1).max(BULK_IMPORT_MAX_ROWS),
});
export type BulkImportRequest = z.infer<typeof bulkImportRequest>;

export const bulkRowErrorSchema = z.object({
  rowIndex: z.number().int().nonnegative(),
  field: z.string(),
  message: z.string(),
});
export type BulkRowError = z.infer<typeof bulkRowErrorSchema>;

export const bulkImportResponse = z.object({
  kind: bulkTemplateKindSchema,
  inserted: z.number().int().nonnegative(),
  created: z.union([z.array(candidateSchema), z.array(adminInterviewerUserSchema)]),
  /** Interviewers only — surfaced ONCE in the response, never persisted. */
  generatedPasswords: z
    .array(z.object({ email: z.string().email(), tempPassword: z.string() }))
    .optional(),
});
export type BulkImportResponse = z.infer<typeof bulkImportResponse>;

export const bulkImportErrorResponse = z.object({
  error: z.object({
    code: z.literal('VALIDATION'),
    message: z.string(),
    requestId: z.string().optional(),
    details: z.object({
      rowErrors: z.array(bulkRowErrorSchema),
    }),
  }),
});
export type BulkImportErrorResponse = z.infer<typeof bulkImportErrorResponse>;

// ---- Interview-type catalogue (admin UI populates the specialization picker) ----

export const adminListInterviewTypesResponse = z.object({
  types: z.array(interviewTypeSchema),
});
export type AdminListInterviewTypesResponse = z.infer<typeof adminListInterviewTypesResponse>;

// --- Health ----------------------------------------------------------------

export const livenessResponse = z.object({
  status: z.literal('ok'),
  uptime: z.number(),
});
export type LivenessResponse = z.infer<typeof livenessResponse>;

export const readinessResponse = z.object({
  status: z.enum(['ready', 'not_ready']),
  checks: z.object({ db: z.boolean(), docker: z.boolean() }),
  uptime: z.number(),
});
export type ReadinessResponse = z.infer<typeof readinessResponse>;

// --- Endpoint registry -----------------------------------------------------

/**
 * Discoverable map of every endpoint to its request/response pair. Keys are
 * literal `${METHOD} ${path}` strings — grep for the path to find call sites.
 */
export const endpoints = {
  'POST /auth/login': { request: loginRequest, response: authResponse },
  'POST /auth/refresh': { request: emptyBody, response: authResponse },
  'POST /auth/logout': { request: emptyBody, response: z.unknown() },
  'GET /auth/me': { request: emptyBody, response: meResponse },

  'GET /config/frameworks': { request: emptyBody, response: frameworksResponse },

  'POST /sessions': { request: createSessionRequest, response: sessionWithPreviewResponse },
  'PATCH /sessions/:id/candidate': {
    request: attachCandidateRequest,
    response: sessionWithPreviewResponse,
  },
  'GET /interviewer/candidates': {
    request: interviewerCandidatesQuery,
    response: interviewerCandidatesResponse,
  },

  // Phase 30e — HR cross-interviewer reporting (read-only views over all sessions)
  'GET /hr/sessions': { request: hrSessionsQuery, response: hrSessionsResponse },
  'GET /hr/sessions/export.xlsx': {
    request: hrSessionsExportQuery,
    response: hrSessionsExportResponse,
  },
  // Phase 35 — HR bulk template + import.
  'GET /hr/bulk/template': { request: bulkTemplateQuery, response: bulkTemplateResponse },
  'POST /hr/bulk/import': { request: bulkImportRequest, response: bulkImportResponse },
  'GET /sessions/recoverable': { request: emptyBody, response: recoverableSessionResponse },
  'GET /sessions/history': { request: sessionsHistoryQuery, response: sessionsHistoryResponse },
  'POST /sessions/:id/resume': { request: emptyBody, response: sessionWithPreviewResponse },
  'GET /sessions/:id': { request: emptyBody, response: sessionWithPreviewResponse },
  'GET /sessions/:id/events': { request: emptyBody, response: sessionEventsResponse },
  'POST /sessions/:id/share': { request: emptyBody, response: enableShareResponse },
  'DELETE /sessions/:id/share': { request: emptyBody, response: okResponse },
  'POST /sessions/:id/proxy': { request: proxyRequest, response: proxyResponse },
  'GET /sessions/:id/container': { request: emptyBody, response: inspectContainerResponse },
  'DELETE /sessions/:id': { request: closeSessionRequest, response: closeSessionResponse },
  'GET /sessions/:id/download': { request: emptyBody, response: downloadSessionCodeResponse },
  'DELETE /sessions/:id/history': {
    request: deleteSessionFromHistoryRequest,
    response: deleteSessionFromHistoryResponse,
  },

  'GET /share/:token': { request: emptyBody, response: shareGetResponse },
  'POST /share/:token/proxy': { request: proxyRequest, response: proxyResponse },

  // Phase 30b — admin staff management
  'GET /admin/hrs': { request: emptyBody, response: adminListHrsResponse },
  'POST /admin/hrs': { request: onboardHrRequest, response: adminStaffUserResponse },
  'PATCH /admin/hrs/:id': { request: updateHrRequest, response: adminStaffUserResponse },
  'DELETE /admin/hrs/:id': { request: emptyBody, response: okResponse },
  'GET /admin/interviewers': { request: emptyBody, response: adminListInterviewersResponse },
  'POST /admin/interviewers': {
    request: onboardInterviewerRequest,
    response: adminInterviewerResponse,
  },
  'PATCH /admin/interviewers/:id': {
    request: updateInterviewerRequest,
    response: adminInterviewerResponse,
  },
  'DELETE /admin/interviewers/:id': { request: emptyBody, response: okResponse },

  // Phase 30c — candidates (HR-owned)
  'POST /candidates': { request: createCandidateRequest, response: candidateResponse },
  'GET /candidates': { request: listCandidatesQuery, response: listCandidatesResponse },
  'GET /candidates/:id': { request: emptyBody, response: candidateResponse },
  'PATCH /candidates/:id': { request: updateCandidateRequest, response: candidateResponse },
  'DELETE /candidates/:id': { request: emptyBody, response: okResponse },
  'GET /admin/interview-types': {
    request: emptyBody,
    response: adminListInterviewTypesResponse,
  },

  'GET /admin/sessions': { request: emptyBody, response: adminListSessionsResponse },
  'GET /admin/sessions/:id': { request: emptyBody, response: adminInspectSessionResponse },
  'GET /admin/health': { request: emptyBody, response: adminHealthResponse },

  'GET /healthz': { request: emptyBody, response: livenessResponse },
  'GET /readyz': { request: emptyBody, response: readinessResponse },

  // Phase 19 — design documents (container-free track)
  'POST /design-docs': { request: createDesignDocRequest, response: designDocResponse },
  'GET /design-docs': { request: listDesignDocsQuery, response: listDesignDocsResponse },
  'GET /design-docs/:id': { request: emptyBody, response: designDocResponse },
  'PATCH /design-docs/:id': { request: updateDesignDocRequest, response: designDocResponse },
  'DELETE /design-docs/:id': { request: emptyBody, response: deleteDesignDocResponse },

  // Design canvas sharing — multi-user (max 5), unauth guests via token.
  'POST /design-docs/:id/share': { request: emptyBody, response: enableDesignShareResponse },
  'DELETE /design-docs/:id/share': { request: emptyBody, response: okResponse },
  'GET /design-share/:token': { request: emptyBody, response: designShareGetResponse },
} as const;

export type EndpointKey = keyof typeof endpoints;
