"use client";

import dynamic from "next/dynamic";
import { Globe, Loader2, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { languageFromExt } from "@/lib/fs-tree";
import { setupMonaco } from "@/lib/monaco-setup";
import { useMonacoTheme } from "@/lib/hooks/use-monaco-theme";
import { BrowserPane } from "./browser-pane";
import { ApiClientPane } from "./api-client/api-client-pane";
import type { PreviewInfo } from "@/types/session";

/** Sentinel "paths" for the pinned, non-file tabs. */
export const PREVIEW_TAB_PATH = "__preview__";
export const API_CLIENT_TAB_PATH = "__api__";

export const PINNED_TAB_PATHS = new Set<string>([
  PREVIEW_TAB_PATH,
  API_CLIENT_TAB_PATH,
]);

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="text-muted-foreground flex h-full items-center justify-center text-xs">
      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
      Loading editor…
    </div>
  ),
});

export interface EditorTab {
  path: string;
  name: string;
  dirty: boolean;
  /** True while the initial file read is in flight. */
  loading?: boolean;
}

interface EditorPaneProps {
  tabs: EditorTab[];
  activePath: string | null;
  contentByPath: Record<string, string>;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
  onChange: (path: string, content: string) => void;
  preview: PreviewInfo;
  sessionId: string;
  /** Read-only mode (interviewer while a candidate edits). */
  readOnly?: boolean;
  /** Candidate share token — routes the API client through the public proxy. */
  shareToken?: string;
}

export function EditorPane({
  tabs,
  activePath,
  contentByPath,
  onSelect,
  onClose,
  onChange,
  preview,
  sessionId,
  readOnly = false,
  shareToken,
}: EditorPaneProps) {
  const onPreview = activePath === PREVIEW_TAB_PATH;
  const onApi = activePath === API_CLIENT_TAB_PATH;
  const monacoTheme = useMonacoTheme();
  const activeFileTab = tabs.find((t) => t.path === activePath) ?? null;
  const content = activePath ? (contentByPath[activePath] ?? "") : "";
  const language = activeFileTab
    ? languageFromExt(activeFileTab.name)
    : "plaintext";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className="border-border/60 flex shrink-0 items-center gap-0.5 overflow-x-auto border-b"
        role="tablist"
      >
        <PreviewTabHeader
          active={onPreview}
          preview={preview}
          onSelect={() => onSelect(PREVIEW_TAB_PATH)}
        />
        <ApiTabHeader
          active={onApi}
          onSelect={() => onSelect(API_CLIENT_TAB_PATH)}
        />
        {tabs.length === 0 ? (
          <div className="text-muted-foreground px-3 py-1.5 text-[11px]">
            Open a file from the tree to start editing.
          </div>
        ) : (
          tabs.map((t) => (
            <TabHeader
              key={t.path}
              tab={t}
              active={t.path === activePath}
              onSelect={() => onSelect(t.path)}
              onClose={() => onClose(t.path)}
            />
          ))
        )}
      </div>
      <div className="flex-1 min-h-0">
        {onPreview ? (
          <BrowserPane preview={preview} />
        ) : onApi ? (
          <ApiClientPane
            preview={preview}
            sessionId={sessionId}
            readOnly={readOnly}
            shareToken={shareToken}
          />
        ) : activeFileTab ? (
          activeFileTab.loading ? (
            <div className="text-muted-foreground flex h-full items-center justify-center text-xs">
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              Loading file…
            </div>
          ) : (
            <MonacoEditor
              key={activeFileTab.path}
              language={language}
              theme={monacoTheme}
              value={content}
              beforeMount={setupMonaco}
              onChange={(v) => onChange(activeFileTab.path, v ?? "")}
              options={{
                readOnly,
                automaticLayout: true,
                minimap: { enabled: false },
                fontSize: 13,
                fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
                scrollBeyondLastLine: false,
                renderLineHighlight: "line",
                tabSize: 2,
                wordWrap: "off",
              }}
            />
          )
        ) : (
          <div className="text-muted-foreground flex h-full items-center justify-center text-xs">
            No file open.
          </div>
        )}
      </div>
    </div>
  );
}

function PreviewTabHeader({
  active,
  preview,
  onSelect,
}: {
  active: boolean;
  preview: PreviewInfo;
  onSelect: () => void;
}) {
  // Tiny status dot so the user can tell at a glance whether the dev server
  // is live without switching tabs.
  const dot =
    preview.status === "ready"
      ? "bg-emerald-400"
      : preview.status === "starting" || preview.status === "unknown"
        ? "bg-yellow-400"
        : preview.status === "errored"
          ? "bg-destructive"
          : "bg-muted-foreground/40";

  return (
    <div
      role="tab"
      aria-selected={active}
      className={cn(
        "border-border/60 flex shrink-0 items-center gap-1.5 border-r px-2.5 py-1 text-xs transition-colors",
        active
          ? "bg-background text-foreground"
          : "text-muted-foreground hover:bg-accent/30 hover:text-foreground",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex items-center gap-1.5 outline-none"
      >
        <Globe className="h-3 w-3" aria-hidden />
        <span>Preview</span>
        <span
          aria-hidden
          className={cn("ml-0.5 inline-block h-1.5 w-1.5 rounded-full", dot)}
        />
      </button>
    </div>
  );
}

function ApiTabHeader({
  active,
  onSelect,
}: {
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      role="tab"
      aria-selected={active}
      className={cn(
        "border-border/60 flex shrink-0 items-center gap-1.5 border-r px-2.5 py-1 text-xs transition-colors",
        active
          ? "bg-background text-foreground"
          : "text-muted-foreground hover:bg-accent/30 hover:text-foreground",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex items-center gap-1.5 outline-none"
      >
        <Send className="h-3 w-3" aria-hidden />
        <span>API</span>
      </button>
    </div>
  );
}

function TabHeader({
  tab,
  active,
  onSelect,
  onClose,
}: {
  tab: EditorTab;
  active: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  return (
    <div
      role="tab"
      aria-selected={active}
      className={cn(
        "group border-border/60 flex shrink-0 items-center gap-1.5 border-r px-2.5 py-1 text-xs transition-colors",
        active
          ? "bg-background text-foreground"
          : "text-muted-foreground hover:bg-accent/30 hover:text-foreground",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="max-w-[14rem] truncate text-left outline-none"
      >
        {tab.name}
        {tab.dirty ? (
          <span className="text-muted-foreground ml-1" aria-label="Unsaved">
            ●
          </span>
        ) : null}
      </button>
      <Button
        variant="ghost"
        size="icon-sm"
        className="h-4 w-4 opacity-60 hover:opacity-100"
        aria-label={`Close ${tab.name}`}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}
