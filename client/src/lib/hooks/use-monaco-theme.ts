"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

/**
 * Resolve the active app theme into the Monaco editor's `theme` prop. Returns
 * `"vs-dark"` for the dark theme and `"vs"` (Monaco's built-in light) for the
 * light theme. Before hydration we return `"vs-dark"` to match the dark-
 * preferring server render — flipping happens on the first effect tick, before
 * the editor mounts.
 */
export function useMonacoTheme(): "vs-dark" | "vs" {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // Canonical "wait for client hydration" pattern next-themes recommends —
    // SSR has no `.dark` class, so we delay the swap to the first effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);
  if (!mounted) return "vs-dark";
  return resolvedTheme === "light" ? "vs" : "vs-dark";
}
