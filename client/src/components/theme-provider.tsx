"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

/**
 * App-level theme provider. Defaults to `system`, persists the user choice in
 * localStorage under `theme`, and toggles the `class` on `<html>` (which the
 * shadcn tokens key off via the `.dark` selector). next-themes injects an SSR-
 * safe inline script before first paint, so there is no flash of the wrong
 * theme on reload.
 */
export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey="theme"
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
