import type { FrameworkDef } from "@/contracts";

/** Group of options keyed by group id. Client-side answers state. */
export type CustomizationSelection = Record<string, string | string[]>;

type FrameworkGroup = FrameworkDef["groups"][number];

/** Seed a selection object from the server-provided `default` values. */
export function seedSelection(framework: FrameworkDef): CustomizationSelection {
  const out: CustomizationSelection = {};
  for (const g of framework.groups) {
    if (g.type === "checkbox") {
      if (Array.isArray(g.default)) out[g.id] = [...g.default];
      else out[g.id] = [];
    } else {
      // radio (required or optional)
      if (typeof g.default === "string") out[g.id] = g.default;
      else out[g.id] = ""; // null / undefined
    }
  }
  return out;
}

/**
 * Lightweight client-side validation: every `required` group must have a
 * value. Returns an error message keyed by group id.
 */
export function validateSelection(
  framework: FrameworkDef,
  selection: CustomizationSelection,
): Record<string, string> {
  const errs: Record<string, string> = {};
  for (const g of framework.groups) {
    if (!g.required) continue;
    const v = selection[g.id];
    if (isEmpty(g, v)) {
      errs[g.id] = `Choose a ${g.label.toLowerCase()}.`;
    }
  }
  return errs;
}

function isEmpty(
  g: FrameworkGroup,
  v: string | string[] | undefined,
): boolean {
  if (v === undefined) return true;
  if (g.type === "checkbox") {
    return !Array.isArray(v) || v.length === 0;
  }
  return typeof v !== "string" || v.length === 0;
}
