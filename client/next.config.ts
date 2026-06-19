import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the production Docker image. Emits
  // `.next/standalone/server.js` with only the prod deps it needs, so the
  // runtime stage doesn't ship pnpm or the full node_modules tree.
  output: "standalone",
  // The shared contract (src/contracts/**) is authored as ESM TS with explicit
  // `.js` extensions on relative imports — the source-of-truth convention the
  // server enforces, and the sync script copies the files verbatim
  // (AUTO-GENERATED). Webpack and Turbopack both need to resolve `./foo.js`
  // to `./foo.ts` so the bundlers match TypeScript's "bundler" resolution.
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
