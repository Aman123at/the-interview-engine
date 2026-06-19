"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { setupMonaco } from "@/lib/monaco-setup";
import { useMonacoTheme } from "@/lib/hooks/use-monaco-theme";
import type { ApiResponse } from "@/types/api-client";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="text-muted-foreground flex h-full items-center justify-center text-xs">
      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
      Loading viewer…
    </div>
  ),
});

const TABS = ["pretty", "raw", "headers"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  pretty: "Pretty",
  raw: "Raw",
  headers: "Headers",
};

interface ResponseViewerProps {
  response: ApiResponse | null;
  sending: boolean;
}

export function ResponseViewer({ response, sending }: ResponseViewerProps) {
  const [tab, setTab] = useState<Tab>("pretty");

  if (sending) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center text-xs">
        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
        Sending request…
      </div>
    );
  }
  if (!response) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center px-6 text-center text-xs">
        Hit <kbd className="border-border/60 bg-muted/40 mx-1 rounded border px-1 py-0.5 text-[10px]">Send</kbd> to see the response here.
      </div>
    );
  }

  const inferredLang = response.json !== undefined ? "json" : guessLang(response);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-border/60 flex shrink-0 items-center gap-3 border-b px-3 py-1.5 text-[11px]">
        <StatusBadge response={response} />
        <Meta label="Time" value={`${response.timeMs} ms`} />
        <Meta label="Size" value={formatBytes(response.sizeBytes)} />
        {response.networkError ? (
          <span className="text-destructive ml-auto flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" aria-hidden />
            <span className="truncate">{response.networkError.message}</span>
          </span>
        ) : null}
      </div>
      <div
        role="tablist"
        className="border-border/60 flex shrink-0 items-center gap-0.5 border-b px-2 py-1"
      >
        {TABS.map((t) => {
          const active = tab === t;
          return (
            <button
              key={t}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "rounded-md px-2 py-0.5 text-[11px] transition-colors",
                active
                  ? "bg-accent/60 text-foreground"
                  : "text-muted-foreground hover:bg-accent/30 hover:text-foreground",
              )}
            >
              {TAB_LABELS[t]}
            </button>
          );
        })}
      </div>
      <div className="min-h-0 flex-1">
        {tab === "headers" ? (
          <HeadersTab response={response} />
        ) : tab === "raw" ? (
          <BodyViewer language="plaintext" value={response.body} />
        ) : (
          <PrettyTab response={response} fallbackLang={inferredLang} />
        )}
      </div>
    </div>
  );
}

function PrettyTab({
  response,
  fallbackLang,
}: {
  response: ApiResponse;
  fallbackLang: string;
}) {
  const value = useMemo(() => {
    if (response.json !== undefined) {
      try {
        return JSON.stringify(response.json, null, 2);
      } catch {
        return response.body;
      }
    }
    return response.body;
  }, [response]);
  const language = response.json !== undefined ? "json" : fallbackLang;
  return <BodyViewer value={value} language={language} />;
}

function HeadersTab({ response }: { response: ApiResponse }) {
  if (response.headers.length === 0) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center text-xs">
        No response headers.
      </div>
    );
  }
  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-left text-[11px]">
        <thead className="text-muted-foreground bg-muted/30 border-border/60 sticky top-0 border-b">
          <tr>
            <th className="px-3 py-1 font-mono text-[10px] font-medium uppercase tracking-wider">
              Name
            </th>
            <th className="px-3 py-1 font-mono text-[10px] font-medium uppercase tracking-wider">
              Value
            </th>
          </tr>
        </thead>
        <tbody>
          {response.headers.map((h) => (
            <tr key={`${h.name}:${h.value}`} className="border-border/40 border-b">
              <td className="text-muted-foreground px-3 py-1 align-top font-mono">
                {h.name}
              </td>
              <td className="text-foreground px-3 py-1 break-all font-mono">
                {h.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BodyViewer({ value, language }: { value: string; language: string }) {
  const theme = useMonacoTheme();
  return (
    <MonacoEditor
      language={language}
      theme={theme}
      value={value}
      beforeMount={setupMonaco}
      options={{
        readOnly: true,
        automaticLayout: true,
        minimap: { enabled: false },
        fontSize: 12,
        fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
        scrollBeyondLastLine: false,
        renderLineHighlight: "line",
        tabSize: 2,
        wordWrap: "on",
        lineNumbers: "off",
        contextmenu: false,
      }}
    />
  );
}

function StatusBadge({ response }: { response: ApiResponse }) {
  const tone =
    response.status === 0
      ? "danger"
      : response.status >= 500
        ? "danger"
        : response.status >= 400
          ? "warn"
          : response.ok
            ? "good"
            : "muted";
  return (
    <span
      className={cn(
        "rounded-md border px-1.5 py-0.5 font-mono text-[10px] uppercase",
        tone === "good" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
        tone === "warn" && "border-yellow-500/30 bg-yellow-500/10 text-yellow-200",
        tone === "danger" && "border-destructive/40 bg-destructive/10 text-destructive",
        tone === "muted" && "border-border/60 bg-muted/40 text-muted-foreground",
      )}
    >
      {response.status === 0
        ? "ERR"
        : `${response.status} ${response.statusText || ""}`.trim()}
    </span>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <span className="text-muted-foreground inline-flex items-baseline gap-1">
      <span className="text-[10px] uppercase tracking-wider">{label}</span>
      <span className="text-foreground font-mono">{value}</span>
    </span>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function guessLang(response: ApiResponse): string {
  const ct = response.headers.find((h) => h.name.toLowerCase() === "content-type")
    ?.value ?? "";
  if (ct.includes("json")) return "json";
  if (ct.includes("html")) return "html";
  if (ct.includes("xml")) return "xml";
  if (ct.includes("css")) return "css";
  if (ct.includes("javascript")) return "javascript";
  return "plaintext";
}
