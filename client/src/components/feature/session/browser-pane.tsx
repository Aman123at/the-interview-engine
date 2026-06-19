"use client";

import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  ExternalLink,
  Globe,
  Loader2,
  RotateCw,
  ServerCog,
  TriangleAlert,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PreviewInfo } from "@/types/session";

interface BrowserPaneProps {
  preview: PreviewInfo;
}

/**
 * Resolve a user-typed address into a navigable URL. Absolute http(s) URLs are
 * used as-is; anything else is treated as a path relative to the container
 * origin (so typing `/about` or `users?id=1` Just Works). Returns null if the
 * input can't be resolved.
 */
function resolveAddress(input: string, base: string | null): string | null {
  const t = input.trim();
  if (!t) return null;
  try {
    if (/^https?:\/\//i.test(t)) return new URL(t).toString();
    if (base) return new URL(t, base).toString();
    return null;
  } catch {
    return null;
  }
}

export function BrowserPane({ preview }: BrowserPaneProps) {
  // Bumping this nonce key forces a fresh iframe (full reload + nukes the
  // page's runtime state — same behavior as the browser refresh button).
  const [reloadNonce, setReloadNonce] = useState(0);
  // Track the active theme so the iframe's `color-scheme` follows the app
  // (was previously pinned to light to avoid white-on-white JSON viewers;
  // now it tracks). `mounted` guards against an SSR/CSR mismatch by holding
  // the iframe back until next-themes resolves on the client.
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // Hydration gate — see lib/hooks/use-monaco-theme.ts for the same
    // pattern. The iframe needs the client-resolved theme to pick its
    // `color-scheme` correctly.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);
  const iframeColorScheme: "light" | "dark" =
    mounted && resolvedTheme === "light" ? "light" : "dark";
  // The URL the iframe actually loads. Seeded from the preview origin and then
  // driven by the editable address bar so the user can navigate to any path on
  // the dev server.
  const baseUrl = preview.status === "ready" ? preview.url : null;
  const [currentUrl, setCurrentUrl] = useState<string | null>(baseUrl);

  // Re-seed when the preview origin changes (becomes ready, or a resume hands
  // out a fresh host port). Adjusting state during render (with a previous-value
  // tracker) is React's endorsed alternative to a syncing effect, and keeps
  // in-app navigation from being clobbered by unrelated re-renders.
  const [seededFrom, setSeededFrom] = useState<string | null>(baseUrl);
  if (baseUrl && baseUrl !== seededFrom) {
    setSeededFrom(baseUrl);
    setCurrentUrl(baseUrl);
  }

  function navigate(url: string) {
    setCurrentUrl(url);
    // Bump the nonce so re-entering the same URL still forces a reload.
    setReloadNonce((n) => n + 1);
  }

  const iframeUrl = currentUrl ?? baseUrl;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <BrowserToolbar
        preview={preview}
        currentUrl={iframeUrl}
        baseUrl={baseUrl}
        onReload={() => setReloadNonce((n) => n + 1)}
        onNavigate={navigate}
      />
      <div className="bg-background relative min-h-0 flex-1">
        {preview.status === "ready" && iframeUrl ? (
          <iframe
            key={`${iframeUrl}-${reloadNonce}-${iframeColorScheme}`}
            src={iframeUrl}
            title="Sandbox preview"
            className={cn(
              "absolute inset-0 h-full w-full border-0",
              // A starting bg that matches the active scheme so the brief
              // flash before the iframe paints isn't jarring. Real apps own
              // their CSS and overwrite this; user-agent JSON / directory
              // views inherit it via `color-scheme` below.
              "bg-editor-surface",
            )}
            // Mirror the app theme so native renderers (JSON viewer, directory
            // listings, plaintext) draw legibly in either palette. Real apps
            // ship their own CSS and are unaffected.
            style={{ colorScheme: iframeColorScheme }}
            // Same-origin is required for HMR — Vite/Next inject scripts and
            // connect a websocket to themselves. The iframe loads the server-
            // provided preview URL verbatim (loopback host:port in dev,
            // https subdomain in prod), so HMR Just Works in both modes.
            // `allow-forms` so users can submit forms; `allow-popups` so
            // window.open works; `allow-scripts` so the framework can run.
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
            referrerPolicy="no-referrer"
          />
        ) : (
          <BrowserPlaceholder preview={preview} />
        )}
      </div>
    </div>
  );
}

function BrowserToolbar({
  preview,
  currentUrl,
  baseUrl,
  onReload,
  onNavigate,
}: {
  preview: PreviewInfo;
  currentUrl: string | null;
  baseUrl: string | null;
  onReload: () => void;
  onNavigate: (url: string) => void;
}) {
  const canInteract = preview.status === "ready";
  // The address shown when there's no live iframe (e.g. an API/request preview).
  const fallback =
    preview.status === "request" ? preview.baseUrl : statusBlurb(preview);

  // Local, editable copy of the address. Re-synced whenever the iframe's URL
  // changes (navigation, reload, a new preview) so it always reflects reality,
  // but stays free-edit while the user is typing. (Render-time sync with a
  // previous-value tracker — React's endorsed alternative to a syncing effect.)
  const [address, setAddress] = useState(currentUrl ?? "");
  const [syncedUrl, setSyncedUrl] = useState(currentUrl);
  if (currentUrl !== syncedUrl) {
    setSyncedUrl(currentUrl);
    setAddress(currentUrl ?? "");
  }

  function go() {
    const resolved = resolveAddress(address, baseUrl);
    if (!resolved) return;
    onNavigate(resolved);
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    go();
  }
  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      // Handle Enter explicitly on the input so navigation works regardless of
      // implicit form-submission quirks (which can silently no-op in some
      // browser/Composer combinations when the form has no submit button).
      // IME composition still gets through cleanly because composition keys
      // emit `keyCode: 229` and we only fire on the actual Enter.
      if (e.nativeEvent.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      go();
      return;
    }
    if (e.key === "Escape") {
      setAddress(currentUrl ?? "");
      e.currentTarget.blur();
    }
  }

  return (
    <div className="border-border/60 flex shrink-0 items-center gap-2 border-b px-2 py-1.5">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Reload preview"
        disabled={!canInteract}
        onClick={onReload}
      >
        <RotateCw className="h-3.5 w-3.5" />
      </Button>
      <form
        onSubmit={submit}
        className={cn(
          "border-border/60 bg-muted/40 focus-within:ring-ring/40 flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md border px-2 font-mono text-[11px] focus-within:ring-2",
          canInteract ? "text-foreground" : "text-muted-foreground",
        )}
      >
        <Globe className="h-3 w-3 shrink-0" aria-hidden />
        {canInteract ? (
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={(e) => e.currentTarget.select()}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            aria-label="Preview address"
            placeholder="Enter a URL or path and press Enter"
            className="placeholder:text-muted-foreground/60 min-w-0 flex-1 bg-transparent outline-none"
          />
        ) : (
          <span className="truncate">{fallback}</span>
        )}
      </form>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Open preview in new tab"
        disabled={!canInteract || !currentUrl}
        onClick={() => {
          if (currentUrl) {
            window.open(currentUrl, "_blank", "noopener,noreferrer");
          }
        }}
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function BrowserPlaceholder({ preview }: { preview: PreviewInfo }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center px-6">
      <div className="border-border/60 bg-card/40 flex max-w-md flex-col items-start gap-3 rounded-lg border p-6">
        <PlaceholderIcon preview={preview} />
        <h3 className="text-foreground text-sm font-medium">
          {placeholderTitle(preview)}
        </h3>
        <p className="text-muted-foreground text-xs leading-relaxed">
          {placeholderBody(preview)}
        </p>
        {preview.status === "request" ? (
          <code className="border-border/60 bg-muted/40 mt-1 inline-block rounded-md border px-2 py-1 font-mono text-[11px] text-foreground">
            {preview.baseUrl}
          </code>
        ) : null}
      </div>
    </div>
  );
}

function PlaceholderIcon({ preview }: { preview: PreviewInfo }) {
  const cls = "text-muted-foreground h-5 w-5";
  switch (preview.status) {
    case "starting":
    case "unknown":
      return <Loader2 className={cn(cls, "animate-spin")} aria-hidden />;
    case "request":
      return <ServerCog className={cls} aria-hidden />;
    case "errored":
      return <TriangleAlert className="text-destructive h-5 w-5" aria-hidden />;
    case "none":
    default:
      return <Globe className={cls} aria-hidden />;
  }
}

function placeholderTitle(preview: PreviewInfo): string {
  switch (preview.status) {
    case "unknown":
      return "Preview not available yet";
    case "starting":
      return "Starting dev server…";
    case "request":
      return "No browser preview — sandbox exposes a request endpoint";
    case "errored":
      return "Dev server failed";
    case "none":
      return "This framework has no preview";
    case "ready":
      return ""; // unreachable — iframe shown
  }
}

function placeholderBody(preview: PreviewInfo): string {
  switch (preview.status) {
    case "unknown":
      return "The sandbox hasn't reported a preview state yet. Once the dev server boots, this pane will load it automatically.";
    case "starting":
      return "Waiting for the dev server to bind its port. The URL will appear here as soon as it's reachable.";
    case "request":
      return "Hit this base URL from the API client tab (Phase 10), curl, or your local HTTP tool. It maps directly to the container's entrypoint port on localhost.";
    case "errored":
      return preview.message;
    case "none":
      return "This framework runs as a CLI/script — there's nothing to load in a browser. Use the terminal below to run and inspect it.";
    case "ready":
      return "";
  }
}

function statusBlurb(preview: PreviewInfo): string {
  switch (preview.status) {
    case "unknown":
      return "no preview reported yet";
    case "starting":
      return "starting dev server…";
    case "errored":
      return "dev server failed";
    case "none":
      return "no preview for this framework";
    case "request":
      return "request endpoint only";
    case "ready":
      return preview.url;
  }
}
