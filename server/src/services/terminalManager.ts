/**
 * Per-session terminal tab manager.
 *
 * Each "tab" is a `docker exec` with Tty:true inside the session container —
 * Docker creates the real PTY in the container, we just shuttle bytes.
 *
 * Ring buffer per PTY (~64 KiB by default) lets a reconnecting client replay
 * what it missed without us replaying minutes of build output. The PTY
 * itself survives socket disconnects so the candidate's shell state is
 * preserved across short network blips.
 */
import type { Duplex } from 'node:stream';
import { getDocker } from './containerService.js';
import type { ShellKind } from './dbShell.js';
import { logger } from '@/utils/logger.js';

const DEFAULT_RING_BYTES = 64 * 1024;

interface TabEntry {
  tabId: string;
  sessionId: string;
  containerId: string;
  /** Shell kind — `shell` (bash) or a DB shell (`psql`/`mongosh`). */
  kind: ShellKind;
  /** Human-readable tab label (e.g. "postgres"). */
  label: string;
  cols: number;
  rows: number;
  stream: Duplex;
  exec: { resize: (opts: { h: number; w: number }) => Promise<unknown>; inspect: () => Promise<{ Running?: boolean; ExitCode?: number | null }> };
  ring: { bufs: Buffer[]; bytes: number; max: number };
  /** Set of socket ids subscribed to this tab's output stream. */
  subscribers: Set<string>;
  onData: (chunk: Buffer) => void;
  onClose: (code: number | null) => void;
}

const tabs = new Map<string, TabEntry>(); // tabId → entry

function ringPush(ring: TabEntry['ring'], chunk: Buffer): void {
  ring.bufs.push(chunk);
  ring.bytes += chunk.length;
  while (ring.bytes > ring.max && ring.bufs.length > 0) {
    const head = ring.bufs.shift()!;
    ring.bytes -= head.length;
  }
}

function ringSnapshot(ring: TabEntry['ring']): Buffer {
  return Buffer.concat(ring.bufs, ring.bytes);
}

// ---------------------------------------------------------------------------

export interface OpenTabOptions {
  sessionId: string;
  containerId: string;
  cols?: number;
  rows?: number;
  /** Optional command override. Defaults to bash. */
  cmd?: string[];
  /** Shell kind — drives the default command + the tab label. */
  kind?: ShellKind;
  /** Human-readable tab label. */
  label?: string;
}

export interface OpenTabHandlers {
  onData: (chunk: Buffer) => void;
  onClose: (exitCode: number | null) => void;
}

export const terminalManager = {
  async openTab(opts: OpenTabOptions, handlers: OpenTabHandlers): Promise<string> {
    const tabId = `tab_${Math.random().toString(36).slice(2, 10)}`;
    const cmd = opts.cmd ?? ['/bin/bash'];
    const kind: ShellKind = opts.kind ?? 'shell';
    const label = opts.label ?? 'shell';
    const cols = opts.cols ?? 80;
    const rows = opts.rows ?? 24;

    const container = getDocker().getContainer(opts.containerId);
    const exec = await container.exec({
      Cmd: cmd,
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
      User: '10001:10001',
      WorkingDir: '/sandbox',
      Env: ['TERM=xterm-256color', 'LANG=C.UTF-8'],
      ConsoleSize: [rows, cols],
    });

    const stream = (await exec.start({ hijack: true, stdin: true, Tty: true })) as Duplex;

    const ring = { bufs: [] as Buffer[], bytes: 0, max: DEFAULT_RING_BYTES };

    const entry: TabEntry = {
      tabId,
      sessionId: opts.sessionId,
      containerId: opts.containerId,
      kind,
      label,
      cols,
      rows,
      stream,
      exec: exec as unknown as TabEntry['exec'],
      ring,
      subscribers: new Set(),
      onData: handlers.onData,
      onClose: handlers.onClose,
    };
    tabs.set(tabId, entry);

    stream.on('data', (chunk: Buffer) => {
      ringPush(ring, chunk);
      try {
        entry.onData(chunk);
      } catch (err) {
        logger.debug({ err, tabId }, 'tab onData handler threw');
      }
    });
    stream.on('end', async () => {
      let code: number | null = null;
      try {
        const info = await entry.exec.inspect();
        code = info.ExitCode ?? null;
      } catch {
        // ignore
      }
      try {
        entry.onClose(code);
      } catch (err) {
        logger.debug({ err, tabId }, 'tab onClose handler threw');
      }
      tabs.delete(tabId);
    });
    stream.on('error', (err) => {
      logger.debug({ err, tabId }, 'tab stream error');
    });

    return tabId;
  },

  /**
   * Replace the handlers — called on reconnect when the SAME tab is being
   * re-subscribed by a new socket. Returns the ring buffer snapshot so the
   * caller can replay missed output.
   */
  reattach(
    tabId: string,
    handlers: OpenTabHandlers,
  ): { backlog: Buffer; cols: number; rows: number; kind: ShellKind; label: string } | null {
    const t = tabs.get(tabId);
    if (!t) return null;
    t.onData = handlers.onData;
    t.onClose = handlers.onClose;
    return { backlog: ringSnapshot(t.ring), cols: t.cols, rows: t.rows, kind: t.kind, label: t.label };
  },

  write(tabId: string, data: string | Buffer): boolean {
    const t = tabs.get(tabId);
    if (!t) return false;
    return t.stream.write(typeof data === 'string' ? Buffer.from(data, 'utf8') : data);
  },

  async resize(tabId: string, cols: number, rows: number): Promise<boolean> {
    const t = tabs.get(tabId);
    if (!t) return false;
    t.cols = cols;
    t.rows = rows;
    try {
      await t.exec.resize({ h: rows, w: cols });
      return true;
    } catch (err) {
      logger.debug({ err, tabId }, 'tab resize failed');
      return false;
    }
  },

  /** Forcefully tear down a tab — closes the exec stream. */
  async close(tabId: string): Promise<void> {
    const t = tabs.get(tabId);
    if (!t) return;
    try {
      // Send Ctrl-D / EOF so bash exits cleanly, then end the stream.
      t.stream.write('\x04');
      t.stream.end();
    } catch {
      // ignore
    }
    tabs.delete(tabId);
  },

  /** Close all tabs belonging to a session — used on session close. */
  async closeAllForSession(sessionId: string): Promise<void> {
    const toClose = [...tabs.values()].filter((t) => t.sessionId === sessionId);
    await Promise.all(toClose.map((t) => this.close(t.tabId)));
  },

  listTabsForSession(
    sessionId: string,
  ): Array<{ tabId: string; cols: number; rows: number; kind: ShellKind; label: string }> {
    return [...tabs.values()]
      .filter((t) => t.sessionId === sessionId)
      .map((t) => ({ tabId: t.tabId, cols: t.cols, rows: t.rows, kind: t.kind, label: t.label }));
  },
};
