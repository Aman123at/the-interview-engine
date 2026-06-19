import { describe, it, expect } from 'vitest';
import {
  FRAMEWORKS,
  defaultSelection,
  getFramework,
  validateCustomization,
} from './frameworkConfig.js';
import { ValidationError } from '@/errors/index.js';

describe('framework config', () => {
  it('exposes the expected frameworks', () => {
    expect(FRAMEWORKS.map((f) => f.id).sort()).toEqual(
      ['react', 'node', 'python', 'golang', 'javascript', 'cpp', 'fullstack'].sort(),
    );
  });

  it('encodes the full-stack combo: required database radio (default Postgres) + express/tailwind/shadcn checkboxes', () => {
    const f = getFramework('fullstack')!;
    const g = Object.fromEntries(f.groups.map((x) => [x.id, x]));
    expect(g.database?.type).toBe('radio');
    expect((g.database as { required?: boolean })?.required).toBe(true);
    expect((g.database as { default?: string })?.default).toBe('PostgreSQL');
    expect(g.express?.type).toBe('checkbox');
    expect(g.tailwind?.type).toBe('checkbox');
    expect(g.shadcn?.type).toBe('checkbox');
    // DB required → an explicit null is rejected (a missing group is filled
    // from the default, per validateCustomization semantics).
    expect(() => validateCustomization('fullstack', { database: null })).toThrow(ValidationError);
    // A valid combo selection passes and is normalized.
    const { selection } = validateCustomization('fullstack', {
      language: 'TypeScript', express: ['express'], database: 'MongoDB',
    });
    expect(selection.database).toBe('MongoDB');
  });

  it('encodes React: language radio (req, default JS), bundler radio (req, default Vite), tailwind + shadcn checkboxes (optional)', () => {
    const f = getFramework('react')!;
    const g = Object.fromEntries(f.groups.map((x) => [x.id, x]));
    expect(g.language?.type).toBe('radio');
    expect(g.language && 'default' in g.language && g.language.default).toBe('JavaScript');
    expect(g.bundler && 'default' in g.bundler && g.bundler.default).toBe('Vite');
    expect(g.tailwind?.type).toBe('checkbox');
    expect(g.shadcn?.type).toBe('checkbox');
  });

  it('Node database is OPTIONAL radio, default null', () => {
    const db = getFramework('node')!.groups.find((g) => g.id === 'database')!;
    expect(db.type).toBe('radio');
    expect(db.required).toBe(false);
    expect(db.type === 'radio' && db.default).toBeNull();
  });

  it('Python framework is OPTIONAL radio, default null', () => {
    const f = getFramework('python')!;
    expect(f.groups).toHaveLength(1);
    const g = f.groups[0]!;
    expect(g.type).toBe('radio');
    expect(g.required).toBe(false);
    expect(g.type === 'radio' && g.default).toBeNull();
  });

  it('JavaScript has no customization groups', () => {
    expect(getFramework('javascript')!.groups).toEqual([]);
  });

  it('C++ standard is REQUIRED radio, default C++20', () => {
    const g = getFramework('cpp')!.groups[0]!;
    expect(g.type).toBe('radio');
    expect(g.required).toBe(true);
    expect(g.type === 'radio' && g.default).toBe('C++20');
  });
});

describe('defaultSelection', () => {
  it('produces a complete selection for React', () => {
    const sel = defaultSelection(getFramework('react')!);
    expect(sel).toEqual({
      language: 'JavaScript',
      bundler: 'Vite',
      tailwind: [],
      shadcn: [],
    });
  });

  it('produces null for optional radios with no default', () => {
    const sel = defaultSelection(getFramework('python')!);
    expect(sel).toEqual({ framework: null });
  });
});

describe('validateCustomization — happy paths', () => {
  it('accepts a fully-specified React selection', () => {
    const { selection } = validateCustomization('react', {
      language: 'TypeScript',
      bundler: 'Next.js',
      tailwind: ['tailwind'],
      shadcn: [],
    });
    expect(selection).toEqual({
      language: 'TypeScript',
      bundler: 'Next.js',
      tailwind: ['tailwind'],
      shadcn: [],
    });
  });

  it('fills in defaults for missing groups', () => {
    const { selection } = validateCustomization('react', { bundler: 'Vite' });
    expect(selection).toEqual({
      language: 'JavaScript',
      bundler: 'Vite',
      tailwind: [],
      shadcn: [],
    });
  });

  it('accepts an empty object → returns full defaults', () => {
    const { selection } = validateCustomization('cpp', {});
    expect(selection).toEqual({ standard: 'C++20' });
  });

  it('accepts null Python framework (optional radio left blank)', () => {
    const { selection } = validateCustomization('python', { framework: null });
    expect(selection).toEqual({ framework: null });
  });

  it('accepts JavaScript with empty selection', () => {
    const { selection } = validateCustomization('javascript', {});
    expect(selection).toEqual({});
  });

  it('framework lookup is case-insensitive', () => {
    expect(() => validateCustomization('React', {})).not.toThrow();
  });

  it('dedupes checkbox arrays', () => {
    const { selection } = validateCustomization('react', { tailwind: ['tailwind', 'tailwind'] });
    expect(selection.tailwind).toEqual(['tailwind']);
  });
});

describe('validateCustomization — rejection paths', () => {
  it('rejects an unknown framework', () => {
    expect(() => validateCustomization('rust', {})).toThrow(ValidationError);
  });

  it('rejects unknown group keys', () => {
    expect(() => validateCustomization('react', { redux: 'yes' })).toThrow(/Unknown customization keys/);
  });

  it('rejects an unknown option id on a radio', () => {
    expect(() => validateCustomization('react', { language: 'Rust' })).toThrow(ValidationError);
  });

  it('rejects null on a REQUIRED radio', () => {
    expect(() => validateCustomization('react', { language: null })).toThrow(ValidationError);
  });

  it('rejects an unknown option id on a checkbox', () => {
    expect(() => validateCustomization('react', { tailwind: ['bootstrap'] })).toThrow(
      ValidationError,
    );
  });

  it('rejects a string on a checkbox group', () => {
    expect(() => validateCustomization('react', { tailwind: 'tailwind' })).toThrow(
      ValidationError,
    );
  });

  it('rejects a non-object customization', () => {
    expect(() => validateCustomization('react', 'whatever')).toThrow(/must be an object/);
  });

  it('accepts undefined/null customization as empty (uses all defaults)', () => {
    expect(validateCustomization('react', undefined).selection.language).toBe('JavaScript');
    expect(validateCustomization('react', null).selection.bundler).toBe('Vite');
  });
});
