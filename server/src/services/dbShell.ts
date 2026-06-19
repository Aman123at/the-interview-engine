/**
 * Single source of truth for the in-container database integration.
 *
 * When a Node session selects a database, the init script (init-node.sh) boots
 * that DB engine INSIDE the session container, seeds a friendly database with a
 * `health` table/collection, and wires the dev server to it. The constants here
 * MUST stay in sync with init-node.sh — the connection details are deterministic
 * so both the init script and the terminal layer can target the same DB without
 * passing state around.
 */

/** Friendly, deterministic database name seeded in every DB-enabled session. */
export const DB_NAME = 'sandbox_db';
export const DB_USER = 'sandbox';
export const PG_PORT = 5432;
export const MONGO_PORT = 27017;
export const MYSQL_PORT = 3306;

export type DbKind = 'postgres' | 'mongo' | 'mysql';
/** Terminal kinds the WS layer understands. `shell` is a plain bash PTY. */
export type ShellKind = 'shell' | 'psql' | 'mongosh' | 'mysql';

/**
 * Map a session's customization to its DB engine, or null if none.
 * The Node framework's `database` radio yields 'PostgreSQL' | 'MySQL' |
 * 'MongoDB' | null. (MySQL has no in-container engine wired yet.)
 */
export function dbKindFor(
  framework: string,
  customization: Record<string, unknown> | null | undefined,
): DbKind | null {
  // Both the Node framework and the full-stack combo run an in-container DB.
  if ((framework !== 'node' && framework !== 'fullstack') || !customization) return null;
  const db = customization.database;
  if (db === 'PostgreSQL') return 'postgres';
  if (db === 'MongoDB') return 'mongo';
  if (db === 'MySQL') return 'mysql';
  return null;
}

/** The DB shell kind for a session, or null if the session has no DB. */
export function dbShellKindFor(
  framework: string,
  customization: Record<string, unknown> | null | undefined,
): Extract<ShellKind, 'psql' | 'mongosh' | 'mysql'> | null {
  const kind = dbKindFor(framework, customization);
  if (kind === 'postgres') return 'psql';
  if (kind === 'mongo') return 'mongosh';
  if (kind === 'mysql') return 'mysql';
  return null;
}

/**
 * The command a terminal of the given kind should exec inside the container.
 * Unknown / 'shell' kinds fall back to bash. DB shells connect to the seeded
 * database over loopback (trust auth — localhost only, v1).
 */
export function shellCommandFor(kind: ShellKind | undefined): string[] {
  switch (kind) {
    case 'psql':
      return ['psql', `postgresql://${DB_USER}@127.0.0.1:${PG_PORT}/${DB_NAME}`];
    case 'mongosh':
      return ['mongosh', `mongodb://127.0.0.1:${MONGO_PORT}/${DB_NAME}`];
    case 'mysql':
      // MariaDB client (skip-grant-tables → root, no password, loopback only).
      return ['mariadb', '-h', '127.0.0.1', '-P', String(MYSQL_PORT), '-u', 'root', DB_NAME];
    case 'shell':
    default:
      return ['/bin/bash'];
  }
}

/** Human-readable tab label for a shell kind. */
export function shellLabelFor(kind: ShellKind | undefined): string {
  switch (kind) {
    case 'psql':
      return 'postgres';
    case 'mongosh':
      return 'mongo';
    case 'mysql':
      return 'mysql';
    default:
      return 'shell';
  }
}
