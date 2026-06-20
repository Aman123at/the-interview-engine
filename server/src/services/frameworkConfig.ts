/**
 * Framework + customization config — the server's SINGLE SOURCE OF TRUTH.
 *
 * The client renders the option groups returned from `GET /config/frameworks`
 * and POSTs a selection back when starting a session. Phase 6's POST /sessions
 * route uses `validateCustomization(framework, selection)` to authoritatively
 * reject invalid selections before anything touches Docker.
 *
 * Group model:
 *   - `type: 'radio'`     → single-select.
 *       `required: true`  → user MUST pick exactly one option; `default` is preselected.
 *       `required: false` → user MAY pick one or none ('optional radio');
 *                            null is a valid selection, `default` may be null.
 *   - `type: 'checkbox'`  → multi-select (zero or more from `options`).
 *                            `default` is the array of preselected option ids.
 *                            (A single-option checkbox like "Tailwind" is the
 *                             degenerate length-1 case.)
 */
import { z } from 'zod';
import { ValidationError } from '@/errors/index.js';

// --- Types -------------------------------------------------------------------

export interface OptionDef {
  id: string;
  label: string;
}

interface BaseGroupDef {
  id: string;
  label: string;
  options: OptionDef[];
}

export interface RadioRequiredGroupDef extends BaseGroupDef {
  type: 'radio';
  required: true;
  default: string; // must be one of options[].id
}

export interface RadioOptionalGroupDef extends BaseGroupDef {
  type: 'radio';
  required: false;
  default: string | null; // may be null = "none preselected"
}

export interface CheckboxGroupDef extends BaseGroupDef {
  type: 'checkbox';
  required: false; // checkboxes are always optional in this product
  default: string[]; // subset of options[].id (often [] = nothing checked)
}

export type GroupDef = RadioRequiredGroupDef | RadioOptionalGroupDef | CheckboxGroupDef;

export interface FrameworkDef {
  id: string;
  label: string;
  groups: GroupDef[];
}

/** A validated selection — group id → selected value(s). */
export type Selection = Record<string, string | string[] | null>;

// --- Config ------------------------------------------------------------------

const language = (def: 'TypeScript' | 'JavaScript' = 'JavaScript'): RadioRequiredGroupDef => ({
  id: 'language',
  label: 'Language',
  type: 'radio',
  required: true,
  default: def,
  options: [
    { id: 'TypeScript', label: 'TypeScript' },
    { id: 'JavaScript', label: 'JavaScript' },
  ],
});

export const FRAMEWORKS: FrameworkDef[] = [
  {
    // Full-stack combo: React (Vite) front end + Node back end + a database,
    // all in one container, wired together (Vite proxies /api → Node → DB).
    id: 'fullstack',
    label: 'Full Stack',
    groups: [
      language('JavaScript'),
      {
        id: 'express',
        label: 'Express',
        type: 'checkbox',
        required: false,
        default: [],
        options: [{ id: 'express', label: 'Express' }],
      },
      {
        id: 'tailwind',
        label: 'Tailwind',
        type: 'checkbox',
        required: false,
        default: [],
        options: [{ id: 'tailwind', label: 'Tailwind CSS' }],
      },
      {
        id: 'shadcn',
        label: 'shadcn/ui',
        type: 'checkbox',
        required: false,
        default: [],
        options: [{ id: 'shadcn', label: 'shadcn/ui' }],
      },
      {
        // Required — a combo always provisions a database. All three engines
        // run in-container (MySQL via MariaDB, the drop-in wire-compatible server).
        id: 'database',
        label: 'Database',
        type: 'radio',
        required: true,
        default: 'PostgreSQL',
        options: [
          { id: 'PostgreSQL', label: 'PostgreSQL' },
          { id: 'MongoDB', label: 'MongoDB' },
          { id: 'MySQL', label: 'MySQL' },
        ],
      },
    ],
  },
  {
    id: 'react',
    label: 'React',
    groups: [
      language('JavaScript'),
      {
        id: 'bundler',
        label: 'Bundler',
        type: 'radio',
        required: true,
        default: 'Vite',
        options: [
          { id: 'Vite', label: 'Vite' },
          { id: 'Next.js', label: 'Next.js' },
        ],
      },
      {
        id: 'tailwind',
        label: 'Tailwind',
        type: 'checkbox',
        required: false,
        default: [],
        options: [{ id: 'tailwind', label: 'Tailwind CSS' }],
      },
      {
        id: 'shadcn',
        label: 'shadcn/ui',
        type: 'checkbox',
        required: false,
        default: [],
        options: [{ id: 'shadcn', label: 'shadcn/ui' }],
      },
    ],
  },
  {
    id: 'node',
    label: 'Node',
    groups: [
      language('JavaScript'),
      {
        id: 'express',
        label: 'Express',
        type: 'checkbox',
        required: false,
        default: [],
        options: [{ id: 'express', label: 'Express' }],
      },
      {
        id: 'database',
        label: 'Database',
        type: 'radio',
        required: false,
        default: null,
        options: [
          { id: 'PostgreSQL', label: 'PostgreSQL' },
          { id: 'MySQL', label: 'MySQL' },
          { id: 'MongoDB', label: 'MongoDB' },
        ],
      },
    ],
  },
  {
    id: 'python',
    label: 'Python',
    groups: [
      {
        id: 'framework',
        label: 'Framework',
        type: 'radio',
        required: false,
        default: null,
        options: [
          { id: 'FastAPI', label: 'FastAPI' },
          { id: 'Django', label: 'Django' },
          { id: 'Flask', label: 'Flask' },
        ],
      },
    ],
  },
  {
    id: 'golang',
    label: 'GoLang',
    groups: [
      {
        id: 'gin',
        label: 'Gin',
        type: 'checkbox',
        required: false,
        default: [],
        options: [{ id: 'gin', label: 'Gin' }],
      },
      {
        id: 'database',
        label: 'Database',
        type: 'radio',
        required: false,
        default: null,
        options: [
          { id: 'PostgreSQL', label: 'PostgreSQL' },
          { id: 'MongoDB', label: 'MongoDB' },
        ],
      },
    ],
  },
  {
    id: 'javascript',
    label: 'JavaScript',
    // Minimal plain-JS sandbox — no customization knobs.
    groups: [],
  },
  {
    id: 'cpp',
    label: 'C++',
    groups: [
      {
        id: 'standard',
        label: 'Standard',
        type: 'radio',
        required: true,
        default: 'C++20',
        options: [
          { id: 'C++17', label: 'C++17' },
          { id: 'C++20', label: 'C++20' },
        ],
      },
    ],
  },
];

/** Lookup by framework id (case-insensitive). */
export function getFramework(id: string): FrameworkDef | undefined {
  const lower = id.toLowerCase();
  return FRAMEWORKS.find((f) => f.id === lower);
}

/** Default selection a fresh session gets if the client posts `{}`. */
export function defaultSelection(framework: FrameworkDef): Selection {
  const sel: Selection = {};
  for (const g of framework.groups) {
    if (g.type === 'radio') sel[g.id] = g.default;
    else sel[g.id] = [...g.default];
  }
  return sel;
}

// --- Validation --------------------------------------------------------------

/** Build a zod schema for one group's value. */
function groupValueSchema(g: GroupDef): z.ZodTypeAny {
  const ids = g.options.map((o) => o.id) as [string, ...string[]];

  if (g.type === 'radio') {
    const optionSchema = z.enum(ids);
    return g.required
      ? optionSchema
      : optionSchema.nullable();
  }
  // checkbox — dedupe; `z.enum` already restricts the alphabet so a length
  // cap would only reject duplicates, which dedup already handles.
  return z.array(z.enum(ids)).transform((arr) => Array.from(new Set(arr)));
}

/**
 * Validate a selection against the framework's groups.
 *
 * - Unknown groups → ValidationError (strict).
 * - Missing required groups → filled from `default`.
 * - Missing optional groups → filled from `default` (null or []).
 * - Wrong types / unknown option ids → ValidationError.
 *
 * Returns a fully-populated, normalized Selection that's safe to persist.
 */
export function validateCustomization(
  frameworkId: string,
  selection: unknown,
): { framework: FrameworkDef; selection: Selection } {
  const framework = getFramework(frameworkId);
  if (!framework) {
    throw new ValidationError(`Unknown framework: ${frameworkId}`, {
      allowed: FRAMEWORKS.map((f) => f.id),
    });
  }

  // Treat null/undefined as empty.
  const raw =
    selection && typeof selection === 'object' && !Array.isArray(selection)
      ? (selection as Record<string, unknown>)
      : selection === null || selection === undefined
        ? {}
        : null;
  if (raw === null) {
    throw new ValidationError('customization must be an object', { received: typeof selection });
  }

  // Reject unknown group ids — keeps customization tight and predictable.
  const groupIds = new Set(framework.groups.map((g) => g.id));
  const unknownKeys = Object.keys(raw).filter((k) => !groupIds.has(k));
  if (unknownKeys.length > 0) {
    throw new ValidationError(`Unknown customization keys for ${framework.id}`, {
      unknown: unknownKeys,
      allowed: [...groupIds],
    });
  }

  const out: Selection = {};
  const fieldErrors: Record<string, string[]> = {};

  for (const g of framework.groups) {
    if (!(g.id in raw)) {
      // Missing → default.
      out[g.id] = g.type === 'radio' ? g.default : [...g.default];
      continue;
    }
    // Normalize "empty" sentinels the client may send for an unselected
    // optional control: "" for radios (cleared), null/undefined for either.
    // For optional groups these all mean "not chosen" → fall back to the
    // group's default. For required groups we let the schema below reject so
    // the user sees a precise field error.
    let value: unknown = raw[g.id];
    const isUnset =
      value === undefined ||
      value === null ||
      (g.type === 'radio' && value === '') ||
      (g.type === 'checkbox' && Array.isArray(value) && value.length === 0);
    if (isUnset && !g.required) {
      out[g.id] = g.type === 'radio' ? g.default : [...g.default];
      continue;
    }
    const parsed = groupValueSchema(g).safeParse(value);
    if (!parsed.success) {
      fieldErrors[g.id] = parsed.error.issues.map((i) => i.message);
      continue;
    }
    out[g.id] = parsed.data as Selection[string];
  }

  if (Object.keys(fieldErrors).length > 0) {
    throw new ValidationError('customization failed validation', { fieldErrors });
  }

  return { framework, selection: out };
}

// --- Public DTO --------------------------------------------------------------

/** Shape returned by `GET /config/frameworks`. Stable contract for the client. */
export function getFrameworksConfig(): { frameworks: FrameworkDef[] } {
  return { frameworks: FRAMEWORKS };
}

/**
 * Compact human-readable summary of a customization selection, used by the
 * Phase 22 "Past Sessions" list (where we don't want the client to fetch
 * `/config/frameworks` just to render history rows). Unknown framework or
 * malformed selection → empty string.
 */
export function summarizeCustomization(frameworkId: string, selection: unknown): string {
  const framework = getFramework(frameworkId);
  if (!framework) return '';
  if (!selection || typeof selection !== 'object') return '';
  const sel = selection as Record<string, unknown>;
  const parts: string[] = [];
  for (const g of framework.groups) {
    const v = sel[g.id];
    const optLabel = (id: string) => g.options.find((o) => o.id === id)?.label ?? id;
    if (g.type === 'radio') {
      if (typeof v === 'string' && v.length > 0) parts.push(optLabel(v));
    } else if (Array.isArray(v) && v.length > 0) {
      parts.push(v.filter((x): x is string => typeof x === 'string').map(optLabel).join(', '));
    }
  }
  return parts.join(' · ');
}
