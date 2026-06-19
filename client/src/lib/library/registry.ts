import { lazy, type LazyExoticComponent, type ComponentType } from "react";
import type {
  Framework,
  Kit,
  LibraryPage,
  LibraryPageModule,
  Styling,
  Variant,
  VariantKey,
} from "./types";
import { toNext } from "./next-adapter";

/**
 * Registry entry: lightweight metadata + a lazy() preview component. Pages are
 * code-split — adding a page does NOT bloat first load.
 *
 * Authoring convention: see `src/lib/library/README.md`.
 */
interface RegistryEntry {
  loader: () => Promise<{ default: LibraryPageModule }>;
}

const ENTRIES: RegistryEntry[] = [
  { loader: () => import("./pages/auth-login") },
  { loader: () => import("./pages/auth-signup") },
  { loader: () => import("./pages/chat") },
  { loader: () => import("./pages/search") },
  { loader: () => import("./pages/todo") },
  { loader: () => import("./pages/ecommerce-product") },
  { loader: () => import("./pages/ecommerce-cart") },
  { loader: () => import("./pages/ecommerce-checkout") },
  { loader: () => import("./pages/hello") },
];

/** In-module cache so repeat opens of a page reuse the same lazy component. */
const cache = new Map<string, LibraryPage>();

async function loadModule(entry: RegistryEntry): Promise<LibraryPageModule> {
  const mod = await entry.loader();
  return mod.default;
}

/** Resolve all registry entries' metadata (eager — cheap, no preview render). */
export async function loadLibraryPages(): Promise<LibraryPage[]> {
  const pages = await Promise.all(
    ENTRIES.map(async (entry) => {
      const mod = await loadModule(entry);
      if (cache.has(mod.id)) return cache.get(mod.id)!;
      const Preview: LazyExoticComponent<ComponentType> = lazy(async () => {
        const m = await entry.loader();
        return { default: m.default.Preview };
      });
      const page: LibraryPage = { ...mod, Preview };
      cache.set(mod.id, page);
      return page;
    }),
  );
  return pages;
}

export function variantKey(kit: Kit, styling: Styling): VariantKey {
  return `${kit}-${styling}`;
}

export function getVariant(
  page: LibraryPageModule | LibraryPage,
  framework: Framework,
  kit: Kit,
  styling: Styling,
): Variant {
  const key = variantKey(kit, styling);
  const reactVariant = page.react[key];
  if (framework === "react") return reactVariant;
  // Next: explicit override wins; otherwise derive deterministically.
  const override = page.next?.[key];
  return override ?? toNext(reactVariant, key);
}

export interface GroupedPages {
  category: string;
  pages: LibraryPage[];
}

export function groupByCategory(pages: LibraryPage[]): GroupedPages[] {
  const order: string[] = [];
  const map = new Map<string, LibraryPage[]>();
  for (const page of pages) {
    if (!map.has(page.category)) {
      map.set(page.category, []);
      order.push(page.category);
    }
    map.get(page.category)!.push(page);
  }
  return order.map((category) => ({ category, pages: map.get(category)! }));
}
