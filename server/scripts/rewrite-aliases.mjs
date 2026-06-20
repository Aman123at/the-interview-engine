#!/usr/bin/env node
/**
 * Post-build: rewrite `@/foo` path-alias imports in dist/ to relative paths.
 *
 * tsc emits the alias literally (it doesn't resolve `paths`), so node ESM
 * fails at runtime with ERR_MODULE_NOT_FOUND. This walks dist/, finds every
 * `from '@/x'` / `import('@/x')` / `export ... from '@/x'`, and rewrites the
 * specifier to a relative `./` or `../` path pointing at the same file.
 *
 * Zero dependencies — runs as part of `pnpm build` so prod `node dist/server.js`
 * works.
 */
import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

async function walk(dir) {
  const out = [];
  for (const name of await readdir(dir)) {
    const p = join(dir, name);
    const s = await stat(p);
    if (s.isDirectory()) out.push(...(await walk(p)));
    else if (p.endsWith('.js') || p.endsWith('.js.map')) out.push(p);
  }
  return out;
}

// Matches: from '@/x', from "@/x", import('@/x'), import("@/x")
const RE = /(\bfrom\s+|\bimport\s*\(\s*)(['"])@\/([^'"]+)\2/g;

let touched = 0;
for (const file of await walk(DIST)) {
  if (file.endsWith('.map')) continue;
  const src = await readFile(file, 'utf8');
  if (!src.includes("'@/") && !src.includes('"@/')) continue;
  const fileDir = dirname(file);
  const rewritten = src.replace(RE, (_, kw, q, sub) => {
    const target = join(DIST, sub);
    let rel = relative(fileDir, target).replace(/\\/g, '/');
    if (!rel.startsWith('.')) rel = './' + rel;
    return `${kw}${q}${rel}${q}`;
  });
  if (rewritten !== src) {
    await writeFile(file, rewritten);
    touched++;
  }
}
console.log(`[rewrite-aliases] rewrote ${touched} files under dist/`);
