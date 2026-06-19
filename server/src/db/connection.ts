import { Pool, type PoolConfig } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { config } from '@/config/index.js';
import { logger } from '@/utils/logger.js';
import * as schema from './schema/index.js';

export type Database = NodePgDatabase<typeof schema>;

let pool: Pool | null = null;
let dbInstance: Database | null = null;

function buildPool(): Pool {
  const cfg: PoolConfig = {
    connectionString: config.DATABASE_URL,
    max: config.DATABASE_POOL_MAX,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  };
  const p = new Pool(cfg);
  p.on('error', (err) => {
    logger.error({ err }, 'pg pool: idle client error');
  });
  return p;
}

export function getPool(): Pool {
  if (!pool) pool = buildPool();
  return pool;
}

export function getDb(): Database {
  if (!dbInstance) {
    dbInstance = drizzle(getPool(), { schema, logger: false });
  }
  return dbInstance;
}

export async function closeDb(): Promise<void> {
  if (pool) {
    const p = pool;
    pool = null;
    dbInstance = null;
    await p.end();
  }
}

export async function pingDb(): Promise<boolean> {
  try {
    const res = await getPool().query('SELECT 1 AS ok');
    return res.rows[0]?.ok === 1;
  } catch (err) {
    logger.error({ err }, 'db ping failed');
    return false;
  }
}
