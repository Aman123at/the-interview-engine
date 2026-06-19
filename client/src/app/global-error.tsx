"use client";

import { AlertTriangle } from "lucide-react";

/**
 * Last-resort error boundary — Next.js mounts this only when the root layout
 * itself throws (e.g. the AuthProvider or Toaster crashed). It MUST render its
 * own <html>/<body> because the normal layout never executed.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" className="dark" style={{ colorScheme: "dark" }}>
      <body
        style={{
          minHeight: "100dvh",
          background: "#0a0a0a",
          color: "#ededed",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          margin: 0,
          padding: "3rem 1.5rem",
        }}
      >
        <main style={{ maxWidth: "32rem", margin: "0 auto" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "2.5rem",
              height: "2.5rem",
              borderRadius: "0.5rem",
              background: "rgba(239, 68, 68, 0.15)",
              color: "#fca5a5",
              marginBottom: "1.25rem",
            }}
          >
            <AlertTriangle width={20} height={20} aria-hidden />
          </div>
          <h1 style={{ fontSize: "1.25rem", margin: 0, fontWeight: 600 }}>
            The app failed to load.
          </h1>
          <p
            style={{
              color: "#a3a3a3",
              fontSize: "0.875rem",
              marginTop: "0.5rem",
              lineHeight: 1.5,
            }}
          >
            We hit an unrecoverable error in the root layout. Your work is
            saved server-side. Try reloading.
          </p>
          {error?.digest ? (
            <code
              style={{
                display: "inline-block",
                marginTop: "1rem",
                padding: "0.25rem 0.5rem",
                border: "1px solid #262626",
                borderRadius: "0.375rem",
                background: "#171717",
                color: "#a3a3a3",
                fontFamily: "ui-monospace, monospace",
                fontSize: "0.6875rem",
              }}
            >
              ref: {error.digest}
            </code>
          ) : null}
          <div style={{ marginTop: "1.25rem" }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                background: "#ededed",
                color: "#0a0a0a",
                padding: "0.5rem 1rem",
                borderRadius: "0.375rem",
                border: 0,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
