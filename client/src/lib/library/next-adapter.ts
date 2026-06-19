import type { Variant, VariantFile, VariantKey } from "./types";

/**
 * Derive the Next.js (App Router) variant from a React source. Pure, deterministic:
 *   1. Prepend a one-line app-router placement note.
 *   2. Prepend `"use client";` (since these pages use useState/handlers).
 *   3. Convert any <a href="/route">…</a> client-side navigation into <Link href="/route">…</Link>
 *      from next/link and add the import.
 *
 * CSS files pass through untouched.
 *
 * Authors can supply an explicit override per variant if the mechanical transform isn't faithful;
 * those overrides bypass this function.
 */
export function toNext(reactVariant: Variant, _key: VariantKey): Variant {
  void _key;
  return {
    notes: combineNotes(reactVariant.notes),
    files: reactVariant.files.map(transformFile),
  };
}

function transformFile(file: VariantFile): VariantFile {
  if (file.language === "css") return file;

  const componentName = guessComponentName(file.code) ?? "Page";
  const placement = `// app/${slug(componentName)}/page.${file.language}`;

  let code = file.code;
  let usedLink = false;

  // Convert anchor router navigation to next/link.
  // Match <a href="/foo"…>…</a> (only client-side absolute paths starting with /).
  code = code.replace(
    /<a(\s+[^>]*?href="\/[^"]*"[^>]*)>([\s\S]*?)<\/a>/g,
    (_match, attrs: string, children: string) => {
      usedLink = true;
      return `<Link${attrs}>${children}</Link>`;
    },
  );

  // Insert imports at the top (after the placement + use client lines we'll add).
  const importLink = usedLink ? `import Link from "next/link";\n` : "";

  const header = `${placement}\n"use client";\n${importLink}`;
  return { ...file, code: header + code };
}

function guessComponentName(code: string): string | null {
  const m =
    code.match(/export\s+default\s+function\s+([A-Z][A-Za-z0-9_]*)/) ??
    code.match(/function\s+([A-Z][A-Za-z0-9_]*)/) ??
    code.match(/const\s+([A-Z][A-Za-z0-9_]*)\s*=/);
  return m ? m[1]! : null;
}

function slug(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/^Page$/, "page")
    .toLowerCase();
}

function combineNotes(notes: string | undefined): string {
  const next = `Next.js (App Router): paste into app/<route>/page.tsx. The file is marked "use client" because the page uses local state.`;
  return notes ? `${next}\n\n${notes}` : next;
}
