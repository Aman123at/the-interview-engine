"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  className?: string;
  /** Hide the label text — icon-only toggle. */
  iconOnly?: boolean;
}

/**
 * Accessible light/dark toggle. Cycles between the two explicit themes
 * (`system` stays implicit — the user picks an override). Icon swap is a
 * short rotate+fade, suppressed under `prefers-reduced-motion` via the
 * `motion-safe:` Tailwind variant.
 *
 * Until the provider has hydrated `resolvedTheme`, we render a placeholder
 * with `aria-hidden` icons so server + client first-paint match — preventing
 * the iconography from "flipping" once next-themes mounts.
 */
export function ThemeToggle({ className, iconOnly = true }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Hydration gate — see use-monaco-theme.ts for the same pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const isDark = resolvedTheme === "dark";
  const next = isDark ? "light" : "dark";
  const label = mounted
    ? `Switch to ${next} mode`
    : "Toggle theme";

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={label}
      title={label}
      className={cn(
        "border-bd-2 bg-background/40 text-t-mid hover:bg-panel-2 hover:text-t-hi focus-visible:ring-accent-main/40 focus-visible:border-accent-main relative inline-flex h-[38px] w-[38px] items-center justify-center rounded-[10px] border outline-none transition-colors focus-visible:ring-2 disabled:opacity-50",
        !iconOnly && "w-auto gap-1.5 px-2",
        className,
      )}
    >
      <Sun
        className={cn(
          "h-4 w-4",
          "motion-safe:transition-all motion-safe:duration-200",
          mounted && !isDark
            ? "rotate-0 scale-100 opacity-100"
            : "motion-safe:-rotate-90 scale-0 opacity-0",
          // Absolutely-position both icons so they cross-fade in place.
          "absolute",
        )}
        aria-hidden
      />
      <Moon
        className={cn(
          "h-4 w-4",
          "motion-safe:transition-all motion-safe:duration-200",
          mounted && isDark
            ? "rotate-0 scale-100 opacity-100"
            : "motion-safe:rotate-90 scale-0 opacity-0",
          "absolute",
        )}
        aria-hidden
      />
      {/* Hidden text for screen readers (matches the aria-label, useful when
          iconOnly is false). */}
      {!iconOnly ? <span className="sr-only">{label}</span> : null}
    </button>
  );
}
