# interview-sandbox-server

Backend API + realtime layer + container orchestration for the Technical Interview Sandbox Platform.
Separate from the Next.js client (`interview-sandbox-client`). Localhost-only for v1.

## Stack

- Node.js + TypeScript (strict)
- Express (HTTP) + socket.io (realtime, rooms)
- PostgreSQL + Drizzle ORM (added in Phase 1)
- Docker + shell init scripts (added in Phase 5)
- pino for structured logging, zod for validation
- pnpm

## Deployment assumptions (v1)

- Localhost only — no public domain, no TLS
- Docker daemon runs on the same host as this API and is always available
- Max 20 concurrent users, exactly **one session per user** (hard rule)
- Storage on local disk: named Docker volumes + Postgres durable copy of source

## Quick start

```bash
pnpm install
cp .env.example .env       # adjust as needed
pnpm dev                   # tsx watch src/server.ts
```

Health checks:

- `GET http://localhost:4000/healthz`
- `GET http://localhost:4000/readyz`

## Scripts

| Script              | What it does                                              |
| ------------------- | --------------------------------------------------------- |
| `pnpm dev`          | Run server with hot reload (`tsx`)                        |
| `pnpm build`        | Compile TypeScript to `dist/`                             |
| `pnpm start`        | Run compiled server                                       |
| `pnpm typecheck`    | TypeScript no-emit check                                  |
| `pnpm lint`         | Alias for `typecheck` (strict TS is our lint layer)       |
| `pnpm test`         | vitest unit tests (auth + framework config)               |
| `pnpm migrate`      | Apply pending DB migrations                               |
| `pnpm migrate:rollback` | Roll back the most recent migration                   |
| `pnpm seed`         | Upsert `SEED_USERS` into the DB                           |

End-to-end verification scripts (require live Postgres + Docker):

```bash
npx tsx scripts/verify-one-session.ts      # Phase 1 — hard one-session rule at the DB
npx tsx scripts/verify-ws-reconnect.ts     # Phase 7 — socket reconnect + file/PTY resync
npx tsx scripts/verify-preview-hmr.ts      # Phase 9 — Vite + Next.js HMR over the port-forward
npx tsx scripts/verify-close-resume.ts     # Phase 11 — close → recoverable → resume
npx tsx scripts/verify-full-flow.ts        # Phase 12 — critical-path E2E end-to-end
```

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the system diagram + sequence
diagrams for create, reconnect, resume, and close.

## Client API contract

The React client (`interview-sandbox-client`) consumes these endpoints +
socket events. Phase-11 onboarding doc for the client team:
[CHANGES_PHASE11.md](./CHANGES_PHASE11.md).

## Folder layout

```
src/
  config/      env loading + zod validation
  db/          Drizzle connection + schema + migrations (Phase 1)
  dal/         Data Access Layer — one file per entity (Phase 1)
  services/    business logic
  ws/          socket.io server + handlers
  routes/      HTTP route handlers
  middleware/  auth, validation, error handling
  docker/      dockerode integration + image build helpers
  utils/       logger, shutdown, helpers
  errors/      AppError + subclasses
  app.ts       Express app factory
  server.ts    entrypoint
docker/        Dockerfiles + shell init scripts (Phase 5)
```

## Conventions

- **All DB access goes through the DAL.** No raw queries in services/routes/ws.
- Throw `AppError` subclasses for known failures; the global error handler renders them.
- Validate every external input with zod. Validation errors → 400.
- Log with `req.log` inside handlers (request-scoped, carries `requestId`).
- Never log secrets — `pino` redacts auth headers, cookies, and `password`/`token` fields.
- Graceful shutdown drains HTTP → socket.io → containers → DB pool, then exits.

## CLAUDE.md

See [CLAUDE.md](./CLAUDE.md) for the running phase checklist and project conventions Claude should follow.
