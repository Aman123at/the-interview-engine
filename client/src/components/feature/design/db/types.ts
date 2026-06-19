/**
 * Local view-model types for the DB design canvas. These are projections of
 * the contract's `DbDesignDocument` shape — IDs and shape match so the
 * canvas can serialize back to the wire without translation.
 *
 * Wire shapes live in `@/contracts/design.ts` (see `DbDesignDocument`). What
 * this file adds is the discriminated mode (`relational` vs `document`) the
 * client uses to render, plus helpful aliases.
 */

// The contract's `DbDesignDocument` is intentionally permissive — its
// `fields` are typed as `unknown` so the canvas lib's inner shape can evolve
// without a contract bump. We define stricter local types here for the
// canvas to render against; serialization back to the wire is structural
// (server validates the envelope, not the deep field shape).

// --- Relational --------------------------------------------------------------

export interface RelationalColumn {
  id: string;
  name: string;
  dataType: string;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  isNullable?: boolean;
  isUnique?: boolean;
}

export interface RelationalTable {
  id: string;
  name: string;
  position?: { x: number; y: number };
  columns: RelationalColumn[];
}

// --- Document (Mongo) --------------------------------------------------------

export interface CollectionField {
  id: string;
  name: string;
  bsonType: string;
  /** True when the field stores an ObjectId reference to another collection. */
  isReference?: boolean;
  /** Collection id the reference points at (when isReference is true). */
  referenceCollection?: string;
  /** For `object`/`array` bsonType — nested sub-fields. */
  fields?: CollectionField[];
}

export interface MongoCollection {
  id: string;
  name: string;
  position?: { x: number; y: number };
  fields: CollectionField[];
}

// --- Relationships -----------------------------------------------------------

export type Cardinality =
  | "one_to_one"
  | "one_to_many"
  | "many_to_one"
  | "many_to_many";

export interface Relationship {
  id: string;
  source: { entityId: string; fieldId: string | null };
  target: { entityId: string; fieldId: string | null };
  cardinality: Cardinality;
}

// --- Document envelope -------------------------------------------------------

export interface DbCanvasModel {
  version: 1;
  tables?: RelationalTable[];
  collections?: MongoCollection[];
  relationships?: Relationship[];
}

export function emptyModel(): DbCanvasModel {
  return {
    version: 1,
    tables: [],
    collections: [],
    relationships: [],
  };
}

/** Hydrate a server payload (loosely typed as `unknown` via the contract). */
export function hydrate(raw: unknown): DbCanvasModel {
  const m = (raw ?? {}) as Partial<DbCanvasModel>;
  return {
    version: 1,
    tables: Array.isArray(m.tables) ? (m.tables as RelationalTable[]) : [],
    collections: Array.isArray(m.collections)
      ? (m.collections as MongoCollection[])
      : [],
    relationships: Array.isArray(m.relationships)
      ? (m.relationships as Relationship[])
      : [],
  };
}

// --- ID helpers --------------------------------------------------------------

let counter = 0;
export function nextId(prefix: string): string {
  counter += 1;
  // Add a millisecond timestamp prefix so ids are unique across browser tabs
  // editing the same doc — collision is otherwise possible after a reload.
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}`;
}
