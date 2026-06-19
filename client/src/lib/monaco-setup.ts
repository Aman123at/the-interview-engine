/**
 * Global Monaco editor configuration for sandbox file editing.
 *
 * The default TypeScript/JavaScript language service does FULL semantic
 * validation — including module resolution, type checking, and lib-d.ts
 * inference — against each model in isolation. Without a project context
 * (no tsconfig, no node_modules) this flags every `import` as missing,
 * every JSX tag as undefined, every React-typed value as broken: a wall of
 * red squigglies for code that's perfectly valid inside the container.
 *
 * For our use case the real type checker is the one running inside the
 * sandbox (via the dev server / tsc). Monaco only needs to provide a nice
 * editing experience. So:
 *
 *  - Semantic validation OFF       (no false-positive type errors)
 *  - Suggestion diagnostics OFF    (no "you might have meant X")
 *  - Syntax validation ON          (still catches real typos: missing braces,
 *                                   `const x =` without RHS, etc.)
 *  - JSX configured for React      (parses .tsx/.jsx correctly)
 *  - esModuleInterop + allowSyntheticDefaultImports ON
 *                                  (so default-style imports parse cleanly)
 *
 * Called from the editor's `beforeMount` callback. Idempotent — calling
 * twice is harmless; the second call is a no-op.
 */

import type { Monaco } from "@monaco-editor/react";

let configured = false;

export function setupMonaco(monaco: Monaco): void {
  if (configured) return;
  configured = true;

  const tsDefaults = monaco.languages.typescript.typescriptDefaults;
  const jsDefaults = monaco.languages.typescript.javascriptDefaults;

  // ---- Diagnostics ----
  const diagnosticsOptions = {
    noSemanticValidation: true,
    noSuggestionDiagnostics: true,
    noSyntaxValidation: false,
  };
  tsDefaults.setDiagnosticsOptions(diagnosticsOptions);
  jsDefaults.setDiagnosticsOptions(diagnosticsOptions);

  // ---- Compiler options ----
  // ScriptTarget.Latest and JsxEmit.React are the modern, broadly-compatible
  // defaults. esModuleInterop lets `import React from "react"` parse.
  const compilerOptions = {
    target: monaco.languages.typescript.ScriptTarget.Latest,
    allowNonTsExtensions: true,
    moduleResolution:
      monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    module: monaco.languages.typescript.ModuleKind.ESNext,
    jsx: monaco.languages.typescript.JsxEmit.React,
    allowJs: true,
    checkJs: false,
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    resolveJsonModule: true,
    noEmit: true,
    strict: false,
    skipLibCheck: true,
    isolatedModules: true,
  };
  tsDefaults.setCompilerOptions(compilerOptions);
  jsDefaults.setCompilerOptions(compilerOptions);
}
