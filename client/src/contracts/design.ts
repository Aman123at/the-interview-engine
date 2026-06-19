// ============================================================
// AUTO-GENERATED — DO NOT EDIT
// Source of truth: interview-sandbox-server/src/contracts/
// Regenerate via `pnpm contracts:sync` in the server repo.
// ============================================================
/**
 * Phase 19 — design-interview document contracts.
 *
 * The two kinds (`db_design`, `system_design`) have very different canvas
 * models, so the wire shape is a discriminated union keyed on `kind`. Schemas
 * are intentionally permissive at the inner-detail layer (the canvas libs own
 * the fine grain) but tight at the envelope so client + server agree on
 * structure.
 */
import { z } from 'zod';
import {
  designDocKindSchema,
  designDbEngineSchema,
  designRoleSchema,
  type DesignDocKind,
  type DesignDbEngine,
  type DesignRole,
} from './enums.js';

const uuid = z.string().uuid();
const isoDateLike = z.union([z.string(), z.date()]);

// --- Canvas models ---------------------------------------------------------

/**
 * DB design — relational mode (PostgreSQL / MySQL) uses tables; document mode
 * (MongoDB) uses collections. Both serialize to the same envelope so the
 * client renders against `document.tables` for relational and
 * `document.collections` for Mongo. Positions/cardinality details live here
 * but are kept loose (`z.unknown` for inner field shape) so the canvas lib
 * (React Flow) can evolve without bumping the contract on every commit.
 */
const dbColumnSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Free-form datatype — engine-specific options live in the client. */
  dataType: z.string(),
  isPrimaryKey: z.boolean().optional(),
  isForeignKey: z.boolean().optional(),
  isNullable: z.boolean().optional(),
  isUnique: z.boolean().optional(),
});

const dbTableSchema = z.object({
  id: z.string(),
  name: z.string(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
  columns: z.array(dbColumnSchema),
});

const dbCollectionFieldSchema: z.ZodType<unknown> = z.lazy(() =>
  z.object({
    id: z.string(),
    name: z.string(),
    bsonType: z.string(),
    isReference: z.boolean().optional(),
    referenceCollection: z.string().optional(),
    fields: z.array(dbCollectionFieldSchema).optional(),
  }),
);

const dbCollectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
  fields: z.array(dbCollectionFieldSchema),
});

export const dbRelationshipCardinality = z.enum([
  'one_to_one',
  'one_to_many',
  'many_to_one',
  'many_to_many',
]);

const dbRelationshipSchema = z.object({
  id: z.string(),
  /** Source table/collection id + column/field id (or null for whole-entity refs). */
  source: z.object({ entityId: z.string(), fieldId: z.string().nullable() }),
  target: z.object({ entityId: z.string(), fieldId: z.string().nullable() }),
  cardinality: dbRelationshipCardinality,
});

export const dbDesignDocumentSchema = z
  .object({
    version: z.literal(1).default(1),
    /** Relational mode (postgresql | mysql): tables + relationships. */
    tables: z.array(dbTableSchema).optional(),
    /** Document mode (mongodb): collections + (reference) relationships. */
    collections: z.array(dbCollectionSchema).optional(),
    relationships: z.array(dbRelationshipSchema).optional(),
  })
  .passthrough();
export type DbDesignDocument = z.infer<typeof dbDesignDocumentSchema>;

/**
 * System design — freeform Excalidraw-shaped scene. Kept permissive because
 * the canvas lib owns the element/appState shape, but we type the envelope so
 * a write that's missing `elements` is rejected at the route.
 */
export const systemDesignDocumentSchema = z
  .object({
    version: z.literal(1).default(1),
    /** Excalidraw elements (or equivalent freeform scene nodes). */
    elements: z.array(z.unknown()),
    /** Excalidraw appState — non-transient bits the client cares about on reload. */
    appState: z.unknown().optional(),
    /** Image files referenced by elements (`fileId` → binary as data URL). */
    files: z.record(z.unknown()).optional(),
  })
  .passthrough();
export type SystemDesignDocument = z.infer<typeof systemDesignDocumentSchema>;

// --- Wire row shape --------------------------------------------------------

/**
 * A persisted design document. Structurally compatible with the Drizzle row
 * (date fields accept Date | string).
 */
export const designDocumentSchema = z
  .object({
    id: uuid,
    userId: uuid,
    kind: designDocKindSchema,
    title: z.string(),
    /** Null for system_design; required for db_design. */
    dbEngine: designDbEngineSchema.nullable(),
    document: z.unknown(),
    thumbnail: z.string().nullable(),
    /** Set when sharing is enabled; null when revoked. */
    shareToken: z.string().nullable().optional(),
    createdAt: isoDateLike,
    updatedAt: isoDateLike,
    deletedAt: isoDateLike.nullable(),
  })
  .passthrough();
export type DesignDocumentDTO = z.infer<typeof designDocumentSchema>;

// --- Per-kind validators (route handlers pick the right one on write) -----

export function documentSchemaForKind(kind: DesignDocKind) {
  return kind === 'db_design' ? dbDesignDocumentSchema : systemDesignDocumentSchema;
}

// --- CRUD request/response ------------------------------------------------

export const createDesignDocRequest = z
  .discriminatedUnion('kind', [
    z.object({
      kind: z.literal('db_design'),
      title: z.string().min(1).max(200),
      dbEngine: designDbEngineSchema,
      document: dbDesignDocumentSchema.optional(),
      thumbnail: z.string().max(1024 * 1024).nullable().optional(),
    }),
    z.object({
      kind: z.literal('system_design'),
      title: z.string().min(1).max(200),
      document: systemDesignDocumentSchema.optional(),
      thumbnail: z.string().max(1024 * 1024).nullable().optional(),
    }),
  ]);
export type CreateDesignDocRequest = z.infer<typeof createDesignDocRequest>;

export const listDesignDocsQuery = z.object({
  kind: designDocKindSchema.optional(),
});
export type ListDesignDocsQuery = z.infer<typeof listDesignDocsQuery>;

export const listDesignDocsResponse = z.object({
  documents: z.array(designDocumentSchema),
});
export type ListDesignDocsResponse = z.infer<typeof listDesignDocsResponse>;

export const designDocResponse = z.object({ document: designDocumentSchema });
export type DesignDocResponse = z.infer<typeof designDocResponse>;

export const designDocIdParams = z.object({ id: uuid });
export type DesignDocIdParams = z.infer<typeof designDocIdParams>;

/**
 * PATCH body. All fields optional (autosave sends just the document; rename
 * sends just the title). `document` is validated against the per-kind schema
 * IN THE ROUTE — the row's `kind` is the discriminator and is immutable.
 */
export const updateDesignDocRequest = z
  .object({
    title: z.string().min(1).max(200).optional(),
    document: z.unknown().optional(),
    thumbnail: z.string().max(1024 * 1024).nullable().optional(),
  })
  .refine(
    (b) => b.title !== undefined || b.document !== undefined || b.thumbnail !== undefined,
    { message: 'At least one of title, document, thumbnail must be provided.' },
  );
export type UpdateDesignDocRequest = z.infer<typeof updateDesignDocRequest>;

export const deleteDesignDocResponse = z.object({ ok: z.literal(true) });
export type DeleteDesignDocResponse = z.infer<typeof deleteDesignDocResponse>;

// --- Share (multi-user collaborative canvas) ------------------------------

/**
 * POST /design-docs/:id/share → enables sharing, returns a stable share token.
 * Idempotent: subsequent calls return the existing token. DELETE revokes it.
 */
export const enableDesignShareResponse = z.object({
  shareToken: z.string(),
});
export type EnableDesignShareResponse = z.infer<typeof enableDesignShareResponse>;

export const designShareTokenParams = z.object({
  token: z.string().min(10).max(64),
});
export type DesignShareTokenParams = z.infer<typeof designShareTokenParams>;

/**
 * GET /design-share/:token — UNAUTHENTICATED. The token IS the authorization,
 * scoped to ONE design doc. The owner is admitted via their JWT (separate
 * path), guests get in via this endpoint to fetch the initial document.
 *
 * Failure reasons:
 *   - `invalid` → token unknown or revoked
 *   - `ended`   → document was soft-deleted by the owner
 *   - `full`    → max-peer cap reached (the guest can retry later)
 *
 * `full` is reported by the WS handshake too; we expose it here so the page
 * can render a friendly "session full" state without opening a socket.
 */
export const designShareGetResponse = z.union([
  z.object({
    ok: z.literal(true),
    document: designDocumentSchema,
    /** Hard cap surfaced to the client so it can show "x / N peers". */
    maxPeers: z.number().int().positive(),
  }),
  z.object({
    ok: z.literal(false),
    reason: z.enum(['ended', 'full', 'invalid']),
  }),
]);
export type DesignShareGetResponse = z.infer<typeof designShareGetResponse>;

/**
 * A peer in a shared design room. Broadcast to all peers via the
 * `design:presence` WS event whenever the roster changes.
 *
 * `name` and `color` are assigned by the server on join (random pleasant name
 * + a deterministic palette pick keyed off `peerId`). The owner's `name` is
 * "Owner" when they enter their own room — kept distinct so guests can tell
 * them apart even though everyone has equal edit rights.
 */
export const designPeerSchema = z.object({
  peerId: z.string(),
  name: z.string(),
  color: z.string(),
  role: designRoleSchema,
});
export type DesignPeer = z.infer<typeof designPeerSchema>;

// Re-export for downstream convenience.
export type { DesignDocKind, DesignDbEngine, DesignRole };
