import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit config — used by `pnpm generate` for schema introspection /
 * diff utilities only. Actual migrations are HAND-WRITTEN as up/down SQL
 * pairs under src/db/migrations/ and applied by src/db/migrate.ts. Do NOT
 * point this generator at the same folder; we keep them disjoint.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle/generated',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/postgres',
  },
  verbose: true,
  strict: true,
});
