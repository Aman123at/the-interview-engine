"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ChevronLeft,
  Cpu,
  HardDrive,
  MemoryStick,
  RefreshCw,
  TerminalSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { api, ApiError } from "@/lib/api";
import type {
  AdminInspectSessionResponse,
  Session,
  SessionEvent,
  SessionStatus,
} from "@/contracts";

interface PageProps {
  params: Promise<{ id: string }>;
}

const REFRESH_MS = 5000;

/**
 * View-model the inspect page renders. Derived from
 * `AdminInspectSessionResponse.container` + `.stats` — the contract types
 * those as partial / unknown, so projection happens here at the boundary.
 */
interface ContainerView {
  running?: boolean;
  exitCode?: number | null;
  oomKilled?: boolean;
  cpuPercent?: number;
  memBytes?: number;
  memLimitBytes?: number;
}

function projectContainer(
  inspect: AdminInspectSessionResponse,
): ContainerView | null {
  if (!inspect.container && !inspect.stats) return null;
  const c = (inspect.container ?? {}) as Record<string, unknown>;
  const s = (inspect.stats ?? {}) as Record<string, unknown>;
  const cpuPercent =
    typeof s.cpuPercent === "number" ? s.cpuPercent : undefined;
  const memBytes = typeof s.memBytes === "number" ? s.memBytes : undefined;
  const memLimitBytes =
    typeof s.memLimitBytes === "number" ? s.memLimitBytes : undefined;
  return {
    running: typeof c.running === "boolean" ? c.running : undefined,
    exitCode: typeof c.exitCode === "number" ? c.exitCode : null,
    oomKilled: typeof c.oomKilled === "boolean" ? c.oomKilled : undefined,
    cpuPercent,
    memBytes,
    memLimitBytes,
  };
}

export default function AdminSessionInspectPage({ params }: PageProps) {
  const { id: sessionId } = use(params);

  const [session, setSession] = useState<Session | null>(null);
  const [container, setContainer] = useState<ContainerView | null>(null);
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const inspect = await api.admin.getInspect(sessionId);
      setSession(inspect.session);
      setContainer(projectContainer(inspect));
      setEvents(inspect.events ?? []);
      setLogs(splitLogLines(inspect.logs));
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        setError("You don't have permission to inspect this session.");
      } else if (e instanceof ApiError && e.status === 404) {
        setError("Session not found.");
      } else {
        setError(e instanceof Error ? e.message : "Couldn't load session.");
      }
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    // Fetch-on-mount; setState happens inside the awaited refresh.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!autoRefresh) {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
      refreshTimer.current = null;
      return;
    }
    refreshTimer.current = setInterval(() => {
      void refresh();
    }, REFRESH_MS);
    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
    };
  }, [autoRefresh, refresh]);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-8">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/dashboard"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          Back to dashboard
        </Link>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh((v) => !v)}
          >
            <RefreshCw
              className={cn("mr-1.5 h-3.5 w-3.5", autoRefresh && "animate-spin")}
              aria-hidden
            />
            {autoRefresh ? "Auto-refresh on" : "Auto-refresh off"}
          </Button>
          <Button size="sm" onClick={() => void refresh()}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Refresh now
          </Button>
        </div>
      </div>

      <header className="space-y-1">
        <p className="text-muted-foreground font-mono text-[10px] uppercase tracking-wider">
          admin · inspect
        </p>
        <h1 className="text-foreground text-2xl font-semibold tracking-tight">
          Session{" "}
          <code className="font-mono text-base">{sessionId.slice(0, 8)}</code>
        </h1>
      </header>

      {error ? (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/10 flex items-start gap-2 rounded-md border px-3 py-2 text-xs"
        >
          <AlertTriangle
            className="text-destructive mt-0.5 h-3.5 w-3.5 shrink-0"
            aria-hidden
          />
          <span className="text-foreground">{error}</span>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Session</CardTitle>
            <CardDescription>Persistent state</CardDescription>
          </CardHeader>
          <CardContent>
            {loading && !session ? (
              <Skeleton className="h-32 w-full" />
            ) : session ? (
              <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-xs">
                <Field label="Status">
                  <StatusBadge status={session.status} />
                </Field>
                <Field label="Framework">
                  <code className="font-mono">{session.framework}</code>
                </Field>
                <Field label="Host port">
                  <code className="font-mono">
                    {session.hostPreviewPort ?? "—"}
                  </code>
                </Field>
                <Field label="Container">
                  <code className="text-muted-foreground font-mono">
                    {session.containerId
                      ? `${session.containerId.slice(0, 12)}…`
                      : "—"}
                  </code>
                </Field>
                <Field label="Volume">
                  <code className="text-muted-foreground font-mono break-all">
                    {session.volumeName ?? "—"}
                  </code>
                </Field>
                <Field label="Created">
                  <span className="text-muted-foreground">
                    {fmtTime(session.createdAt)}
                  </span>
                </Field>
                {session.endedAt ? (
                  <Field label="Ended">
                    <span className="text-muted-foreground">
                      {fmtTime(session.endedAt)}
                    </span>
                  </Field>
                ) : null}
              </dl>
            ) : (
              <p className="text-muted-foreground text-xs">No session loaded.</p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Container</CardTitle>
            <CardDescription>Live Docker stats</CardDescription>
          </CardHeader>
          <CardContent>
            {loading && !container ? (
              <Skeleton className="h-32 w-full" />
            ) : container ? (
              <div className="grid grid-cols-2 gap-4 text-xs md:grid-cols-4">
                <Stat
                  icon={
                    <Cpu
                      className="text-muted-foreground h-3.5 w-3.5"
                      aria-hidden
                    />
                  }
                  label="CPU"
                  value={
                    typeof container.cpuPercent === "number"
                      ? `${container.cpuPercent.toFixed(1)}%`
                      : "—"
                  }
                />
                <Stat
                  icon={
                    <MemoryStick
                      className="text-muted-foreground h-3.5 w-3.5"
                      aria-hidden
                    />
                  }
                  label="Memory"
                  value={memValue(container)}
                />
                <Stat
                  icon={
                    <HardDrive
                      className="text-muted-foreground h-3.5 w-3.5"
                      aria-hidden
                    />
                  }
                  label="Running"
                  value={container.running ? "yes" : "no"}
                />
                <Stat
                  icon={
                    <TerminalSquare
                      className="text-muted-foreground h-3.5 w-3.5"
                      aria-hidden
                    />
                  }
                  label="Exit code"
                  value={
                    container.exitCode === null ||
                    container.exitCode === undefined
                      ? "—"
                      : String(container.exitCode)
                  }
                  tone={
                    typeof container.exitCode === "number" &&
                    container.exitCode !== 0
                      ? "danger"
                      : undefined
                  }
                />
                {container.oomKilled ? (
                  <div className="col-span-full">
                    <span className="border-destructive/40 bg-destructive/15 text-destructive inline-flex items-center gap-1 rounded-md border px-2 py-1 font-mono text-[11px]">
                      <AlertTriangle className="h-3 w-3" aria-hidden />
                      OOM-killed
                    </span>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-muted-foreground text-xs">
                Container is gone. Session likely closed or recoverable.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lifecycle events</CardTitle>
          <CardDescription>
            Most recent first · from <code className="font-mono">session_events</code>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && events.length === 0 ? (
            <Skeleton className="h-40 w-full" />
          ) : events.length === 0 ? (
            <p className="text-muted-foreground text-xs">No events yet.</p>
          ) : (
            <ol className="m-0 flex flex-col gap-1 p-0">
              {events.slice().reverse().map((e) => (
                <li
                  key={e.id}
                  className="border-border/40 grid grid-cols-[10rem_8rem_1fr] gap-3 border-b py-1.5 text-[11px]"
                >
                  <span className="text-muted-foreground font-mono">
                    {fmtTime(e.createdAt)}
                  </span>
                  <span
                    className={cn(
                      "font-mono",
                      e.level === "error"
                        ? "text-destructive"
                        : e.level === "warn"
                          ? "text-yellow-300"
                          : "text-foreground",
                    )}
                  >
                    {e.type}
                  </span>
                  <span className="text-muted-foreground truncate font-mono">
                    {summarizePayload(e.payload)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Container logs</CardTitle>
          <CardDescription>Tail · contract bundle response</CardDescription>
        </CardHeader>
        <CardContent>
          {loading && logs.length === 0 ? (
            <Skeleton className="h-40 w-full" />
          ) : logs.length === 0 ? (
            <p className="text-muted-foreground text-xs">No logs.</p>
          ) : (
            <pre className="border-border/40 bg-editor-surface text-editor-surface-foreground max-h-[24rem] overflow-auto rounded-md border p-3 font-mono text-[11px] leading-relaxed">
              {logs.join("\n")}
            </pre>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <dt className="text-muted-foreground font-mono text-[10px] uppercase tracking-wider">
        {label}
      </dt>
      <dd className="text-foreground">{children}</dd>
    </>
  );
}

function Stat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "danger";
}) {
  return (
    <div className="border-border/40 bg-card/40 flex flex-col gap-1 rounded-md border p-3">
      <span className="text-muted-foreground inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider">
        {icon}
        {label}
      </span>
      <span
        className={cn(
          "font-mono",
          tone === "danger" ? "text-destructive" : "text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function StatusBadge({ status }: { status: SessionStatus }) {
  const tone =
    status === "ended"
      ? "muted"
      : status === "running"
        ? "good"
        : status === "saving"
          ? "warn"
          : status === "recoverable"
            ? "warn"
            : "muted";
  return (
    <span
      className={cn(
        "rounded-md border px-1.5 py-0.5 font-mono text-[10px] uppercase",
        tone === "good" &&
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
        tone === "warn" &&
          "border-yellow-500/30 bg-yellow-500/10 text-yellow-200",
        tone === "muted" && "border-border/60 bg-muted/40 text-muted-foreground",
      )}
    >
      {status}
    </span>
  );
}

function fmtTime(iso: Date | string | undefined | null): string {
  if (!iso) return "—";
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toISOString().replace("T", " ").slice(0, 19);
}

function splitLogLines(logs: string | undefined): string[] {
  if (!logs) return [];
  return logs.split(/\r?\n/);
}

function memValue(c: ContainerView): string {
  if (typeof c.memBytes !== "number") return "—";
  const used = formatBytes(c.memBytes);
  if (typeof c.memLimitBytes === "number" && c.memLimitBytes > 0) {
    return `${used} / ${formatBytes(c.memLimitBytes)}`;
  }
  return used;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function summarizePayload(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const entries = Object.entries(payload as Record<string, unknown>).slice(0, 6);
  return entries
    .map(([k, v]) => {
      const s =
        typeof v === "string"
          ? v.length > 32
            ? `${v.slice(0, 32)}…`
            : v
          : typeof v === "number" || typeof v === "boolean"
            ? String(v)
            : Array.isArray(v)
              ? `[${v.length}]`
              : "{…}";
      return `${k}=${s}`;
    })
    .join(" ");
}
