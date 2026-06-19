"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Database, Plus, X } from "lucide-react";
import "@xterm/xterm/css/xterm.css";
import { Terminal, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SessionSocket } from "@/lib/socket";
import type {
  ShellKind,
  TermDataPayload,
  TermExitPayload,
} from "@/types/session";
import type { ClientToServerEvents } from "@/contracts";

// Acks for term:open and term:reattach come from the contract's
// ClientToServerEvents map.
type TermOpenAck = NonNullable<
  Parameters<Parameters<ClientToServerEvents["term:open"]>[1]>[0]
> extends infer R
  ? Extract<R, { tabId: string }>
  : never;

type TermReattachAck = Extract<
  Parameters<Parameters<ClientToServerEvents["term:reattach"]>[1]>[0],
  { backlog: string }
>;

interface TerminalPaneProps {
  socket: SessionSocket;
  /** When set, auto-open a DB shell tab of this kind + offer to reopen it. */
  dbShell?: "psql" | "mongosh" | "mysql" | null;
  /** Read-only mode — interviewer while a candidate edits. Disables input,
   * new-tab, close, and the DB-shell button (server enforces it too). */
  readOnly?: boolean;
}

interface TabState {
  /** Local key (stable across reconnects). */
  key: string;
  /** Server tab id; null until "term:open" acks. */
  tabId: string | null;
  /** Shell kind — drives the spawn command + the tab title. */
  kind: ShellKind;
  title: string;
  /** Local buffer kept for hot-mount replay (e.g. switching tabs). */
  buffer: string;
}

function titleForKind(kind: ShellKind): string {
  if (kind === "psql") return "postgres";
  if (kind === "mongosh") return "mongo";
  if (kind === "mysql") return "mysql";
  return "shell";
}

let tabCounter = 0;
function nextTabKey(): string {
  tabCounter += 1;
  return `t${tabCounter}`;
}

export function TerminalPane({ socket, dbShell, readOnly = false }: TerminalPaneProps) {
  const [tabs, setTabs] = useState<TabState[]>(() => [
    { key: nextTabKey(), tabId: null, kind: "shell", title: "shell", buffer: "" },
  ]);
  const [activeKey, setActiveKey] = useState<string>(() => tabs[0].key);

  const updateTab = useCallback(
    (key: string, patch: Partial<TabState>) =>
      setTabs((prev) =>
        prev.map((t) => (t.key === key ? { ...t, ...patch } : t)),
      ),
    [],
  );

  const addTab = useCallback((kind: ShellKind = "shell") => {
    const t: TabState = {
      key: nextTabKey(),
      tabId: null,
      kind,
      title: titleForKind(kind),
      buffer: "",
    };
    setTabs((prev) => [...prev, t]);
    setActiveKey(t.key);
  }, []);

  // Auto-open the DB shell tab ONCE when the session has a database. If the
  // candidate later closes it, we don't reopen automatically — the "DB shell"
  // button in the tab bar lets them bring it back.
  const didAutoOpenDbRef = useRef(false);
  useEffect(() => {
    if (readOnly || !dbShell || didAutoOpenDbRef.current) return;
    didAutoOpenDbRef.current = true;
    addTab(dbShell);
  }, [dbShell, addTab, readOnly]);

  const hasDbTab = dbShell ? tabs.some((t) => t.kind === dbShell) : false;

  const closeTab = useCallback(
    (key: string) => {
      const tab = tabs.find((t) => t.key === key);
      if (tab?.tabId) {
        // Acked close — fire-and-forget the ack (we don't care about the result).
        void socket.emitAck("term:close", { tabId: tab.tabId }).catch(() => {});
      }
      setTabs((prev) => {
        const next = prev.filter((t) => t.key !== key);
        if (next.length === 0) {
          const fresh: TabState = {
            key: nextTabKey(),
            tabId: null,
            kind: "shell",
            title: "shell",
            buffer: "",
          };
          setActiveKey(fresh.key);
          return [fresh];
        }
        if (activeKey === key) setActiveKey(next[next.length - 1].key);
        return next;
      });
    },
    [socket, tabs, activeKey],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className="border-border/60 flex shrink-0 items-center gap-0.5 overflow-x-auto border-b pr-1"
        role="tablist"
      >
        {tabs.map((t, i) => (
          <div
            key={t.key}
            role="tab"
            aria-selected={t.key === activeKey}
            className={cn(
              "border-border/60 flex shrink-0 items-center gap-1.5 border-r px-2.5 py-1 text-xs transition-colors",
              t.key === activeKey
                ? "bg-background text-foreground"
                : "text-muted-foreground hover:bg-accent/30 hover:text-foreground",
            )}
          >
            <button
              type="button"
              onClick={() => setActiveKey(t.key)}
              className="flex items-center gap-1 outline-none"
            >
              {t.kind !== "shell" ? (
                <Database className="h-3 w-3 opacity-70" aria-hidden />
              ) : null}
              {t.title} {i + 1}
            </button>
            {!readOnly ? (
              <Button
                variant="ghost"
                size="icon-sm"
                className="h-4 w-4 opacity-60 hover:opacity-100"
                aria-label="Close terminal"
                onClick={() => closeTab(t.key)}
              >
                <X className="h-3 w-3" />
              </Button>
            ) : null}
          </div>
        ))}
        <div className="ml-auto flex items-center gap-0.5">
          {!readOnly && dbShell && !hasDbTab ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-2 text-xs"
              aria-label={`Open ${titleForKind(dbShell)} shell`}
              title={`Reopen the ${titleForKind(dbShell)} shell`}
              onClick={() => addTab(dbShell)}
            >
              <Database className="h-3.5 w-3.5" />
              {titleForKind(dbShell)} shell
            </Button>
          ) : null}
          {!readOnly ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="New terminal"
              onClick={() => addTab("shell")}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {tabs.map((t) => (
          <TerminalInstance
            key={t.key}
            tab={t}
            visible={t.key === activeKey}
            socket={socket}
            readOnly={readOnly}
            onUpdate={(patch) => updateTab(t.key, patch)}
          />
        ))}
      </div>
    </div>
  );
}

interface TerminalInstanceProps {
  tab: TabState;
  visible: boolean;
  socket: SessionSocket;
  readOnly: boolean;
  onUpdate: (patch: Partial<TabState>) => void;
}

/** xterm theme objects — kept here so the Terminal-boot + theme-swap effects
 *  share one source of truth. ANSI palette is the standard "Tango-ish" set
 *  used by most VS Code defaults; bg/fg follow the IDE-surface CSS vars. */
const XTERM_DARK: ITheme = {
  background: "#161620",
  foreground: "#e6e6e6",
  cursor: "#e6e6e6",
  cursorAccent: "#161620",
  selectionBackground: "#3a3a4a",
};
const XTERM_LIGHT: ITheme = {
  background: "#fafafb",
  foreground: "#1a1a1f",
  cursor: "#1a1a1f",
  cursorAccent: "#fafafb",
  selectionBackground: "#cfd8e3",
};

const TerminalInstance = memo(function TerminalInstance({
  tab,
  visible,
  socket,
  readOnly,
  onUpdate,
}: TerminalInstanceProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const tabIdRef = useRef<string | null>(tab.tabId);
  const bufferRef = useRef<string>(tab.buffer);
  const { resolvedTheme } = useTheme();
  const xtermTheme = resolvedTheme === "light" ? XTERM_LIGHT : XTERM_DARK;
  // Keep the latest readOnly in a ref so the once-only xterm boot effect reads
  // the current value without re-running; sync xterm's stdin lock on change.
  const readOnlyRef = useRef(readOnly);
  useEffect(() => {
    readOnlyRef.current = readOnly;
    if (termRef.current) termRef.current.options.disableStdin = readOnly;
  }, [readOnly]);

  // Keep the tabId ref aligned with the latest prop without touching it
  // during render.
  useEffect(() => {
    tabIdRef.current = tab.tabId;
  }, [tab.tabId]);

  // Reactively swap xterm's theme on app theme change — xterm exposes
  // `term.options.theme` as a setter that re-applies the palette.
  useEffect(() => {
    if (termRef.current) termRef.current.options.theme = xtermTheme;
  }, [xtermTheme]);

  // Boot xterm once.
  useEffect(() => {
    if (!hostRef.current || termRef.current) return;
    const term = new Terminal({
      cursorBlink: true,
      fontFamily:
        "var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: 12,
      // Theme is applied imperatively in a follow-up effect that tracks
      // next-themes — the once-only boot uses a sensible default that
      // matches the first paint.
      theme: xtermTheme,
      convertEol: true,
      scrollback: 5000,
      disableStdin: readOnlyRef.current,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(hostRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    // Replay any prior output (tab-switch case).
    if (bufferRef.current) term.write(bufferRef.current);

    const onData = term.onData((data) => {
      const tabId = tabIdRef.current;
      if (!tabId || readOnlyRef.current) return; // read-only: swallow input
      // Fire-and-forget input — server contract is `term:write { tabId, data }`.
      socket.emit("term:write", { tabId, data });
    });

    return () => {
      onData.dispose();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Open the tab on mount (or after reconnect when tabId is null).
  useEffect(() => {
    let cancelled = false;
    async function ensureChannel() {
      // Read-only observers don't spawn PTYs (server would refuse anyway). When
      // the candidate leaves and readOnly flips false, this effect re-runs and
      // opens the shell.
      if (tabIdRef.current || readOnly) return;
      try {
        const ack = (await socket.emitAck("term:open", {
          cols: termRef.current?.cols ?? 80,
          rows: termRef.current?.rows ?? 24,
          kind: tab.kind,
        })) as TermOpenAck | { ok: false; error?: { message?: string } };
        if (cancelled) return;
        if (ack && typeof ack === "object" && "tabId" in ack && ack.tabId) {
          tabIdRef.current = ack.tabId;
          onUpdate({ tabId: ack.tabId, title: ack.label });
        } else {
          console.warn("[term] term:open failed", ack);
        }
      } catch (e) {
        console.warn("[term] term:open threw", e);
      }
    }
    void ensureChannel();
    return () => {
      cancelled = true;
    };
  }, [socket, onUpdate, tab.kind, readOnly]);

  // Subscribe to term:data — filter by our tabId.
  useEffect(() => {
    function handler(payload: TermDataPayload) {
      const tabId = tabIdRef.current;
      if (!tabId || payload.tabId !== tabId) return;
      bufferRef.current = (bufferRef.current + payload.data).slice(-200_000);
      onUpdate({ buffer: bufferRef.current });
      termRef.current?.write(payload.data);
    }
    socket.socket.on("term:data", handler);
    return () => {
      socket.socket.off("term:data", handler);
    };
  }, [socket, onUpdate]);

  // Surface exit codes inline so the user knows the shell died.
  useEffect(() => {
    function handler(payload: TermExitPayload) {
      const tabId = tabIdRef.current;
      if (!tabId || payload.tabId !== tabId) return;
      const line = `\r\n[process exited with code ${payload.exitCode}]\r\n`;
      bufferRef.current = (bufferRef.current + line).slice(-200_000);
      termRef.current?.write(line);
    }
    socket.socket.on("term:exit", handler);
    return () => {
      socket.socket.off("term:exit", handler);
    };
  }, [socket]);

  // On reconnect, reattach to our server-side tab and replay the backlog.
  useEffect(() => {
    async function onReconnect() {
      const tabId = tabIdRef.current;
      if (!tabId) return;
      try {
        const ack = (await socket.emitAck("term:reattach", { tabId })) as
          | TermReattachAck
          | { ok: false; error?: { message?: string } };
        if (ack && typeof ack === "object" && "backlog" in ack) {
          // Server-side connectionStateRecovery may have already replayed
          // newer `term:data` events; this gives us the full backlog as a
          // baseline so we can recover from longer outages.
          termRef.current?.clear();
          bufferRef.current = ack.backlog;
          termRef.current?.write(ack.backlog);
          onUpdate({ buffer: bufferRef.current });
        }
      } catch (e) {
        console.warn("[term] term:reattach threw", e);
      }
    }
    socket.socket.on("connect", onReconnect);
    return () => {
      socket.socket.off("connect", onReconnect);
    };
  }, [socket, onUpdate]);

  // Re-fit on visibility / window resize.
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => {
      try {
        fitRef.current?.fit();
        const tabId = tabIdRef.current;
        const term = termRef.current;
        if (tabId && term) {
          socket.emit("term:resize", {
            tabId,
            cols: term.cols,
            rows: term.rows,
          });
        }
      } catch {
        /* ignore */
      }
    }, 0);
    return () => clearTimeout(t);
  }, [visible, socket]);

  useEffect(() => {
    function onResize() {
      try {
        fitRef.current?.fit();
        const tabId = tabIdRef.current;
        const term = termRef.current;
        if (tabId && term) {
          socket.emit("term:resize", {
            tabId,
            cols: term.cols,
            rows: term.rows,
          });
        }
      } catch {
        /* ignore */
      }
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [socket]);

  return (
    <div
      ref={hostRef}
      className={cn("h-full w-full bg-editor-surface", visible ? "block" : "hidden")}
    />
  );
});
