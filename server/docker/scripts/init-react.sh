#!/usr/bin/env bash
# init-react.sh — scaffolds a React project inside the per-session volume.
#
# Customization:
#   .language : "TypeScript" | "JavaScript"
#   .bundler  : "Vite" | "Next.js"
#   .tailwind : array — contains "tailwind" to enable
#   .shadcn   : array — contains "shadcn" to enable
#
# Output: PROGRESS lines to stdout. exec's the dev server bound to 0.0.0.0.

set -euo pipefail
# shellcheck source=lib/progress.sh
source /usr/local/bin/lib/progress.sh

require_cmd jq
require_cmd node
require_cmd npm

LANGUAGE=$(read_customization_key '.language' 'JavaScript')
BUNDLER=$(read_customization_key '.bundler' 'Vite')
USE_TAILWIND=0; customization_has '.tailwind' 'tailwind' && USE_TAILWIND=1
USE_SHADCN=0;   customization_has '.shadcn'   'shadcn'   && USE_SHADCN=1

progress init starting 1 "react / $BUNDLER / $LANGUAGE"

cd /sandbox

# ---- Resume branch -----------------------------------------------------------
if [ -f /sandbox/package.json ]; then
  progress resume running 10 "existing project detected, skipping scaffold"
  npm install --no-audit --no-fund || die "npm install failed during resume"
  progress resume done 90
else
  # ---- Fresh scaffold --------------------------------------------------------
  if [ "$BUNDLER" = "Next.js" ]; then
    # Same TTY problem as create-vite — `create-next-app` aborts silently in
    # non-interactive runs. Inline the minimal Next 14 App-Router template.
    progress create-next running 10
    IS_TS=0; [ "$LANGUAGE" = "TypeScript" ] && IS_TS=1
    EXT=jsx; [ "$IS_TS" = "1" ] && EXT=tsx

    mkdir -p app

    cat > package.json <<EOF
{
  "name": "sandbox",
  "private": true,
  "version": "0.0.0",
  "scripts": {
    "dev": "next dev -H 0.0.0.0 -p 3000",
    "build": "next build",
    "start": "next start -H 0.0.0.0 -p 3000"
  },
  "dependencies": {
    "next": "14.2.5",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  }$( [ "$IS_TS" = "1" ] && printf ',\n  "devDependencies": {\n    "typescript": "^5.5.0",\n    "@types/node": "^20.0.0",\n    "@types/react": "^18.3.0",\n    "@types/react-dom": "^18.3.0"\n  }' )
}
EOF

    cat > next.config.js <<'EOF'
/** @type {import('next').NextConfig} */
const previewBase = process.env.PREVIEW_BASE_DOMAIN;
const nextConfig = {
  reactStrictMode: true,
  // In subdomain mode every session has its own <uuid>.<base-domain> host.
  // Next 14.1+ blocks dev requests from unknown origins unless listed here.
  ...(previewBase ? { allowedDevOrigins: ['*.' + previewBase] } : {}),
};
module.exports = nextConfig;
EOF

    cat > "app/layout.${EXT}" <<EOF
export const metadata = { title: 'Sandbox' };

export default function RootLayout({ children }$( [ "$IS_TS" = "1" ] && printf ': { children: React.ReactNode }' )) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
EOF

    cat > "app/page.${EXT}" <<'EOF'
export default function Home() {
  return (
    <main style={{ fontFamily: 'system-ui', padding: 24 }}>
      <h1>Sandbox</h1>
      <p>Edit app/page to start coding.</p>
    </main>
  );
}
EOF

    if [ "$IS_TS" = "1" ]; then
      cat > tsconfig.json <<'EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
EOF
    fi

    progress create-next done 35
    progress npm-install running 40
    npm install --no-audit --no-fund >/tmp/install.log 2>&1 \
      || die "npm install failed: $(tail -5 /tmp/install.log)"
    progress npm-install done 65

    if [ "$USE_TAILWIND" = "1" ]; then
      progress tailwind running 70
      npm install -D tailwindcss@3 postcss autoprefixer >/tmp/tailwind.log 2>&1
      # Next 14 ships CommonJS configs by default — keep .js extensions here.
      cat > tailwind.config.js <<'EOF'
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
};
EOF
      cat > postcss.config.js <<'EOF'
module.exports = {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
EOF
      printf '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n' > app/globals.css
      # Re-emit layout with globals.css import so utilities actually load.
      cat > "app/layout.${EXT}" <<EOF
import './globals.css';
export const metadata = { title: 'Sandbox' };

export default function RootLayout({ children }$( [ "$IS_TS" = "1" ] && printf ': { children: React.ReactNode }' )) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
EOF
      progress tailwind done 78
    fi

    write_port 3000
    DEV_CMD=(npm run dev)
  else
    # Vite
    progress create-vite running 10
    # NOTE: we deliberately do NOT shell out to `create-vite` — modern versions
    # of the scaffolder are interactive-by-default and abort with "Operation
    # cancelled" when stdin is not a TTY, even with --yes. Inlining the (tiny)
    # template gives us deterministic, fast scaffolding with zero network.
    IS_TS=0; [ "$LANGUAGE" = "TypeScript" ] && IS_TS=1
    EXT=jsx; [ "$IS_TS" = "1" ] && EXT=tsx

    mkdir -p src
    cat > package.json <<EOF
{
  "name": "sandbox",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host 0.0.0.0 --port 5173",
    "build": "vite build",
    "preview": "vite preview --host 0.0.0.0"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.0",
    "vite": "^5.4.0"$( [ "$IS_TS" = "1" ] && printf ',\n    "typescript": "^5.5.0",\n    "@types/react": "^18.3.0",\n    "@types/react-dom": "^18.3.0"' )
  }
}
EOF

    # shadcn (Nova/radix preset) is built for Tailwind v4 and breaks on v3
    # (`@apply border-border` etc. only exist in v4). So whenever shadcn is
    # picked we force Tailwind on. Tailwind itself works fine in v4 standalone.
    [ "$USE_SHADCN" = "1" ] && USE_TAILWIND=1

    # vite.config — ESM-safe (package.json has "type":"module", so use
    # import.meta.url, NOT __dirname which is undefined in ESM). The `@` alias
    # is what every shadcn component imports through (`@/lib/utils`, `@/...`).
    # Tailwind v4 plugs into Vite directly via `@tailwindcss/vite` (no postcss
    # config, no tailwind.config — content is auto-detected).
    if [ "$USE_TAILWIND" = "1" ]; then
      cat > vite.config.js <<'EOF'
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Polling is REQUIRED — inotify on Docker volumes doesn't notify in-container
// processes about writes made via `docker exec tee`. HMR depends on this.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    host: '0.0.0.0',
    port: 5173,
    watch: { usePolling: true, interval: 200 },
    // The sandbox container is NOT reachable from the outside world directly:
    // - Localhost dev: only host-port-forwarded by us on 127.0.0.1.
    // - Subdomain prod: only reachable through Traefik, which performs all
    //   real authorization (per-session Host rule + TLS).
    // Vite's host-header check is just an extra dev guard that breaks every
    // time we add a new domain, so disable it. (See `allowedHosts` docs.)
    allowedHosts: true,
    // HMR is proxied through Traefik on 443 in subdomain mode; the dev client
    // must dial wss://<uuid>.<base-domain>:443, not the in-container port.
    // In localhost mode HMR uses the default in-container port — leave it.
    hmr: process.env.PREVIEW_BASE_DOMAIN
      ? { protocol: 'wss', clientPort: 443 }
      : undefined,
  },
});
EOF
    else
      cat > vite.config.js <<'EOF'
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Polling is REQUIRED — inotify on Docker volumes doesn't notify in-container
// processes about writes made via `docker exec tee`. HMR depends on this.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    host: '0.0.0.0',
    port: 5173,
    watch: { usePolling: true, interval: 200 },
    // The sandbox container is NOT reachable from the outside world directly:
    // - Localhost dev: only host-port-forwarded by us on 127.0.0.1.
    // - Subdomain prod: only reachable through Traefik, which performs all
    //   real authorization (per-session Host rule + TLS).
    // Vite's host-header check is just an extra dev guard that breaks every
    // time we add a new domain, so disable it. (See `allowedHosts` docs.)
    allowedHosts: true,
    // HMR is proxied through Traefik on 443 in subdomain mode; the dev client
    // must dial wss://<uuid>.<base-domain>:443, not the in-container port.
    // In localhost mode HMR uses the default in-container port — leave it.
    hmr: process.env.PREVIEW_BASE_DOMAIN
      ? { protocol: 'wss', clientPort: 443 }
      : undefined,
  },
});
EOF
    fi

    # Unquoted `EOF` so the shell expands ${EXT} → jsx | tsx in the body.
    cat > index.html <<EOF
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Sandbox</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.${EXT}"></script>
  </body>
</html>
EOF

    cat > "src/main.${EXT}" <<'EOF'
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
EOF

    cat > "src/App.${EXT}" <<'EOF'
export default function App() {
  return (
    <div style={{ fontFamily: 'system-ui', padding: 24 }}>
      <h1>Sandbox</h1>
      <p>Edit <code>src/App.{EXT}</code> to start coding.</p>
    </div>
  );
}
EOF
    # Replace the placeholder above with the real extension.
    sed -i "s/src\/App\.{EXT}/src\/App.${EXT}/" "src/App.${EXT}"

    # baseUrl + paths give the `@/*` alias for TypeScript tooling; the vite
    # alias above makes it resolve at build/dev time. shadcn requires both.
    if [ "$IS_TS" = "1" ]; then
      cat > tsconfig.json <<'EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src"]
}
EOF
    else
      # JS projects: jsconfig gives editors the same `@/*` resolution.
      cat > jsconfig.json <<'EOF'
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  }
}
EOF
    fi
    progress create-vite done 35

    progress npm-install running 40
    npm install --no-audit --no-fund >/tmp/install.log 2>&1 \
      || die "npm install failed: $(tail -5 /tmp/install.log)"
    progress npm-install done 65

    if [ "$USE_TAILWIND" = "1" ]; then
      progress tailwind running 70
      # Tailwind v4 — config-less. The `@tailwindcss/vite` plugin (wired into
      # vite.config above) auto-detects content; CSS is a single `@import`.
      # v4 is what `shadcn@latest` (Nova/radix) is built for, so picking it
      # here makes `npx shadcn@latest add <x>` work out of the box later.
      npm install -D tailwindcss@4 @tailwindcss/vite >/tmp/tailwind.log 2>&1 \
        || die "tailwind install failed: $(tail -5 /tmp/tailwind.log)"
      mkdir -p src
      printf '@import "tailwindcss";\n' > src/index.css
      # Import the stylesheet from the entry so utility classes actually load.
      if ! grep -q "./index.css" "src/main.${EXT}"; then
        sed -i "1i import './index.css';" "src/main.${EXT}"
      fi
      progress tailwind done 78
    fi

    # ---- shadcn/ui (Vite, Tailwind v4) -----------------------------------
    # Done HERE, before the dev server execs, so the heavy radix-ui + fonts
    # install never competes with Vite for the 1 GiB cap (that competition is
    # exactly what OOM-killed a runtime `npx shadcn init`). After this the
    # project is fully initialized: `npx shadcn@latest add <x>` only writes a
    # file + installs a small per-component dep, which fits comfortably.
    if [ "$USE_SHADCN" = "1" ]; then
      progress shadcn running 82 "shadcn setup"
      # `shadcn` (the CLI/preset) is itself a dep — the canonical index.css
      # below does `@import "shadcn/tailwind.css"`, resolved via its exports map.
      npm install class-variance-authority clsx tailwind-merge lucide-react \
        radix-ui tw-animate-css @fontsource-variable/geist shadcn \
        >/tmp/shadcn.log 2>&1 \
        || die "shadcn dep install failed: $(tail -5 /tmp/shadcn.log)"

      mkdir -p src/lib src/components/ui

      # cn() — the @/lib/utils helper every shadcn component imports.
      if [ "$IS_TS" = "1" ]; then
        cat > src/lib/utils.ts <<'EOF'
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
EOF
      else
        cat > src/lib/utils.js <<'EOF'
import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}
EOF
      fi

      # components.json — what `npx shadcn add` reads to know where things go.
      TSX_FLAG=false; [ "$IS_TS" = "1" ] && TSX_FLAG=true
      cat > components.json <<EOF
{
  "\$schema": "https://ui.shadcn.com/schema.json",
  "style": "radix-nova",
  "rsc": false,
  "tsx": ${TSX_FLAG},
  "tailwind": {
    "config": "",
    "css": "src/index.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "rtl": false,
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "menuColor": "default",
  "menuAccent": "subtle",
  "registries": {}
}
EOF

      # Canonical index.css generated by `shadcn init` for the Nova preset on
      # Tailwind v4 (theme tokens + light/dark CSS variables). Overwrites the
      # bare `@import "tailwindcss"` written by the tailwind block above.
      cat > src/index.css <<'EOF'
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";
@import "@fontsource-variable/geist";

@custom-variant dark (&:is(.dark *));

@theme inline {
    --font-heading: var(--font-sans);
    --font-sans: 'Geist Variable', sans-serif;
    --color-sidebar-ring: var(--sidebar-ring);
    --color-sidebar-border: var(--sidebar-border);
    --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
    --color-sidebar-accent: var(--sidebar-accent);
    --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
    --color-sidebar-primary: var(--sidebar-primary);
    --color-sidebar-foreground: var(--sidebar-foreground);
    --color-sidebar: var(--sidebar);
    --color-chart-5: var(--chart-5);
    --color-chart-4: var(--chart-4);
    --color-chart-3: var(--chart-3);
    --color-chart-2: var(--chart-2);
    --color-chart-1: var(--chart-1);
    --color-ring: var(--ring);
    --color-input: var(--input);
    --color-border: var(--border);
    --color-destructive: var(--destructive);
    --color-accent-foreground: var(--accent-foreground);
    --color-accent: var(--accent);
    --color-muted-foreground: var(--muted-foreground);
    --color-muted: var(--muted);
    --color-secondary-foreground: var(--secondary-foreground);
    --color-secondary: var(--secondary);
    --color-primary-foreground: var(--primary-foreground);
    --color-primary: var(--primary);
    --color-popover-foreground: var(--popover-foreground);
    --color-popover: var(--popover);
    --color-card-foreground: var(--card-foreground);
    --color-card: var(--card);
    --color-foreground: var(--foreground);
    --color-background: var(--background);
    --radius-sm: calc(var(--radius) * 0.6);
    --radius-md: calc(var(--radius) * 0.8);
    --radius-lg: var(--radius);
    --radius-xl: calc(var(--radius) * 1.4);
    --radius-2xl: calc(var(--radius) * 1.8);
    --radius-3xl: calc(var(--radius) * 2.2);
    --radius-4xl: calc(var(--radius) * 2.6);
}

:root {
    --background: oklch(1 0 0);
    --foreground: oklch(0.145 0 0);
    --card: oklch(1 0 0);
    --card-foreground: oklch(0.145 0 0);
    --popover: oklch(1 0 0);
    --popover-foreground: oklch(0.145 0 0);
    --primary: oklch(0.205 0 0);
    --primary-foreground: oklch(0.985 0 0);
    --secondary: oklch(0.97 0 0);
    --secondary-foreground: oklch(0.205 0 0);
    --muted: oklch(0.97 0 0);
    --muted-foreground: oklch(0.556 0 0);
    --accent: oklch(0.97 0 0);
    --accent-foreground: oklch(0.205 0 0);
    --destructive: oklch(0.577 0.245 27.325);
    --border: oklch(0.922 0 0);
    --input: oklch(0.922 0 0);
    --ring: oklch(0.708 0 0);
    --chart-1: oklch(0.87 0 0);
    --chart-2: oklch(0.556 0 0);
    --chart-3: oklch(0.439 0 0);
    --chart-4: oklch(0.371 0 0);
    --chart-5: oklch(0.269 0 0);
    --radius: 0.625rem;
    --sidebar: oklch(0.985 0 0);
    --sidebar-foreground: oklch(0.145 0 0);
    --sidebar-primary: oklch(0.205 0 0);
    --sidebar-primary-foreground: oklch(0.985 0 0);
    --sidebar-accent: oklch(0.97 0 0);
    --sidebar-accent-foreground: oklch(0.205 0 0);
    --sidebar-border: oklch(0.922 0 0);
    --sidebar-ring: oklch(0.708 0 0);
}

.dark {
    --background: oklch(0.145 0 0);
    --foreground: oklch(0.985 0 0);
    --card: oklch(0.205 0 0);
    --card-foreground: oklch(0.985 0 0);
    --popover: oklch(0.205 0 0);
    --popover-foreground: oklch(0.985 0 0);
    --primary: oklch(0.922 0 0);
    --primary-foreground: oklch(0.205 0 0);
    --secondary: oklch(0.269 0 0);
    --secondary-foreground: oklch(0.985 0 0);
    --muted: oklch(0.269 0 0);
    --muted-foreground: oklch(0.708 0 0);
    --accent: oklch(0.269 0 0);
    --accent-foreground: oklch(0.985 0 0);
    --destructive: oklch(0.704 0.191 22.216);
    --border: oklch(1 0 0 / 10%);
    --input: oklch(1 0 0 / 15%);
    --ring: oklch(0.556 0 0);
    --chart-1: oklch(0.87 0 0);
    --chart-2: oklch(0.556 0 0);
    --chart-3: oklch(0.439 0 0);
    --chart-4: oklch(0.371 0 0);
    --chart-5: oklch(0.269 0 0);
    --sidebar: oklch(0.205 0 0);
    --sidebar-foreground: oklch(0.985 0 0);
    --sidebar-primary: oklch(0.488 0.243 264.376);
    --sidebar-primary-foreground: oklch(0.985 0 0);
    --sidebar-accent: oklch(0.269 0 0);
    --sidebar-accent-foreground: oklch(0.985 0 0);
    --sidebar-border: oklch(1 0 0 / 10%);
    --sidebar-ring: oklch(0.556 0 0);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
    }
  body {
    @apply bg-background text-foreground;
    }
  html {
    @apply font-sans;
    }
}
EOF

      # Preinstall a Button so a FRESH shadcn session ships a working component
      # — the candidate shouldn't have to run any setup to use shadcn. This runs
      # before the dev server starts (low memory) and is version-consistent with
      # the Nova theme we wrote above. Non-fatal: if the registry is unreachable
      # the session still boots and the candidate can add components later.
      if npx shadcn@latest add button -y -o >/tmp/shadcn-add.log 2>&1 \
         && [ -f "src/components/ui/button.${EXT}" ]; then
        cat > "src/App.${EXT}" <<'EOF'
import { Button } from '@/components/ui/button';

export default function App() {
  return (
    <div className="bg-background text-foreground min-h-screen space-y-4 p-8">
      <h1 className="text-3xl font-bold">Sandbox</h1>
      <p className="text-muted-foreground">Tailwind + shadcn/ui are ready.</p>
      <Button>shadcn Button</Button>
    </div>
  );
}
EOF
      else
        progress shadcn running 86 "button preinstall skipped (registry?)"
      fi
      progress shadcn done 88
    fi

    # Bind Vite to 0.0.0.0:5173
    npm pkg set scripts.dev="vite --host 0.0.0.0 --port 5173" >/dev/null
    write_port 5173
    DEV_CMD=(npm run dev)
  fi
fi

progress ready done 100 "starting dev server"
# shellcheck disable=SC2086
exec "${DEV_CMD[@]:-npm run dev}"
