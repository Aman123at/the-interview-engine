/**
 * Per-engine datatype catalogs surfaced in the column editor. Lists are
 * dialect-correct and intentionally short — the common 95% — so the dropdown
 * stays scannable. Free-form override is allowed via the `Other…` entry in
 * the UI; the saved string is whatever the user picked.
 */

export interface DataTypeOption {
  /** Stored on `column.dataType` (free-form string, see contract). */
  id: string;
  /** Display label. */
  label: string;
  /** Optional one-line help for the dropdown. */
  hint?: string;
}

/** PostgreSQL type set — superset that covers most interview scenarios. */
export const POSTGRES_TYPES: DataTypeOption[] = [
  { id: "uuid", label: "uuid", hint: "Universally unique id" },
  { id: "serial", label: "serial", hint: "Auto-increment int" },
  { id: "bigserial", label: "bigserial", hint: "Auto-increment bigint" },
  { id: "integer", label: "integer" },
  { id: "bigint", label: "bigint" },
  { id: "smallint", label: "smallint" },
  { id: "numeric", label: "numeric" },
  { id: "real", label: "real" },
  { id: "double precision", label: "double precision" },
  { id: "boolean", label: "boolean" },
  { id: "text", label: "text" },
  { id: "varchar(255)", label: "varchar(255)" },
  { id: "char(36)", label: "char(36)" },
  { id: "date", label: "date" },
  { id: "time", label: "time" },
  { id: "timestamp", label: "timestamp" },
  { id: "timestamptz", label: "timestamptz", hint: "With time zone" },
  { id: "interval", label: "interval" },
  { id: "json", label: "json" },
  { id: "jsonb", label: "jsonb" },
  { id: "bytea", label: "bytea" },
];

/** MySQL type set — note the differences from Postgres (no serial, no uuid). */
export const MYSQL_TYPES: DataTypeOption[] = [
  {
    id: "INT AUTO_INCREMENT",
    label: "INT AUTO_INCREMENT",
    hint: "Auto-increment int",
  },
  {
    id: "BIGINT AUTO_INCREMENT",
    label: "BIGINT AUTO_INCREMENT",
    hint: "Auto-increment bigint",
  },
  { id: "INT", label: "INT" },
  { id: "BIGINT", label: "BIGINT" },
  { id: "TINYINT", label: "TINYINT" },
  { id: "SMALLINT", label: "SMALLINT" },
  { id: "DECIMAL(10,2)", label: "DECIMAL(10,2)" },
  { id: "FLOAT", label: "FLOAT" },
  { id: "DOUBLE", label: "DOUBLE" },
  { id: "BOOLEAN", label: "BOOLEAN", hint: "Alias for TINYINT(1)" },
  { id: "CHAR(36)", label: "CHAR(36)", hint: "UUID-shaped" },
  { id: "VARCHAR(255)", label: "VARCHAR(255)" },
  { id: "TEXT", label: "TEXT" },
  { id: "MEDIUMTEXT", label: "MEDIUMTEXT" },
  { id: "LONGTEXT", label: "LONGTEXT" },
  { id: "DATE", label: "DATE" },
  { id: "TIME", label: "TIME" },
  { id: "DATETIME", label: "DATETIME" },
  { id: "TIMESTAMP", label: "TIMESTAMP" },
  { id: "JSON", label: "JSON" },
  { id: "BLOB", label: "BLOB" },
];

/** BSON / Mongo field types. */
export const BSON_TYPES: DataTypeOption[] = [
  { id: "objectId", label: "ObjectId", hint: "Mongo's primary id" },
  { id: "string", label: "string" },
  { id: "int", label: "int" },
  { id: "long", label: "long" },
  { id: "double", label: "double" },
  { id: "decimal", label: "decimal" },
  { id: "boolean", label: "boolean" },
  { id: "date", label: "date" },
  { id: "timestamp", label: "timestamp" },
  { id: "object", label: "object", hint: "Embedded sub-document" },
  { id: "array", label: "array", hint: "Embedded list" },
  { id: "binData", label: "binData" },
  { id: "null", label: "null" },
];

export function dataTypesFor(engine: "postgresql" | "mysql"): DataTypeOption[] {
  return engine === "postgresql" ? POSTGRES_TYPES : MYSQL_TYPES;
}
