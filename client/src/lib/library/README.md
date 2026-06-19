# Component Library — authoring convention

The library at `/library` is a **public, client-only** showcase of prebuilt
pages. Each page is shipped as paste-ready source across two axes:

- **Framework:** React (Vite) | Next.js (App Router)
- **Kit × Styling:** shadcn+Tailwind · React+Tailwind · React+CSS · shadcn+CSS

You only author the **four React variants** per page. The Next.js variants
come from a deterministic adapter (`next-adapter.ts`). Provide an explicit
override only when the mechanical transform isn't faithful.

## Folder layout

```
src/lib/library/pages/<page-id>/
  index.ts        # exports the LibraryPageModule
  Preview.tsx     # canonical preview (= shadcn+Tailwind, real component)
  sources.ts      # the four React variants as template-literal strings
```

A new page is purely additive:

1. Drop the folder.
2. Append `{ loader: () => import("./pages/<page-id>") }` to `ENTRIES` in
   `registry.ts`.

That's it — code-split lazy import, framework toggle, kit×styling tabs,
per-file copy, copy-all, category grouping, and the Next adapter all work
automatically.

## Hard rules

1. **Snippets must be self-contained.** No imports from this app's own
   components. Only `@/components/ui/*` (shadcn primitives) when the kit is
   `shadcn`, plus standard React.
2. **No server calls or auth.** The library and every snippet are
   browser-only.
3. **Dummy data + dummy handlers inline.** Use `useState` for local state.
4. **Authoring duplication is OK for the canonical variant.** `Preview.tsx`
   is a real component; `sources.ts['shadcn-tailwind']` is the string
   mirror. The small duplication is worth zero raw-loader/webpack config.

## The Next.js adapter

Given a React variant, the adapter:

1. Prepends `// app/<slug>/page.tsx` (placement note for the App Router).
2. Prepends `"use client";` (every page uses local state).
3. Rewrites `<a href="/route">…</a>` → `<Link href="/route">…</Link>` and
   adds `import Link from "next/link";` when it fired.
4. Prepends a Next-specific notes line above any author notes.

If a page does anything the adapter can't transform mechanically (server
components, `metadata`, etc.), supply an explicit `next` override in
`index.ts`:

```ts
const page: LibraryPageModule = {
  ...
  react: sources,
  next: { "shadcn-tailwind": { files: [...], notes: "..." } },
};
```
