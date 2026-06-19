/**
 * Bidirectional file sync — writes go to BOTH the container volume AND the
 * durable `session_files` copy via the DAL, gated by an optimistic version
 * check. Reads come from the container (truth at runtime) and lazily seed
 * the DB so subsequent versioned writes have a baseline.
 *
 * The version contract:
 *   - Server is the authority on `version`.
 *   - Every successful write returns `{ version: previous + 1 }`.
 *   - Clients send `expectedVersion` on writes:
 *       match    → write applied, new version returned
 *       mismatch → ConflictError (the global error/typed ws-error wraps it)
 *   - The DB partial unique index + sessionFilesDal.upsert give us atomicity
 *     across concurrent clients.
 *
 * Excluded from durable sync: node_modules, .venv, vendor, .git, dist, build.
 * The container still has them; we just don't persist them in Postgres.
 */
import { posix } from 'node:path';
import { getDocker } from './containerService.js';
import { sessionFilesDal, sessionsDal } from '@/dal/index.js';
import { ContainerError, ValidationError, NotFoundError } from '@/errors/index.js';
import type { SessionFile } from '@/db/schema/index.js';
import { logger } from '@/utils/logger.js';

export const EXCLUDED_DIRS = ['node_modules', '.venv', 'vendor', '.git', 'dist', 'build', '.next'] as const;

/**
 * In-container database data dirs. These are HIDDEN from the file tree and
 * never persisted (binary cluster files, large) — but unlike EXCLUDED_DIRS they
 * are NOT pruned on close: they hold the seeded DB + the candidate's data, which
 * must survive close→resume (persisted on the volume).
 */
export const HIDDEN_DIRS = ['.pgdata', '.pglog', '.mongo', '.mysql'] as const;
const SANDBOX_PREFIX = '/sandbox/';

// ---------------------------------------------------------------------------
// Path validation — guards against traversal and absolute-path injection.
// All paths are RELATIVE to /sandbox. Empty path or one starting with `/`
// is rejected. `..` segments are rejected.
// ---------------------------------------------------------------------------
export function normalizePath(input: string): string {
  if (typeof input !== 'string' || input.length === 0) {
    throw new ValidationError('path is required');
  }
  if (input.startsWith('/')) throw new ValidationError('path must be relative to /sandbox');
  // Reject control chars / NUL bytes.
  if (/[\x00-\x1f]/.test(input)) throw new ValidationError('path contains control characters');
  const norm = posix.normalize(input).replace(/^\.\//, '');
  if (norm === '' || norm === '.') throw new ValidationError('path is required');
  if (norm.startsWith('..') || norm.includes('/../') || norm === '..') {
    throw new ValidationError('path traversal is not allowed');
  }
  if (norm.length > 1024) throw new ValidationError('path too long');
  return norm;
}

function isExcludedPath(path: string): boolean {
  const parts = path.split('/');
  return parts.some((seg) => (EXCLUDED_DIRS as readonly string[]).includes(seg));
}

/** DB data dirs — hidden from the tree + rejected for read/write, never pruned. */
function isHiddenPath(path: string): boolean {
  const parts = path.split('/');
  return parts.some((seg) => (HIDDEN_DIRS as readonly string[]).includes(seg));
}

// ---------------------------------------------------------------------------
// Container helpers — exec a command and capture stdout/stderr, or pipe a
// stdin into one. dockerode's exec API is a bit gnarly; small wrappers below.
// ---------------------------------------------------------------------------
async function execCapture(
  containerId: string,
  cmd: string[],
  { stdinBuf, ignoreExit = false }: { stdinBuf?: Buffer; ignoreExit?: boolean } = {},
): Promise<{ stdout: Buffer; stderr: Buffer; exitCode: number }> {
  const c = getDocker().getContainer(containerId);
  const exec = await c.exec({
    Cmd: cmd,
    AttachStdin: stdinBuf != null,
    AttachStdout: true,
    AttachStderr: true,
    Tty: false,
    User: '10001:10001',
  });
  const stream = await exec.start({ hijack: true, stdin: stdinBuf != null });
  if (stdinBuf) {
    stream.write(stdinBuf);
    stream.end();
  }
  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  // Demux: dockerode provides modem.demuxStream
  await new Promise<void>((resolve, reject) => {
    const out = {
      write: (b: Buffer) => stdoutChunks.push(b),
      end: () => undefined,
    } as unknown as NodeJS.WritableStream;
    const err = {
      write: (b: Buffer) => stderrChunks.push(b),
      end: () => undefined,
    } as unknown as NodeJS.WritableStream;
    getDocker().modem.demuxStream(stream, out, err);
    stream.on('end', resolve);
    stream.on('error', reject);
  });
  const info = await exec.inspect();
  const exitCode = info.ExitCode ?? 0;
  if (!ignoreExit && exitCode !== 0) {
    throw new ContainerError(`exec ${cmd.join(' ')} exited ${exitCode}`, {
      stderr: Buffer.concat(stderrChunks).toString('utf8').slice(0, 500),
    });
  }
  return {
    stdout: Buffer.concat(stdoutChunks),
    stderr: Buffer.concat(stderrChunks),
    exitCode,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface TreeNode {
  path: string;
  type: 'file' | 'dir';
  size?: number;
}

/**
 * Walk /sandbox in the container, skipping the EXCLUDED_DIRS. Returns a flat
 * list of relative paths + sizes — the client builds the tree from this.
 */
export async function listTree(containerId: string): Promise<TreeNode[]> {
  // Prune both the heavy regenerable dirs AND the DB data dirs — the latter are
  // huge binary clusters the candidate never edits through the tree.
  const prunedDirs = [...EXCLUDED_DIRS, ...HIDDEN_DIRS];
  const prune = prunedDirs.map((d) => `-name ${d}`).join(' -o ');
  // `find … \( -name node_modules -o … \) -prune -o -type f -printf '%P\t%s\n'`
  const script = `cd /sandbox && find . \\( ${prune} \\) -prune -o -type f -printf '%P\\t%s\\n'`;
  const { stdout } = await execCapture(containerId, ['sh', '-c', script]);
  return stdout
    .toString('utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [path, sizeStr] = line.split('\t');
      return { path: path ?? '', type: 'file' as const, size: Number(sizeStr ?? 0) };
    })
    .filter((n) => n.path.length > 0 && !isExcludedPath(n.path) && !isHiddenPath(n.path));
}

/**
 * Read a file from the container. Also lazily seeds the durable copy so the
 * client gets a real version it can use for subsequent writes.
 */
export async function readFile(
  sessionId: string,
  containerId: string,
  rawPath: string,
): Promise<{ path: string; content: string; version: number }> {
  const path = normalizePath(rawPath);
  if (isExcludedPath(path) || isHiddenPath(path)) {
    throw new ValidationError(`path is in an excluded directory (${EXCLUDED_DIRS.join(', ')})`);
  }
  const { stdout, exitCode, stderr } = await execCapture(
    containerId,
    ['cat', SANDBOX_PREFIX + path],
    { ignoreExit: true },
  );
  if (exitCode !== 0) {
    if (stderr.toString('utf8').includes('No such file')) {
      throw new NotFoundError(`file not found: ${path}`);
    }
    throw new ContainerError(`failed to read ${path}: ${stderr.toString('utf8').slice(0, 200)}`);
  }
  const content = stdout.toString('utf8');

  // Lazily seed the durable copy. If it already exists, this returns the
  // current row's version unchanged because the content matches.
  let row: SessionFile | null = await sessionFilesDal.findByPath(sessionId, path);
  if (!row || row.content !== content) {
    row = await sessionFilesDal.upsert({ sessionId, path, content });
  }
  return { path, content, version: row.version };
}

export interface WriteFileInput {
  sessionId: string;
  containerId: string;
  path: string;
  content: string;
  /** Client's last-known version. 0 = "I'm creating this file fresh". */
  expectedVersion: number;
}

export interface WriteFileResult {
  path: string;
  version: number;
  size: number;
}

/**
 * Idempotent, versioned write. Order:
 *   1. Normalize/validate path.
 *   2. Reject excluded paths (node_modules etc.) — we don't sync those.
 *   3. Upsert to DB with `expectedVersion` (throws ConflictError on mismatch).
 *   4. Write to the container volume via `docker exec tee`.
 *   5. If (4) fails, BEST-EFFORT rollback the DB to the previous version
 *      so the client retry won't deadlock on a stale expected version.
 */
export async function writeFile(input: WriteFileInput): Promise<WriteFileResult> {
  const path = normalizePath(input.path);
  if (isExcludedPath(path) || isHiddenPath(path)) {
    throw new ValidationError(`path is in an excluded directory (${EXCLUDED_DIRS.join(', ')})`);
  }

  // Capture pre-state for rollback.
  const before = await sessionFilesDal.findByPath(input.sessionId, path);

  // DB first — this is the source of truth for version control.
  const row = await sessionFilesDal.upsert({
    sessionId: input.sessionId,
    path,
    content: input.content,
    expectedVersion: input.expectedVersion,
  });

  // Write to container. mkdir -p for the parent dir, then tee into the file.
  try {
    const dir = posix.dirname(path);
    if (dir && dir !== '.') {
      await execCapture(input.containerId, ['mkdir', '-p', SANDBOX_PREFIX + dir]);
    }
    await execCapture(
      input.containerId,
      ['tee', SANDBOX_PREFIX + path],
      { stdinBuf: Buffer.from(input.content, 'utf8') },
    );
  } catch (err) {
    // Rollback DB so the client retry isn't poisoned.
    if (before) {
      try {
        await sessionFilesDal.upsert({
          sessionId: input.sessionId,
          path,
          content: before.content,
        });
      } catch (e) {
        logger.warn({ err: e }, 'fileSync: DB rollback after container write failure also failed');
      }
    }
    throw err;
  }

  // Touch lastActiveAt so the reaper's idle check sees recent activity.
  // Fire-and-forget — a missed update isn't worth blocking the user write.
  void sessionsDal.touch(input.sessionId).catch(() => undefined);

  return { path, version: row.version, size: row.size };
}

export async function deleteFile(
  containerId: string,
  sessionId: string,
  rawPath: string,
): Promise<void> {
  const path = normalizePath(rawPath);
  if (isExcludedPath(path) || isHiddenPath(path)) throw new ValidationError('cannot delete excluded paths');
  // rm -rf is intentional — a "delete" from the file tree can be a file or a dir.
  await execCapture(containerId, ['rm', '-rf', SANDBOX_PREFIX + path], { ignoreExit: true });
  await sessionFilesDal.deleteByPath(sessionId, path);
}

export async function renameFile(
  containerId: string,
  sessionId: string,
  fromRaw: string,
  toRaw: string,
): Promise<void> {
  const from = normalizePath(fromRaw);
  const to = normalizePath(toRaw);
  if (isExcludedPath(from) || isExcludedPath(to) || isHiddenPath(from) || isHiddenPath(to)) {
    throw new ValidationError('cannot rename excluded paths');
  }
  const dir = posix.dirname(to);
  if (dir && dir !== '.') {
    await execCapture(containerId, ['mkdir', '-p', SANDBOX_PREFIX + dir]);
  }
  await execCapture(containerId, ['mv', SANDBOX_PREFIX + from, SANDBOX_PREFIX + to]);
  await sessionFilesDal.rename(sessionId, from, to);
}

export async function createDirectory(containerId: string, rawPath: string): Promise<void> {
  const path = normalizePath(rawPath);
  if (isExcludedPath(path) || isHiddenPath(path)) throw new ValidationError('cannot create excluded paths');
  await execCapture(containerId, ['mkdir', '-p', SANDBOX_PREFIX + path]);
}

// ---------------------------------------------------------------------------
// Phase 11 helpers — bulk save + prune.
// ---------------------------------------------------------------------------

const PERSIST_FILE_SIZE_CAP_BYTES = 1 * 1024 * 1024; // 1 MiB per file

/**
 * Walk /sandbox in the container and persist every non-excluded source file
 * into `session_files`. Idempotent: `readFile` only re-upserts when content
 * differs, so versions only bump on real changes. Files larger than 1 MiB are
 * skipped (build artifacts that snuck past the exclude list).
 *
 * Returns counts so the caller can log them as part of the close audit trail.
 */
export async function persistAllFiles(
  sessionId: string,
  containerId: string,
): Promise<{ scanned: number; persisted: number; skipped: number; failed: number }> {
  let scanned = 0;
  let persisted = 0;
  let skipped = 0;
  let failed = 0;

  const nodes = await listTree(containerId);
  for (const node of nodes) {
    scanned++;
    if ((node.size ?? 0) > PERSIST_FILE_SIZE_CAP_BYTES) {
      skipped++;
      logger.warn(
        { sessionId, path: node.path, size: node.size },
        'persistAllFiles: skipping oversize file',
      );
      continue;
    }
    try {
      await readFile(sessionId, containerId, node.path);
      persisted++;
    } catch (err) {
      failed++;
      logger.warn({ err, sessionId, path: node.path }, 'persistAllFiles: per-file read failed');
    }
  }
  logger.info(
    { sessionId, scanned, persisted, skipped, failed },
    'persistAllFiles: complete',
  );
  return { scanned, persisted, skipped, failed };
}

/**
 * Prune heavy regenerable directories from the container's volume — saves
 * disk on `ended` sessions. Runs inside the still-live container before we
 * stop it. Errors are logged but never thrown: prune is a disk-space
 * optimization, not a correctness guarantee. On resume the init script
 * re-installs from `package.json` / `requirements.txt` / `go.mod`.
 */
export async function pruneHeavyDirs(containerId: string): Promise<{ pruned: string[]; failed: string[] }> {
  const targets = EXCLUDED_DIRS.filter((d) => d !== '.git'); // keep .git, it's small + carries history
  // Remove each heavy dir WHEREVER it appears — top-level AND nested (the
  // full-stack combo's client/ and server/ each carry their own node_modules).
  // The DB data dirs (HIDDEN_DIRS) are pruned from the search so `find` never
  // descends into the big cluster files, and are NEVER deleted (they persist).
  const skip = HIDDEN_DIRS.map((d) => `-name '${d}'`).join(' -o ');
  const names = targets.map((d) => `-name '${d}'`).join(' -o ');
  const script = `find /sandbox -type d \\( ${skip} \\) -prune -o -type d \\( ${names} \\) -prune -exec rm -rf {} +`;
  try {
    const { exitCode } = await execCapture(containerId, ['sh', '-c', script], { ignoreExit: true });
    if (exitCode === 0) return { pruned: [...targets], failed: [] };
    return { pruned: [], failed: [...targets] };
  } catch (err) {
    logger.warn({ err, containerId }, 'pruneHeavyDirs: find/rm failed');
    return { pruned: [], failed: [...targets] };
  }
}
