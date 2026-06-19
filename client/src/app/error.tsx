"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Global error boundary. Next.js mounts this when an unhandled error escapes
 * any route segment that doesn't define its own error.tsx. The branding here
 * is deliberately neutral — we don't want this to look like a backend error.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] unhandled error", error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-start justify-center gap-5 px-6 py-12">
      <span
        className="bg-destructive/10 text-destructive inline-flex h-10 w-10 items-center justify-center rounded-md"
        aria-hidden
      >
        <AlertTriangle className="h-5 w-5" />
      </span>
      <div className="space-y-1.5">
        <p className="text-muted-foreground font-mono text-xs uppercase tracking-[0.18em]">
          unexpected error
        </p>
        <h1 className="text-foreground text-xl font-semibold tracking-tight">
          Something went wrong on the page.
        </h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Your work is safe — sessions are persisted server-side. Try reloading
          the page, or head back to the dashboard.
        </p>
      </div>
      {error?.digest ? (
        <code className="border-border/60 bg-muted/30 text-muted-foreground rounded-md border px-2 py-1 font-mono text-[11px]">
          ref: {error.digest}
        </code>
      ) : null}
      <div className="flex items-center gap-2">
        <Button onClick={() => reset()} size="sm">
          <RotateCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Try again
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            if (typeof window !== "undefined") {
              window.location.href = "/dashboard";
            }
          }}
        >
          Back to dashboard
        </Button>
      </div>
    </main>
  );
}
