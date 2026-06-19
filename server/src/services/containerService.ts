/**
 * dockerode wrapper — pure Docker ops, NO DB writes.
 *
 * Everything that touches /var/run/docker.sock lives here. Callers translate
 * results into session_events rows + sessions updates via the DAL.
 *
 * The container's well-known dev-server port (per Phase 5) is published to
 * the host port the orchestrator passes in. Security flags below MUST stay
 * in sync with docker/README.md — they are the contract.
 */
import Docker from 'dockerode';
import { config } from '@/config/index.js';
import { logger } from '@/utils/logger.js';
import { ContainerError } from '@/errors/index.js';

// Stable label set we use to filter daemon events to OUR containers.
export const LABEL_MANAGED = 'isb_managed';
export const LABEL_SESSION = 'isb_session_id';
export const LABEL_USER = 'isb_user_id';
export const LABEL_FRAMEWORK = 'isb_framework';

let docker: Docker | null = null;

/**
 * dockerode connection options. Honors DOCKER_HOST (tcp://host:port) when set
 * — used in prod where the API talks to a docker-socket-proxy sidecar over the
 * network — and falls back to the local unix socket in dev.
 */
function dockerOptions(): Docker.DockerOptions {
  const host = config.DOCKER_HOST;
  if (host && /^tcp:\/\//i.test(host)) {
    const u = new URL(host);
    return {
      host: u.hostname,
      port: Number(u.port || 2375),
      protocol: u.protocol === 'tcps:' ? 'https' : 'http',
    };
  }
  return { socketPath: config.DOCKER_SOCKET };
}

export function getDocker(): Docker {
  if (!docker) docker = new Docker(dockerOptions());
  return docker;
}

export async function pingDocker(): Promise<boolean> {
  try {
    await getDocker().ping();
    return true;
  } catch (err) {
    logger.error({ err }, 'docker ping failed');
    return false;
  }
}

// ---------------------------------------------------------------------------
// Per-framework dev-server port the container EXPOSES.
// The published HOST port is allocated by the port pool; the container-side
// port is fixed per framework so the orchestrator knows what to map to.
// ---------------------------------------------------------------------------
export function containerDevPort(framework: string, customization: Record<string, unknown>): number | null {
  switch (framework) {
    case 'react':
      return (customization.bundler as string | undefined) === 'Next.js' ? 3000 : 5173;
    case 'node':
      return 3000;
    case 'fullstack':
      // The React (Vite) dev server is the preview surface; it proxies /api to
      // the in-container Node server (3000), which talks to the DB. Only Vite's
      // port is published.
      return 5173;
    case 'python': {
      const f = customization.framework as string | undefined;
      if (f === 'Flask') return 5000;
      // FastAPI, Django, or none — default to 8000 (init script overrides via .port)
      return 8000;
    }
    case 'golang':
      return 8080;
    case 'javascript':
      return 8080;
    case 'cpp':
      return null; // terminal-only, no preview
    default:
      return null;
  }
}

export function imageTag(framework: string): string {
  return `interview-sandbox-${framework}:latest`;
}

const GIB = 1024 * 1024 * 1024;
/**
 * Per-container memory cap. Node sessions with an in-container database engine
 * (Postgres/Mongo) need headroom for the DB + the dev server, so they get
 * 1.5 GiB; all other sessions keep the 1 GiB security-budget default.
 */
export function memoryBytesFor(framework: string, customization: Record<string, unknown>): number {
  // Full-stack combo runs a DB engine + the Node server + the Vite dev server
  // in one container — give it 2 GiB.
  if (framework === 'fullstack') return 2 * GIB;
  if (framework === 'node') {
    const db = customization.database;
    if (db === 'PostgreSQL' || db === 'MongoDB' || db === 'MySQL') return Math.floor(1.5 * GIB);
  }
  return GIB;
}

export function volumeName(sessionId: string): string {
  return `isb_session_${sessionId}`;
}

export function containerName(sessionId: string): string {
  return `isb_session_${sessionId}`;
}

/**
 * Traefik router/service name for a session. Must be unique per session and
 * use only chars Traefik accepts in label keys (alnum + hyphen).
 */
export function traefikRouterName(sessionId: string): string {
  return `sess-${sessionId.replace(/[^a-zA-Z0-9-]/g, '')}`;
}

// ---------------------------------------------------------------------------
// Retry helper for transient docker errors.
// ---------------------------------------------------------------------------
function isTransientDockerError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; statusCode?: number; message?: string };
  if (e.code === 'ECONNRESET' || e.code === 'EAI_AGAIN' || e.code === 'ETIMEDOUT') return true;
  if (typeof e.statusCode === 'number' && e.statusCode >= 500 && e.statusCode < 600) return true;
  if (typeof e.message === 'string' && /temporar(il)?y|timeout|EOF/i.test(e.message)) return true;
  return false;
}

export async function withDockerRetry<T>(
  label: string,
  fn: () => Promise<T>,
  { attempts = 3, baseMs = 200 }: { attempts?: number; baseMs?: number } = {},
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransientDockerError(err) || i === attempts - 1) throw err;
      const delay = baseMs * 2 ** i;
      logger.warn({ label, attempt: i + 1, delay, err }, 'transient docker error, retrying');
      await new Promise<void>((r) => setTimeout(r, delay));
    }
  }
  throw lastErr ?? new ContainerError(`withDockerRetry: ${label} exhausted attempts`);
}

// ---------------------------------------------------------------------------
// Volumes
// ---------------------------------------------------------------------------
export async function createVolume(name: string): Promise<void> {
  await withDockerRetry('createVolume', () =>
    getDocker().createVolume({
      Name: name,
      Labels: { [LABEL_MANAGED]: 'true' },
    }),
  );
}

export async function removeVolume(name: string): Promise<void> {
  try {
    await getDocker().getVolume(name).remove({ force: true });
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode === 404) return;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Containers
// ---------------------------------------------------------------------------
export interface CreateContainerInput {
  sessionId: string;
  userId: string;
  framework: string;
  customization: Record<string, unknown>;
  hostPort: number | null; // null for cpp / when there's no preview
}

export async function createContainer(input: CreateContainerInput): Promise<Docker.Container> {
  const containerPort = containerDevPort(input.framework, input.customization);
  const subdomain = config.PREVIEW_MODE === 'subdomain';
  const exposed: Record<string, Record<string, never>> = {};
  const portBindings: Record<string, Array<{ HostIp: string; HostPort: string }>> = {};

  // Labels — base set; subdomain mode appends the Traefik routing labels.
  const labels: Record<string, string> = {
    [LABEL_MANAGED]: 'true',
    [LABEL_SESSION]: input.sessionId,
    [LABEL_USER]: input.userId,
    [LABEL_FRAMEWORK]: input.framework,
  };

  // Network attachment — subdomain mode attaches to the shared sandbox network
  // so Traefik (also on it) can reach the container by name. Localhost mode
  // keeps the default bridge and publishes a host port.
  let networkMode = 'bridge';
  let networkingConfig: { EndpointsConfig?: Record<string, Docker.EndpointsConfig> } | undefined;

  if (containerPort != null && subdomain) {
    // Subdomain: NO host port published. Stamp Traefik labels so the route
    // appears automatically and disappears on container removal.
    networkMode = config.SANDBOX_NETWORK;
    networkingConfig = {
      EndpointsConfig: { [config.SANDBOX_NETWORK]: {} },
    };
    const router = traefikRouterName(input.sessionId);
    const host = `${input.sessionId}.${config.PREVIEW_BASE_DOMAIN}`;
    Object.assign(labels, {
      'traefik.enable': 'true',
      'traefik.docker.network': config.SANDBOX_NETWORK,
      [`traefik.http.routers.${router}.rule`]: `Host(\`${host}\`)`,
      [`traefik.http.routers.${router}.entrypoints`]: config.TRAEFIK_ENTRYPOINT,
      [`traefik.http.routers.${router}.tls`]: 'true',
      [`traefik.http.routers.${router}.tls.certresolver`]: config.TRAEFIK_CERTRESOLVER,
      [`traefik.http.routers.${router}.middlewares`]: config.TRAEFIK_PREVIEW_MIDDLEWARE,
      [`traefik.http.services.${router}.loadbalancer.server.port`]: String(containerPort),
    });
  } else if (containerPort != null && input.hostPort != null) {
    // Localhost: publish container dev port to the allocated host port.
    exposed[`${containerPort}/tcp`] = {};
    portBindings[`${containerPort}/tcp`] = [
      { HostIp: '127.0.0.1', HostPort: String(input.hostPort) },
    ];
  }

  return withDockerRetry('createContainer', () =>
    getDocker().createContainer({
      name: containerName(input.sessionId),
      Image: imageTag(input.framework),
      Tty: false,
      AttachStdout: false,
      AttachStderr: false,
      Env: [
        `FRAMEWORK=${input.framework}`,
        `CUSTOMIZATION=${JSON.stringify(input.customization)}`,
        // PREVIEW_BASE_DOMAIN is only meaningful in subdomain mode — dev
        // servers (Vite, Next) read it to whitelist <uuid>.<base-domain> in
        // `allowedHosts` and to point HMR at wss://...:443 instead of the
        // in-container port.
        ...(subdomain && config.PREVIEW_BASE_DOMAIN
          ? [`PREVIEW_BASE_DOMAIN=${config.PREVIEW_BASE_DOMAIN}`]
          : []),
        // File-watcher polling — inotify on Docker volumes doesn't reliably
        // notify in-container processes when files are written via
        // `docker exec tee` (the file-sync path). Polling makes HMR / Fast
        // Refresh work for Vite (chokidar) and Next/webpack (watchpack).
        'CHOKIDAR_USEPOLLING=true',
        'CHOKIDAR_INTERVAL=200',
        'WATCHPACK_POLLING=true',
      ],
      Labels: labels,
      ExposedPorts: exposed,
      HostConfig: {
        // ---- The Phase 5 security contract — verbatim ----
        AutoRemove: false,
        Init: true,
        ReadonlyRootfs: true,
        CapDrop: ['ALL'],
        SecurityOpt: ['no-new-privileges:true'],
        PidsLimit: 256,
        // DB-enabled Node sessions run a database engine + the dev server in
        // the same container, so they get 1.5 GiB; everything else stays at the
        // 1 GiB security-budget default.
        Memory: memoryBytesFor(input.framework, input.customization),
        MemorySwap: memoryBytesFor(input.framework, input.customization), // = Memory → no swap
        NanoCpus: 1_000_000_000, // 1 CPU
        Ulimits: [{ Name: 'nofile', Soft: 1024, Hard: 2048 }],
        RestartPolicy: { Name: 'no', MaximumRetryCount: 0 },
        Binds: [`${volumeName(input.sessionId)}:/sandbox`],
        Tmpfs: {
          // /tmp and ~/.npm bumped to fit `npx shadcn@latest add ...` — npx
          // extracts the shadcn CLI + its transient deps into ~/.npm/_npx and
          // uses /tmp during tar extraction. The earlier 64m/256m limits hit
          // ENOSPC on the first component add.
          //
          // `exec` is REQUIRED on ~/.npm because npx writes the shadcn binary
          // into ~/.npm/_npx/<hash>/node_modules/.bin/ and then execs it —
          // Docker's default tmpfs flags include `noexec`, which trips a
          // "sh: shadcn: Permission denied" the moment npx tries to run it.
          // Same applies to /tmp (some installers stage bin files there).
          '/tmp': 'rw,exec,size=512m,mode=1777,nosuid,nodev',
          '/home/sandbox/.cache': 'rw,exec,size=512m,mode=0700,uid=10001,gid=10001',
          '/home/sandbox/.npm': 'rw,exec,size=1024m,mode=0700,uid=10001,gid=10001',
          // mongosh writes its history/config under ~/.mongodb; the home dir is
          // on the read-only root, so give it a small writable tmpfs.
          '/home/sandbox/.mongodb': 'rw,size=16m,mode=0700,uid=10001,gid=10001',
        },
        PortBindings: portBindings,
        NetworkMode: networkMode,
      },
      NetworkingConfig: networkingConfig,
      User: '10001:10001',
      WorkingDir: '/sandbox',
      Hostname: 'sandbox',
    }),
  );
}

export async function startContainer(c: Docker.Container): Promise<void> {
  await withDockerRetry('startContainer', () => c.start());
}

/**
 * Run a command in the container as the sandbox user, draining its output and
 * never throwing. Used for best-effort lifecycle hooks (e.g. cleanly stopping
 * an in-container database before the container itself is stopped). Bounded by
 * `timeoutMs` so a hung exec can't stall close.
 */
export async function execBestEffort(
  containerId: string,
  cmd: string[],
  timeoutMs = 20_000,
): Promise<void> {
  try {
    const c = getDocker().getContainer(containerId);
    const exec = await c.exec({
      Cmd: cmd,
      AttachStdout: true,
      AttachStderr: true,
      Tty: false,
      User: '10001:10001',
    });
    const stream = await exec.start({ hijack: true, stdin: false });
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, timeoutMs);
      const done = () => { clearTimeout(t); resolve(); };
      stream.on('end', done);
      stream.on('error', done);
      stream.resume(); // drain
    });
  } catch (err) {
    logger.warn({ err, containerId, cmd }, 'execBestEffort failed (ignored)');
  }
}

export async function stopContainer(id: string, timeoutSec = 10): Promise<void> {
  try {
    await getDocker().getContainer(id).stop({ t: timeoutSec });
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 304 || status === 404) return; // already stopped or gone
    throw err;
  }
}

export async function removeContainer(id: string, { force = true } = {}): Promise<void> {
  try {
    await getDocker().getContainer(id).remove({ force });
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode === 404) return;
    throw err;
  }
}

/**
 * Idempotent: tear down any container (live or dead) currently using the name
 * we're about to claim. Used on resume — the previous container row may have
 * been left as `exited` by the lifecycle event, and a fresh `createContainer`
 * would 409 on name conflict.
 */
export async function removeContainerByName(name: string): Promise<void> {
  await removeContainer(name).catch(() => undefined);
}

export async function volumeExists(name: string): Promise<boolean> {
  try {
    await getDocker().getVolume(name).inspect();
    return true;
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode === 404) return false;
    throw err;
  }
}

export async function inspectContainer(id: string): Promise<Docker.ContainerInspectInfo | null> {
  try {
    return await getDocker().getContainer(id).inspect();
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode === 404) return null;
    throw err;
  }
}

export async function tailLogs(id: string, lines = 200): Promise<string> {
  try {
    const buf = (await getDocker().getContainer(id).logs({
      stdout: true,
      stderr: true,
      tail: lines,
      follow: false,
      timestamps: false,
    })) as Buffer;
    // Docker multiplexes stdout/stderr with an 8-byte header per frame when
    // Tty=false. Strip the headers for human consumption.
    return demuxToString(buf);
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode === 404) return '';
    throw err;
  }
}

function demuxToString(buf: Buffer): string {
  const parts: string[] = [];
  let off = 0;
  while (off + 8 <= buf.length) {
    const size = buf.readUInt32BE(off + 4);
    const start = off + 8;
    const end = start + size;
    if (end > buf.length) break;
    parts.push(buf.subarray(start, end).toString('utf8'));
    off = end;
  }
  // Fallback: looked like a TTY stream (no headers).
  if (parts.length === 0) return buf.toString('utf8');
  return parts.join('');
}

export interface ContainerStatsSnapshot {
  cpuPct: number;
  memUsedMb: number;
  memLimitMb: number;
}

export async function snapshotStats(id: string): Promise<ContainerStatsSnapshot | null> {
  try {
    const stats = (await getDocker().getContainer(id).stats({ stream: false })) as Docker.ContainerStats;
    // CPU % per the docker stats formula
    const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
    const sysDelta =
      (stats.cpu_stats.system_cpu_usage ?? 0) - (stats.precpu_stats.system_cpu_usage ?? 0);
    const onlineCpus = stats.cpu_stats.online_cpus ?? 1;
    const cpuPct = sysDelta > 0 && cpuDelta > 0 ? (cpuDelta / sysDelta) * onlineCpus * 100 : 0;
    const memUsed = (stats.memory_stats.usage ?? 0) - (stats.memory_stats.stats?.cache ?? 0);
    const memLimit = stats.memory_stats.limit ?? 0;
    return {
      cpuPct: Math.round(cpuPct * 100) / 100,
      memUsedMb: Math.round((memUsed / (1024 * 1024)) * 100) / 100,
      memLimitMb: Math.round((memLimit / (1024 * 1024)) * 100) / 100,
    };
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode === 404) return null;
    throw err;
  }
}

/**
 * Stream container log lines. Calls onLine for each NL-delimited utf8 line
 * from stdout and stderr (de-multiplexed). Returns a cancel function.
 */
export function streamLogs(
  id: string,
  onLine: (line: string, stream: 'stdout' | 'stderr') => void,
): () => void {
  let aborted = false;
  let httpStream: NodeJS.ReadableStream | null = null;

  void (async () => {
    try {
      const stream = (await getDocker().getContainer(id).logs({
        stdout: true,
        stderr: true,
        follow: true,
        tail: 0,
        timestamps: false,
      })) as NodeJS.ReadableStream;
      if (aborted) {
        (stream as NodeJS.ReadableStream & { destroy?: () => void }).destroy?.();
        return;
      }
      httpStream = stream;
      let stdoutBuf = '';
      let stderrBuf = '';
      stream.on('data', (chunk: Buffer) => {
        // Manual demux: 8-byte header per frame: [stream_type, 0, 0, 0, size(BE 4)]
        let off = 0;
        while (off + 8 <= chunk.length) {
          const type = chunk[off];
          const size = chunk.readUInt32BE(off + 4);
          const start = off + 8;
          const end = start + size;
          if (end > chunk.length) break;
          const text = chunk.subarray(start, end).toString('utf8');
          if (type === 1) {
            stdoutBuf += text;
            stdoutBuf = drain(stdoutBuf, (l) => onLine(l, 'stdout'));
          } else if (type === 2) {
            stderrBuf += text;
            stderrBuf = drain(stderrBuf, (l) => onLine(l, 'stderr'));
          }
          off = end;
        }
      });
      stream.on('end', () => {
        if (stdoutBuf) onLine(stdoutBuf, 'stdout');
        if (stderrBuf) onLine(stderrBuf, 'stderr');
      });
      stream.on('error', (err) => {
        logger.debug({ err, id }, 'streamLogs stream error');
      });
    } catch (err) {
      logger.debug({ err, id }, 'streamLogs setup error');
    }
  })();

  return () => {
    aborted = true;
    (httpStream as (NodeJS.ReadableStream & { destroy?: () => void }) | null)?.destroy?.();
  };
}

function drain(buf: string, emit: (line: string) => void): string {
  let nl: number;
  while ((nl = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, nl);
    if (line.length > 0) emit(line);
    buf = buf.slice(nl + 1);
  }
  return buf;
}

// ---------------------------------------------------------------------------
// Daemon-wide events filtered to our managed containers.
// ---------------------------------------------------------------------------
export interface DockerEvent {
  Type: string;
  Action: string;
  Actor: {
    ID: string;
    Attributes: Record<string, string>;
  };
  time: number;
  timeNano: number;
}

export function streamEvents(onEvent: (ev: DockerEvent) => void): () => void {
  let aborted = false;
  let httpStream: NodeJS.ReadableStream | null = null;

  void (async () => {
    try {
      const stream = (await getDocker().getEvents({
        filters: { label: [`${LABEL_MANAGED}=true`], type: ['container'] },
      })) as NodeJS.ReadableStream;
      if (aborted) {
        (stream as NodeJS.ReadableStream & { destroy?: () => void }).destroy?.();
        return;
      }
      httpStream = stream;
      let buf = '';
      stream.on('data', (chunk: Buffer) => {
        buf += chunk.toString('utf8');
        let nl: number;
        while ((nl = buf.indexOf('\n')) !== -1) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          try {
            onEvent(JSON.parse(line) as DockerEvent);
          } catch (err) {
            logger.warn({ err, line }, 'failed to parse docker event line');
          }
        }
      });
      stream.on('error', (err) => {
        logger.warn({ err }, 'docker events stream error');
      });
      stream.on('end', () => {
        logger.warn('docker events stream ended');
      });
    } catch (err) {
      logger.error({ err }, 'failed to subscribe to docker events');
    }
  })();

  return () => {
    aborted = true;
    (httpStream as (NodeJS.ReadableStream & { destroy?: () => void }) | null)?.destroy?.();
  };
}
