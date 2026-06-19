"use client";

import { useState } from "react";
import { History, Loader2, Send, ServerCog } from "lucide-react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useApiClient } from "@/lib/hooks/use-api-client";
import { METHODS_WITH_BODY, type HttpMethod } from "@/types/api-client";
import type { PreviewInfo } from "@/types/session";
import { KvEditor } from "./kv-editor";
import { BodyEditor } from "./body-editor";
import { ResponseViewer } from "./response-viewer";
import { HistoryList } from "./history-list";

const METHODS: HttpMethod[] = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
];

type RequestTab = "params" | "headers" | "body";

interface ApiClientPaneProps {
  preview: PreviewInfo;
  /** Current session id — lets container requests proxy through the server. */
  sessionId: string;
  /** Read-only mode (interviewer while a candidate edits) — disables Send. */
  readOnly?: boolean;
  /** Candidate share token — routes the proxy through the public endpoint. */
  shareToken?: string;
}

export function ApiClientPane({ preview, sessionId, readOnly = false, shareToken }: ApiClientPaneProps) {
  const containerBase = containerBaseUrl(preview);
  const client = useApiClient({ sessionId, containerOrigin: containerBase, shareToken });
  const [tab, setTab] = useState<RequestTab>("params");
  const [historyOpen, setHistoryOpen] = useState(false);
  const hasBody = METHODS_WITH_BODY.has(client.request.method);

  return (
    <ResizablePanelGroup
      orientation="horizontal"
      className="h-full min-h-0 w-full"
    >
      {historyOpen ? (
        <>
          <ResizablePanel defaultSize={22} minSize={15} maxSize={40}>
            <HistoryList
              entries={client.history}
              onRestore={(e) => {
                client.restore(e);
                setHistoryOpen(false);
              }}
              onClose={() => setHistoryOpen(false)}
            />
          </ResizablePanel>
          <ResizableHandle withHandle />
        </>
      ) : null}
      <ResizablePanel defaultSize={historyOpen ? 78 : 100}>
        <ResizablePanelGroup orientation="vertical" className="h-full">
          <ResizablePanel defaultSize={55} minSize={25}>
            <div className="flex h-full min-h-0 flex-col">
              {/* URL bar row */}
              <div className="border-border/60 flex shrink-0 items-center gap-2 border-b px-2 py-1.5">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Request history"
                  onClick={() => setHistoryOpen((v) => !v)}
                  className={cn(
                    historyOpen && "bg-accent/50 text-foreground",
                  )}
                >
                  <History className="h-3.5 w-3.5" />
                </Button>
                <select
                  value={client.request.method}
                  onChange={(e) =>
                    client.setMethod(e.target.value as HttpMethod)
                  }
                  aria-label="HTTP method"
                  className="border-border/60 bg-muted/40 text-foreground focus-visible:ring-ring/50 h-8 rounded-md border px-2 font-mono text-xs outline-none focus-visible:ring-2"
                >
                  {METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <Input
                  value={client.request.url}
                  onChange={(e) => client.setUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !client.sending) {
                      e.preventDefault();
                      void client.send();
                    }
                  }}
                  placeholder="http://localhost:5000/api/health or any URL"
                  className="h-8 flex-1 font-mono text-xs"
                />
                {containerBase ? (
                  <Button
                    variant="outline"
                    size="sm"
                    title={`Mapped host port for this sandbox container — ${containerBase}`}
                    onClick={() => client.loadUrl(containerBase)}
                  >
                    <ServerCog className="mr-1.5 h-3.5 w-3.5" />
                    Use container
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  onClick={() => void client.send()}
                  disabled={client.sending || !client.request.url.trim() || readOnly}
                  title={readOnly ? "Read-only — a candidate is currently editing" : undefined}
                >
                  {client.sending ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      Sending…
                    </>
                  ) : (
                    <>
                      <Send className="mr-1.5 h-3.5 w-3.5" />
                      Send
                    </>
                  )}
                </Button>
              </div>

              {/* Sub-tabs */}
              <div
                role="tablist"
                className="border-border/60 flex shrink-0 items-center gap-0.5 border-b px-2 py-1"
              >
                <RequestTabHeader
                  label="Params"
                  count={countEnabled(client.request.params)}
                  active={tab === "params"}
                  onSelect={() => setTab("params")}
                />
                <RequestTabHeader
                  label="Headers"
                  count={countEnabled(client.request.headers)}
                  active={tab === "headers"}
                  onSelect={() => setTab("headers")}
                />
                <RequestTabHeader
                  label="Body"
                  active={tab === "body"}
                  onSelect={() => setTab("body")}
                  dot={
                    hasBody &&
                    client.request.bodyMode !== "none" &&
                    !!(
                      client.request.bodyText ||
                      countEnabled(client.request.bodyForm) > 0
                    )
                  }
                />
              </div>

              {/* Sub-tab content */}
              <div className="min-h-0 flex-1 overflow-auto">
                {tab === "params" ? (
                  <KvEditor
                    rows={client.request.params}
                    onPatch={client.setParam}
                    onRemove={client.removeParam}
                  />
                ) : tab === "headers" ? (
                  <KvEditor
                    rows={client.request.headers}
                    keyPlaceholder="Header"
                    valuePlaceholder="Value"
                    onPatch={client.setHeader}
                    onRemove={client.removeHeader}
                  />
                ) : (
                  <BodyEditor
                    mode={client.request.bodyMode}
                    text={client.request.bodyText}
                    form={client.request.bodyForm}
                    disabled={!hasBody}
                    onModeChange={client.setBodyMode}
                    onTextChange={client.setBodyText}
                    onFormPatch={client.setFormRow}
                    onFormRemove={client.removeFormRow}
                  />
                )}
              </div>
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={45} minSize={20}>
            <ResponseViewer
              response={client.response}
              sending={client.sending}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

function RequestTabHeader({
  label,
  count,
  dot,
  active,
  onSelect,
}: {
  label: string;
  count?: number;
  dot?: boolean;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      type="button"
      onClick={onSelect}
      className={cn(
        "flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] transition-colors",
        active
          ? "bg-accent/60 text-foreground"
          : "text-muted-foreground hover:bg-accent/30 hover:text-foreground",
      )}
    >
      <span>{label}</span>
      {typeof count === "number" && count > 0 ? (
        <span className="bg-muted/60 text-muted-foreground rounded-sm px-1 font-mono text-[10px]">
          {count}
        </span>
      ) : null}
      {dot ? (
        <span
          aria-hidden
          className="bg-emerald-400/80 inline-block h-1.5 w-1.5 rounded-full"
        />
      ) : null}
    </button>
  );
}

function countEnabled(rows: { key: string; enabled: boolean }[]): number {
  return rows.filter((r) => r.enabled && r.key).length;
}

function containerBaseUrl(preview: PreviewInfo): string | null {
  switch (preview.status) {
    case "ready":
      return preview.url;
    case "request":
      return preview.baseUrl;
    default:
      return null;
  }
}

