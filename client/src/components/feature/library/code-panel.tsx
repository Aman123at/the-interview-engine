"use client";

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Check, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMonacoTheme } from "@/lib/hooks/use-monaco-theme";
import { cn } from "@/lib/utils";
import { getVariant } from "@/lib/library/registry";
import {
  FRAMEWORK_LABELS,
  VARIANT_KEYS,
  VARIANT_LABELS,
  type Framework,
  type Kit,
  type Language,
  type LibraryPage,
  type Styling,
  type VariantKey,
} from "@/lib/library/types";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="text-muted-foreground flex h-full items-center justify-center text-xs">
      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
      Loading code…
    </div>
  ),
});

const MONACO_LANGUAGE: Record<Language, string> = {
  tsx: "typescript",
  jsx: "javascript",
  ts: "typescript",
  css: "css",
};

interface CodePanelProps {
  page: LibraryPage;
}

export function CodePanel({ page }: CodePanelProps) {
  const [framework, setFramework] = useState<Framework>("react");
  const [variantKey, setVariantKey] = useState<VariantKey>("shadcn-tailwind");
  const [fileIdx, setFileIdx] = useState(0);
  const monacoTheme = useMonacoTheme();

  const [kit, styling] = variantKey.split("-") as [Kit, Styling];
  const variant = useMemo(
    () => getVariant(page, framework, kit, styling),
    [page, framework, kit, styling],
  );

  const activeFile = variant.files[Math.min(fileIdx, variant.files.length - 1)]!;

  const onSelectVariant = useCallback((key: VariantKey) => {
    setVariantKey(key);
    setFileIdx(0);
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="border-border bg-muted/40 inline-flex rounded-md border p-0.5 text-xs">
          {(["react", "next"] as Framework[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFramework(f)}
              className={cn(
                "rounded px-3 py-1 font-medium transition-colors",
                framework === f
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {FRAMEWORK_LABELS[f]}
            </button>
          ))}
        </div>

        <div className="border-border bg-muted/40 ml-auto inline-flex flex-wrap rounded-md border p-0.5 text-xs">
          {VARIANT_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => onSelectVariant(key)}
              className={cn(
                "rounded px-3 py-1 font-medium transition-colors",
                variantKey === key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {VARIANT_LABELS[key]}
            </button>
          ))}
        </div>
      </div>

      {variant.notes ? (
        <pre className="border-border bg-muted/40 text-muted-foreground whitespace-pre-wrap rounded-md border p-3 text-xs">
          {variant.notes}
        </pre>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {variant.files.map((file, idx) => (
          <button
            key={file.filename}
            type="button"
            onClick={() => setFileIdx(idx)}
            className={cn(
              "border-border rounded-md border px-2.5 py-1 font-mono text-xs",
              idx === fileIdx
                ? "bg-foreground text-background"
                : "bg-background text-foreground hover:bg-muted",
            )}
          >
            {file.filename}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <CopyButton label="Copy" text={activeFile.code} />
          {variant.files.length > 1 ? (
            <CopyButton label="Copy all" text={concatAll(variant.files)} />
          ) : null}
        </div>
      </div>

      <div className="border-border min-h-[24rem] flex-1 overflow-hidden rounded-md border">
        <MonacoEditor
          key={`${page.id}-${framework}-${variantKey}-${activeFile.filename}`}
          height="100%"
          language={MONACO_LANGUAGE[activeFile.language]}
          value={activeFile.code}
          theme={monacoTheme}
          options={{
            readOnly: true,
            minimap: { enabled: false },
            fontSize: 13,
            scrollBeyondLastLine: false,
            wordWrap: "on",
            renderLineHighlight: "none",
          }}
        />
      </div>
    </div>
  );
}

function concatAll(files: { filename: string; code: string }[]): string {
  return files
    .map((f) => `// ==== ${f.filename} ====\n${f.code}`)
    .join("\n\n");
}

function CopyButton({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback for non-secure contexts.
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } finally {
        document.body.removeChild(ta);
      }
    }
  }, [text]);

  return (
    <Button size="sm" variant="outline" onClick={onCopy} className="h-7 gap-1.5 text-xs">
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : label}
    </Button>
  );
}
