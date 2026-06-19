"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { setupMonaco } from "@/lib/monaco-setup";
import { useMonacoTheme } from "@/lib/hooks/use-monaco-theme";
import { KvEditor } from "./kv-editor";
import type { BodyMode, KvRow } from "@/types/api-client";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="text-muted-foreground flex h-full items-center justify-center text-xs">
      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
      Loading editor…
    </div>
  ),
});

const MODES: { id: BodyMode; label: string }[] = [
  { id: "none", label: "None" },
  { id: "json", label: "JSON" },
  { id: "text", label: "Text" },
  { id: "form", label: "Form" },
];

interface BodyEditorProps {
  mode: BodyMode;
  text: string;
  form: KvRow[];
  onModeChange: (m: BodyMode) => void;
  onTextChange: (t: string) => void;
  onFormPatch: (i: number, p: Partial<KvRow>) => void;
  onFormRemove: (i: number) => void;
  /** True for GET/HEAD/OPTIONS where there is no request body. */
  disabled?: boolean;
}

export function BodyEditor({
  mode,
  text,
  form,
  onModeChange,
  onTextChange,
  onFormPatch,
  onFormRemove,
  disabled,
}: BodyEditorProps) {
  const monacoTheme = useMonacoTheme();
  if (disabled) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center px-6 text-center text-xs">
        This method doesn&apos;t carry a request body.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        role="tablist"
        aria-label="Body mode"
        className="border-border/60 flex shrink-0 items-center gap-0.5 border-b px-2 py-1"
      >
        {MODES.map((m) => {
          const active = mode === m.id;
          return (
            <button
              key={m.id}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => onModeChange(m.id)}
              className={cn(
                "rounded-md px-2 py-0.5 text-[11px] transition-colors",
                active
                  ? "bg-accent/60 text-foreground"
                  : "text-muted-foreground hover:bg-accent/30 hover:text-foreground",
              )}
            >
              {m.label}
            </button>
          );
        })}
      </div>
      <div className="min-h-0 flex-1">
        {mode === "none" ? (
          <div className="text-muted-foreground flex h-full items-center justify-center text-xs">
            No body.
          </div>
        ) : mode === "form" ? (
          <KvEditor
            rows={form}
            keyPlaceholder="field"
            valuePlaceholder="value"
            onPatch={onFormPatch}
            onRemove={onFormRemove}
          />
        ) : (
          <MonacoEditor
            language={mode === "json" ? "json" : "plaintext"}
            theme={monacoTheme}
            value={text}
            beforeMount={setupMonaco}
            onChange={(v) => onTextChange(v ?? "")}
            options={{
              automaticLayout: true,
              minimap: { enabled: false },
              fontSize: 12,
              fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
              scrollBeyondLastLine: false,
              renderLineHighlight: "line",
              tabSize: 2,
              wordWrap: "on",
              lineNumbers: "off",
            }}
          />
        )}
      </div>
    </div>
  );
}
