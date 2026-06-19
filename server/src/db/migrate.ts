/**
 * Tiny reversible migration runner.
 *
 * Looks for `NNNN_name.up.sql` and `NNNN_name.down.sql` pairs under
 * `src/db/migrations/`, runs them inside a transaction, and tracks applied
 * migrations in a `_migrations` table.
 *
 * Usage: `pnpm migrate` | `pnpm migrate:rollback` | `pnpm migrate:status`
 */
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { PoolClient } from 'pg';
import { getPool, closeDb } from './connection.js';
import { logger } from '@/utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, 'migrations');

interface MigrationFile {
  id: string; // e.g. "0001_init"
  numericId: number;
  name: string;
  upPath: string;
  downPath: string;
}

async function listMigrations(): Promise<MigrationFile[]> {
  const entries = await readdir(MIGRATIONS_DIR);
  const ups = entries.filter((f) => f.endsWith('.up.sql')).sort();

  const files: MigrationFile[] = [];
  for (const up of ups) {
    const id = up.replace(/\.up\.sql$/, '');
    const down = `${id}.down.sql`;
    if (!entries.includes(down)) {
      throw new Error(`Migration ${id} is missing its .down.sql pair`);
    }
    const numericMatch = /^(\d+)_/.exec(id);
    if (!numericMatch) {
      throw new Error(`Migration ${id} must start with NNNN_`);
    }
    files.push({
      id,
      numericId: Number(numericMatch[1]),
      name: id.replace(/^\d+_/, ''),
      upPath: join(MIGRATIONS_DIR, up),
      downPath: join(MIGRATIONS_DIR, down),
    });
  }
  return files;
}

async function ensureMigrationsTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id          varchar(255) PRIMARY KEY,
      applied_at  timestamptz NOT NULL DEFAULT now()
    );
  `);
}

async function appliedIds(client: PoolClient): Promise<Set<string>> {
  const res = await client.query<{ id: string }>('SELECT id FROM _migrations ORDER BY id ASC');
  return new Set(res.rows.map((r) => r.id));
}

async function runFile(client: PoolClient, path: string): Promise<void> {
  const sql = await readFile(path, 'utf8');
  await client.query(sql);
}

async function up(): Promise<number> {
  const pool = getPool();
  const client = await pool.connect();
  let applied = 0;
  try {
    await ensureMigrationsTable(client);
    const files = await listMigrations();
    const done = await appliedIds(client);

    for (const f of files) {
      if (done.has(f.id)) continue;
      logger.info({ migration: f.id }, 'applying migration (up)');
      await client.query('BEGIN');
      try {
        await runFile(client, f.upPath);
        await client.query('INSERT INTO _migrations (id) VALUES ($1)', [f.id]);
        await client.query('COMMIT');
        applied++;
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${f.id} failed: ${(err as Error).message}`, { cause: err });
      }
    }
    if (applied === 0) logger.info('no pending migrations');
    else logger.info({ applied }, 'migrations complete');
    return applied;
  } finally {
    client.release();
  }
}

async function down(): Promise<boolean> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);
    const files = await listMigrations();
    const done = await appliedIds(client);
    // Roll back the most recent applied migration only.
    const reversed = [...files].reverse();
    const last = reversed.find((f) => done.has(f.id));
    if (!last) {
      logger.info('nothing to roll back');
      return false;
    }
    logger.info({ migration: last.id }, 'rolling back migration (down)');
    await client.query('BEGIN');
    try {
      await runFile(client, last.downPath);
      await client.query('DELETE FROM _migrations WHERE id = $1', [last.id]);
      await client.query('COMMIT');
      logger.info({ migration: last.id }, 'rollback complete');
      return true;
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`Rollback of ${last.id} failed: ${(err as Error).message}`, { cause: err });
    }
  } finally {
    client.release();
  }
}

async function status(): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);
    const files = await listMigrations();
    const done = await appliedIds(client);
    for (const f of files) {
      const mark = done.has(f.id) ? '✓ applied' : '· pending';
      // eslint-disable-next-line no-console
      console.log(`${mark}  ${f.id}`);
    }
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  const cmd = process.argv[2] ?? 'up';
  try {
    if (cmd === 'up') await up();
    else if (cmd === 'down') await down();
    else if (cmd === 'status') await status();
    else {
      // eslint-disable-next-line no-console
      console.error(`Unknown command: ${cmd}. Use: up | down | status`);
      process.exit(2);
    }
  } catch (err) {
    logger.error({ err }, 'migration command failed');
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}

void main();
