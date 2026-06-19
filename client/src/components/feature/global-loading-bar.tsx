"use client";

import { useEffect, useState } from "react";
import { useApiLoading } from "@/lib/hooks/use-api-loading";

/**
 * Thin top-of-viewport progress bar — shown whenever ANY API request is
 * in flight. Chosen over a full overlay because most calls are short
 * (autosave PATCHes, cursor broadcasts, lookups) and a blocking overlay
 * would feel laggy. The bar is non-interactive (pointer-events: none) and
 * sits above app chrome.
 *
 * The animation runs only while there's pending work; the bar fades out
 * after a short tail so quick back-to-back requests don't strobe.
 */
export function GlobalLoadingBar() {
  const { pending } = useApiLoading();
  const [visible, setVisible] = useState(false);

  // Show immediately on pending; fade out after a short delay so adjacent
  // requests don't cause a visible blink.
  useEffect(() => {
    if (pending) {
      setVisible(true);
      return;
    }
    const t = setTimeout(() => setVisible(false), 200);
    return () => clearTimeout(t);
  }, [pending]);

  return (
    <div
      aria-hidden
      className={
        "pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden transition-opacity duration-200 " +
        (visible ? "opacity-100" : "opacity-0")
      }
    >
      <div
        className={
          "bg-primary h-full origin-left " +
          (pending ? "animate-loading-bar" : "")
        }
      />
    </div>
  );
}
