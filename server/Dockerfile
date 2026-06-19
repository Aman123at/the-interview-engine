# syntax=docker/dockerfile:1.7
# ----------------------------------------------------------------------------
# interview-sandbox-server — multi-stage production image.
#
# Stages:
#   1) deps   — install all deps (incl. dev) for the build (cached layer)
#   2) build  — tsc → dist/, then prune to production deps
#   3) run    — slim runtime image, non-root, runs migrate then starts server
#
# Docker access is via DOCKER_HOST (e.g. tcp://dockerproxy:2375). This image
# does NOT need the docker unix socket and should NOT be given /var/run/docker.sock.
# ----------------------------------------------------------------------------

# ---- 1) deps ---------------------------------------------------------------
FROM node:20-bookworm-slim AS deps
WORKDIR /app
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile

# ---- 2) build --------------------------------------------------------------
FROM deps AS build
WORKDIR /app
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
# The `docker/` directory carries the per-framework sandbox Dockerfiles +
# init scripts + `build-all.sh`. The Node server doesn't import it at runtime
# (Phase 5 contract: nothing under src/ touches docker/), but it MUST land on
# the VPS so an operator can build the sandbox base images that dockerode
# launches at session-create time. Bundling it inside the server image is the
# cleanest delivery channel — no separate sync of scripts to the VPS.
COPY docker ./docker
RUN pnpm build
# Migrations are plain .sql files — tsc doesn't copy them. Mirror them next
# to the compiled migrate.js so MIGRATIONS_DIR (= __dirname/migrations) resolves.
RUN cp -R src/db/migrations dist/db/migrations
# Prune devDependencies for the runtime stage.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm prune --prod

# ---- 3) run ----------------------------------------------------------------
FROM node:20-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production \
    PORT=4000

# Run as a dedicated non-root user.
RUN groupadd --system --gid 10001 app && \
    useradd  --system --uid 10001 --gid app --home-dir /app --shell /usr/sbin/nologin app

# Just dist + production node_modules + package.json (for "type": "module").
COPY --from=build --chown=app:app /app/package.json ./package.json
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/dist ./dist
# Ship the sandbox Dockerfiles + init scripts + build-all.sh so the VPS can
# `docker compose cp server:/app/docker ./docker` (or `docker exec`) and run
# `./docker/scripts/build-all.sh` to materialize the per-framework base images.
COPY --from=build --chown=app:app /app/docker ./docker
COPY --chown=app:app docker/server-entrypoint.sh /usr/local/bin/server-entrypoint
RUN chmod +x /usr/local/bin/server-entrypoint /app/docker/scripts/*.sh 2>/dev/null || true

USER app
EXPOSE 4000

# Container-level healthcheck mirrors compose-level /readyz so a misconfigured
# DOCKER_HOST or DB outage surfaces as "unhealthy".
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/server-entrypoint"]
CMD ["node", "dist/server.js"]
