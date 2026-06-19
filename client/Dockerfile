# syntax=docker/dockerfile:1.7
# ----------------------------------------------------------------------------
# interview-sandbox-client — multi-stage production image.
#
# Stages:
#   1) deps   — install all deps (incl. dev) for the build (cached layer)
#   2) build  — next build (output: 'standalone'), bakes NEXT_PUBLIC_* values
#   3) run    — slim runtime image, non-root, serves the standalone bundle
#
# NEXT_PUBLIC_API_URL and NEXT_PUBLIC_WS_URL must be supplied as --build-arg
# (compose passes them via `build.args`). Next.js inlines NEXT_PUBLIC_* at
# BUILD time, so they cannot be set as runtime env on the run stage.
# ----------------------------------------------------------------------------

# ---- 1) deps ---------------------------------------------------------------
# `--platform=$BUILDPLATFORM` forces the deps + build stages to run on the
# HOST architecture even when buildx targets a different one (e.g. building
# for linux/amd64 on an Apple Silicon laptop). Without this, Next.js's SWC
# compiler runs under qemu-x86_64 emulation and segfaults on `pnpm build`
# ("qemu-x86_64: QEMU internal SIGSEGV", exit 139).
FROM --platform=$BUILDPLATFORM node:20-bookworm-slim AS deps
WORKDIR /app
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm-store-client,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile

# ---- 2) build --------------------------------------------------------------
FROM --platform=$BUILDPLATFORM node:20-bookworm-slim AS build
WORKDIR /app
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true \
    NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# Bring deps over from the build-platform deps stage (these are the host
# arch's binaries — that's what we want for the build itself).
COPY --from=deps /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml ./

# Build-time public URLs. Defaults are localhost so a bare `docker build` still
# produces a runnable image for smoke testing. In real deploys compose passes
# `https://api.<domain>` and `wss://api.<domain>`.
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ARG NEXT_PUBLIC_WS_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL

COPY tsconfig.json next.config.ts postcss.config.mjs components.json eslint.config.mjs ./
COPY public ./public
COPY src ./src
COPY scripts ./scripts
RUN pnpm build

# Next.js's standalone tracer bundles the SWC binary for the build platform.
# When TARGETPLATFORM ≠ BUILDPLATFORM (cross-arch build), pull in the
# target's SWC binary so the runtime image has the right one. No-op when
# BUILDPLATFORM == TARGETPLATFORM (`pnpm add` is a fast metadata check).
ARG TARGETOS
ARG TARGETARCH
RUN case "${TARGETOS}/${TARGETARCH}" in \
      linux/amd64) SWC_PKG=@next/swc-linux-x64-gnu ;; \
      linux/arm64) SWC_PKG=@next/swc-linux-arm64-gnu ;; \
      *) SWC_PKG="" ;; \
    esac && \
    if [ -n "$SWC_PKG" ]; then \
      NEXT_VER=$(node -p "require('next/package.json').version") && \
      mkdir -p /tmp/swc && cd /tmp/swc && \
      npm pack --silent "${SWC_PKG}@${NEXT_VER}" && \
      mkdir -p /tmp/swc/extracted && \
      tar -xzf *.tgz -C /tmp/swc/extracted && \
      mkdir -p /app/.next/standalone/node_modules/${SWC_PKG} && \
      cp -R /tmp/swc/extracted/package/* /app/.next/standalone/node_modules/${SWC_PKG}/ && \
      rm -rf /tmp/swc && cd /app ; \
    fi

# ---- 3) run ----------------------------------------------------------------
# No --platform here — this stage is the TARGETPLATFORM (the arch the VPS runs).
FROM node:20-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

# Dedicated non-root user.
RUN groupadd --system --gid 10001 app && \
    useradd  --system --uid 10001 --gid app --home-dir /app --shell /usr/sbin/nologin app

# Standalone bundle includes server.js + the minimal node_modules it needs.
# `.next/static` and `public/` are NOT copied by the standalone trace — copy them in.
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static     ./.next/static
COPY --from=build --chown=app:app /app/public            ./public

USER app
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
