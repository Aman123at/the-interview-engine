/**
 * Phase 23 — code download.
 *
 * Streams a session's source files OUT of its Docker volume as a .zip. The
 * session container is long gone by the time the user clicks Download, so we
 * spin up a SHORT-LIVED helper container (alpine) with the volume mounted
 * READ-ONLY at /sandbox, run `tar` with the right exclude set, and repack the
 * tar stream into a zip on the fly via `archiver`.
 *
 * Security posture mirrors the session containers exactly (Phase 5):
 *   non-root, read-only rootfs, cap-drop ALL, no-new-privileges, no network,
 *   modest mem/cpu/pids caps, --rm-equivalent via remove() in finally.
 * The helper has no network and no writable surface besides a tiny /tmp tmpfs.
 *
 * The helper is REMOVED in `finally` regardless of how the request ends —
 * normal completion, archiver failure, client abort. Never leaks containers.
 */
import { PassThrough, Readable, type Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createRequire } from 'node:module';
const archiver = createRequire(import.meta.url)('archiver') as (
  format: 'zip',
  opts?: { zlib?: { level?: number } },
) => import('archiver').Archiver;
import * as tar from 'tar-stream';
import {
  getDocker,
  imageTag,
  withDockerRetry,
  LABEL_MANAGED,
  LABEL_SESSION,
} from './containerService.js';
import { logger } from '@/utils/logger.js';

/** Image used for the helper. Small + universally available. */
export const EXPORT_HELPER_IMAGE = 'alpine:3.20';

/**
 * Paths excluded from the export. Same shape `tar --exclude` accepts:
 * matched relative to the tar root (we pass `-C /sandbox` so paths are
 * relative to /sandbox). Anything under one of these is dropped.
 */
export const EXPORT_EXCLUDES: readonly string[] = [
  './node_modules',
  './.git',
  './.venv',
  './vendor',
  './dist',
  './build',
  './.next',
  './.pgdata',
  './.mongo',
  './.mysql',
  './.port',
] as const;

/** Safety rails so a malicious / runaway tree can't OOM the API process. */
export const EXPORT_LIMITS = {
  /** Cap on total compressed bytes streamed to the client. */
  maxTotalBytes: 500 * 1024 * 1024, // 500 MiB
  /** Cap on number of entries — protects against tarbombs / billion-files. */
  maxEntries: 20_000,
  /** Helper container hard timeout — should be plenty for sane workspaces. */
  helperTimeoutMs: 60_000,
} as const;

/** Quoted alpine tar command. Paths relative to /sandbox. */
function buildTarCommand(): string {
  const excludes = EXPORT_EXCLUDES.map((p) => `--exclude='${p}'`).join(' ');
  // -h follows symlinks so we capture the file contents rather than dangling
  // links. -C cd's into /sandbox so entries are rooted at "./".
  return `tar -C /sandbox -cf - ${excludes} -h .`;
}

interface CreateHelperInput {
  sessionId: string;
  volumeName: string;
}

async function createHelperContainer(input: CreateHelperInput) {
  return withDockerRetry('createExportHelper', () =>
    getDocker().createContainer({
      name: `isb_export_${input.sessionId}_${Date.now()}`,
      Image: EXPORT_HELPER_IMAGE,
      Tty: false,
      AttachStdout: true,
      AttachStderr: true,
      Cmd: ['/bin/sh', '-c', buildTarCommand()],
      Labels: {
        [LABEL_MANAGED]: 'true',
        [LABEL_SESSION]: input.sessionId,
        isb_role: 'export_helper',
      },
      HostConfig: {
        // Same security contract as the session containers — minus AutoRemove,
        // because we want to attach + wait deterministically and clean up in
        // `finally`. `AutoRemove: true` races with `wait()` and can 404 the
        // remove call after Docker's GC.
        AutoRemove: false,
        Init: true,
        ReadonlyRootfs: true,
        CapDrop: ['ALL'],
        SecurityOpt: ['no-new-privileges:true'],
        PidsLimit: 64,
        Memory: 256 * 1024 * 1024, // 256 MiB — tar is light
        MemorySwap: 256 * 1024 * 1024,
        NanoCpus: 500_000_000, // 0.5 CPU
        Ulimits: [{ Name: 'nofile', Soft: 1024, Hard: 2048 }],
        RestartPolicy: { Name: 'no', MaximumRetryCount: 0 },
        // READ-ONLY volume mount — the helper cannot mutate the source.
        Binds: [`${input.volumeName}:/sandbox:ro`],
        Tmpfs: {
          '/tmp': 'rw,size=16m,mode=1777,nosuid,nodev',
        },
        // No network: tar doesn't need it and we don't want exfil paths.
        NetworkMode: 'none',
      },
      // Run as the same UID/GID we use inside session containers — the
      // sandbox volume's files are owned by 10001:10001.
      User: '10001:10001',
      WorkingDir: '/sandbox',
    }),
  );
}

export interface StreamCodeZipInput {
  sessionId: string;
  volumeName: string;
  /** Filename for Content-Disposition (caller already derived it). */
  filename: string;
  /** The Express response. Headers must NOT have been sent yet. */
  res: Writable & {
    setHeader: (k: string, v: string) => void;
    flushHeaders?: () => void;
    headersSent: boolean;
    status: (n: number) => unknown;
  };
  /** Called when the client aborts so we can short-circuit cleanup. */
  onAbort: (cb: () => void) => void;
}

/**
 * Spawns the helper, pipes its stdout (a tar stream) through `tar-stream`
 * to enumerate entries, and appends each entry into an `archiver` zip
 * piped to the response. Enforces size + entry-count limits and removes
 * the helper container in `finally`.
 *
 * Throws on Docker errors BEFORE the response is sent so the route can
 * map to an HTTP error; if it throws mid-stream (after headers), it
 * destroys the response so the client sees a truncated download rather
 * than a "successful" partial.
 */
export async function streamCodeZip(input: StreamCodeZipInput): Promise<void> {
  const docker = getDocker();
  const helper = await createHelperContainer({
    sessionId: input.sessionId,
    volumeName: input.volumeName,
  });

  // Single dockerode.attach BEFORE start so we don't lose the first bytes.
  const attachStream = await helper.attach({
    stream: true,
    stdout: true,
    stderr: true,
  });

  // Demux stdout/stderr — stdout carries the tar bytes, stderr is diagnostics.
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  docker.modem.demuxStream(attachStream, stdout, stderr);

  // Collect a small stderr tail so we can log on failure.
  const stderrTail: Buffer[] = [];
  let stderrTailLen = 0;
  stderr.on('data', (chunk: Buffer) => {
    if (stderrTailLen >= 4096) return;
    stderrTail.push(chunk);
    stderrTailLen += chunk.length;
  });
  stderr.resume();

  let removed = false;
  let timeoutHandle: NodeJS.Timeout | null = null;
  const cleanup = async () => {
    if (removed) return;
    removed = true;
    if (timeoutHandle) clearTimeout(timeoutHandle);
    try {
      await helper.remove({ force: true });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status !== 404) {
        logger.warn({ err, sessionId: input.sessionId }, 'export helper remove failed');
      }
    }
  };

  // Client-abort wiring — if the user closes the tab mid-download we tear
  // down the helper immediately rather than letting tar finish into a void.
  let clientAborted = false;
  input.onAbort(() => {
    clientAborted = true;
    void cleanup();
  });

  try {
    await withDockerRetry('startExportHelper', () => helper.start());

    // Hard timeout — kill the helper if it hangs.
    timeoutHandle = setTimeout(() => {
      logger.warn({ sessionId: input.sessionId }, 'export helper timed out');
      void cleanup();
    }, EXPORT_LIMITS.helperTimeoutMs);

    // Headers — set BEFORE we start writing zip bytes so the client gets a
    // proper download dialog. Once flushed, we own the response.
    input.res.setHeader('Content-Type', 'application/zip');
    input.res.setHeader(
      'Content-Disposition',
      `attachment; filename="${input.filename}"`,
    );
    input.res.setHeader('Cache-Control', 'no-store');
    input.res.flushHeaders?.();

    const archive = archiver('zip', { zlib: { level: 6 } });
    let totalBytes = 0;
    let entryCount = 0;
    let aborted = false;

    archive.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes > EXPORT_LIMITS.maxTotalBytes && !aborted) {
        aborted = true;
        archive.abort();
        logger.warn(
          { sessionId: input.sessionId, totalBytes },
          'export aborted: size limit exceeded',
        );
      }
    });

    const zipDone = pipeline(archive, input.res as unknown as Writable).catch((err) => {
      // Client closed the socket — normal, swallow.
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ERR_STREAM_PREMATURE_CLOSE' || code === 'EPIPE') return;
      throw err;
    });

    // tar-stream extract: iterate entries, push into archiver. Backpressure
    // is preserved by waiting on entry 'end' before calling cb().
    const extract = tar.extract();

    extract.on('entry', (header, stream, next) => {
      if (aborted || clientAborted) {
        stream.resume();
        return next();
      }
      // Skip directories — archiver builds them implicitly from file paths.
      // Skip non-file types (symlinks, hardlinks, devices) — we already
      // pass `-h` to tar so symlinks materialize as files; anything else is
      // not interesting for a code archive.
      if (header.type !== 'file') {
        stream.resume();
        return next();
      }
      entryCount += 1;
      if (entryCount > EXPORT_LIMITS.maxEntries && !aborted) {
        aborted = true;
        archive.abort();
        logger.warn(
          { sessionId: input.sessionId, entryCount },
          'export aborted: entry count exceeded',
        );
        stream.resume();
        return next();
      }
      // Normalize the entry name: tar emits "./src/foo.ts"; zip prefers
      // "src/foo.ts".
      const name = header.name.replace(/^\.\//, '');
      archive.append(stream as unknown as Readable, {
        name,
        date: header.mtime,
        mode: header.mode,
      });
      // archiver consumes the stream — wait for it to finish before
      // accepting the next entry so we apply backpressure.
      stream.on('end', () => next());
      stream.on('error', (err) => next(err));
    });

    const extractDone = new Promise<void>((resolve, reject) => {
      extract.on('finish', () => resolve());
      extract.on('error', (err) => reject(err));
    });

    // Feed tar bytes into the extract parser.
    stdout.pipe(extract);
    stdout.on('error', (err) => extract.destroy(err));

    await extractDone;
    await archive.finalize();
    await zipDone;

    // Wait for tar exit so we can surface non-zero exits as errors.
    const exit = await helper.wait().catch((err) => {
      logger.warn({ err, sessionId: input.sessionId }, 'export helper wait failed');
      return { StatusCode: 0 };
    });
    if ((exit as { StatusCode: number }).StatusCode !== 0 && !clientAborted) {
      const tail = Buffer.concat(stderrTail).toString('utf8');
      logger.warn(
        { sessionId: input.sessionId, exit, tail },
        'export helper exited non-zero',
      );
    }
  } catch (err) {
    // If headers were already flushed, we can't switch to a JSON error —
    // destroy the response so the client sees a corrupt zip rather than a
    // silently-truncated one.
    if (input.res.headersSent) {
      (input.res as unknown as { destroy: (e?: Error) => void }).destroy(
        err instanceof Error ? err : new Error(String(err)),
      );
    }
    throw err;
  } finally {
    await cleanup();
  }
}
