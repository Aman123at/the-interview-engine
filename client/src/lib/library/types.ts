import type { ComponentType, LazyExoticComponent } from "react";

export type Framework = "react" | "next";
export type Kit = "shadcn" | "plain";
export type Styling = "tailwind" | "css";

export type Language = "tsx" | "jsx" | "ts" | "css";

export interface VariantFile {
  filename: string;
  language: Language;
  code: string;
}

export interface Variant {
  files: VariantFile[];
  notes?: string;
}

/** Variant key built from kit + styling, e.g. "shadcn-tailwind". */
export type VariantKey = `${Kit}-${Styling}`;

/** Source bundle the page author provides — 4 React variants + optional Next overrides. */
export interface ReactVariantSources {
  "shadcn-tailwind": Variant;
  "plain-tailwind": Variant;
  "plain-css": Variant;
  "shadcn-css": Variant;
}
export type NextVariantOverrides = Partial<ReactVariantSources>;

export interface LibraryPageModule {
  id: string;
  title: string;
  description: string;
  category: string;
  Preview: ComponentType;
  react: ReactVariantSources;
  /** Optional explicit Next.js overrides when the mechanical adapter isn't faithful. */
  next?: NextVariantOverrides;
}

export interface LibraryPage extends Omit<LibraryPageModule, "Preview"> {
  /** Lazy preview so a single page's deps don't bloat first load. */
  Preview: LazyExoticComponent<ComponentType>;
}

export const VARIANT_KEYS: VariantKey[] = [
  "shadcn-tailwind",
  "plain-tailwind",
  "plain-css",
  "shadcn-css",
];

export const VARIANT_LABELS: Record<VariantKey, string> = {
  "shadcn-tailwind": "shadcn + Tailwind",
  "plain-tailwind": "React + Tailwind",
  "plain-css": "React + CSS",
  "shadcn-css": "shadcn + CSS",
};

export const FRAMEWORK_LABELS: Record<Framework, string> = {
  react: "React",
  next: "Next.js",
};
