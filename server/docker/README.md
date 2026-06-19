# `docker/` — sandbox base images, init scripts, run flags

This directory is the contract between the server's container orchestrator
(Phase 6) and the per-session containers it runs. **It is intentionally
decoupled from the API code** — nothing under `src/` imports anything from
here. The orchestrator just shells out to `docker run …` with the flags
documented below and parses the per-line `PROGRESS …` markers the init
script emits.

---

## Prebuilt-vs-init split

**The hard rule:** heavy, slow, deterministic work happens at **image build
time**. Per-session, user-customizable, light work happens at **container
start time** via an init script.

| At build time (slow, once)                                                         | At container start (per session, fast-ish)                                  |
|------------------------------------------------------------------------------------|------------------------------------------------------------------------------|
| Pull base distro, install language runtime (node, python, go, g++)                 | Read the user's customization JSON                                           |
| Install package manager + global tooling (npm/pnpm, pip, go modules cache)         | Run scaffolder (`create-vite`, `create-next-app`, `npm init`, `go mod init`) |
| Prime caches — `create-vite` / `create-next-app` tarballs, common pip wheels       | `npm install` / `pip install` the chosen libraries                           |
| Install `jq`, `tini`, `curl`, common Unix tools                                    | Write starter source files                                                   |
| Create non-root user, set WORKDIR, ENTRYPOINT                                      | Set the dev-server bind to `0.0.0.0` + record port in `/sandbox/.port`       |
| Health-check definition                                                             | `exec` the dev server (so it inherits PID 1)                                 |

**Why a single base per framework instead of one image per permutation?**
There are 6 frameworks × ~24 reasonable option combos = 144 images. Building
and storing 144 images on every option change is wasteful and slow. A
single base per framework + an init script gives us:

1. **Storage**: ~6 images instead of ~144. ~2 GB on disk instead of ~50 GB.
2. **Build pipeline**: 6 builds in CI instead of 144.
3. **Cache hit rate**: the expensive layers (runtime + global tools) are
   shared across every session.
4. **Init takes time, but that's fine**: the loader UI streams `PROGRESS …`
   lines from the container while init scaffolds. The user sees a moving
   progress bar instead of "preparing image…" for minutes. **Once init
   finishes the session is instant** — the dev server is already running.

The trade-off: cold start of a session is ~30–120s depending on framework
(npm/pip install dominates). Acceptable for an interview platform where the
interviewer kicks off the session before the candidate joins.

---

## Base images (6)

| Framework  | Image tag                            | Base                       | Dev-server default port |
|-----------|--------------------------------------|----------------------------|--------------------------|
| React      | `interview-sandbox-react:latest`     | `node:20-bookworm-slim`    | 5173 (Vite) / 3000 (Next.js) |
| Node       | `interview-sandbox-node:latest`      | `node:20-bookworm-slim`    | 3000                     |
| Python     | `interview-sandbox-python:latest`    | `python:3.12-slim-bookworm`| 8000 (FastAPI/Django) / 5000 (Flask) |
| GoLang     | `interview-sandbox-golang:latest`    | `golang:1.22-bookworm`     | 8080                     |
| JavaScript | `interview-sandbox-javascript:latest`| `node:20-bookworm-slim`    | 8080                     |
| C++        | `interview-sandbox-cpp:latest`       | `debian:bookworm-slim`+g++ | _none — terminal only_   |

The **definitive** dev-server port for a started container is whatever it
writes to `/sandbox/.port` — that's the one the orchestrator publishes to
the host. The table above is the default the init script will pick if
customization doesn't change it. C++ never serves a port; the candidate
compiles + runs from the integrated terminal.

Build all:
```bash
bash docker/scripts/build-all.sh
```

Verify (boots + scaffolds a representative project per image):
```bash
bash docker/scripts/verify-images.sh
```

---

## Volume layout (storage on local disk only)

**One named Docker volume per session.** No host bind mounts. Ever. (See
"Run flags" below — bind mounts are explicitly forbidden because they let
container code escape into the host filesystem.)

```
Volume name:   isb_session_<sessionId>
Mount point:   /sandbox            (inside the container, WORKDIR)
Host path:     /var/lib/docker/volumes/isb_session_<sessionId>/_data
                 (Linux; on Docker Desktop macOS/Windows the path lives
                  inside the Docker VM — same logical guarantee)
```

The session volume holds **everything** the candidate produces:

```
/sandbox/
  package.json         ← project root
  src/                 ← source
  node_modules/        ← (or .venv/, vendor/, etc. — heavy, NOT durably backed up)
  .port                ← dev-server port the orchestrator should publish
  .progress.jsonl      ← optional duplicate of stdout PROGRESS lines (for resume)
```

**Durable copy in Postgres.** Phase 1 added `session_files` for a durable
**source-only** copy keyed by `(session_id, path)`. On save / close (Phase 11)
the file-sync layer walks `/sandbox` with **`.gitignore` semantics + a hard
`node_modules`/`.venv`/`vendor` exclude** and upserts each file's contents
into Postgres. On resume, we rebuild the volume from Postgres and the init
script's "skip scaffolding if /sandbox/package.json exists" branch restores
the working state, then `npm install` / `pip install` re-hydrates the heavy
deps. Net effect: **interview state survives a host restart**; node_modules
does not, but a re-install rebuilds it in ~30s.

Cleanup: Phase 11 deletes the volume on `session.status='ended'` after the
durable copy is confirmed in Postgres.

---

## Run flags (the security contract)

This is the **exact** flag set the Phase 6 orchestrator MUST use. Any
deviation is a security regression and should be caught in code review.

```bash
docker run -d \
  --name            isb_session_<sessionId> \
  --hostname        sandbox \
  --user            10001:10001 \
  --memory          1g \
  --memory-swap     1g          # disables swap (same as memory)
  --cpus            1.0 \
  --pids-limit      256 \
  --ulimit          nofile=1024:2048 \
  --cap-drop        ALL \
  --security-opt    no-new-privileges:true \
  --read-only \
  --tmpfs           /tmp:rw,size=64m,mode=1777,nosuid,nodev \
  --tmpfs           /home/sandbox/.cache:rw,size=256m,mode=0700,uid=10001,gid=10001 \
  --tmpfs           /home/sandbox/.npm:rw,size=256m,mode=0700,uid=10001,gid=10001 \
  -v                isb_session_<sessionId>:/sandbox \
  -p                <hostPort>:<containerPort> \
  --network         bridge \
  --init \
  --restart         no \
  -e                CUSTOMIZATION='<JSON>' \
  -e                FRAMEWORK='<react|node|python|golang|javascript|cpp>' \
  interview-sandbox-<framework>:latest
```

### Why each flag

| Flag                                          | What it buys                                                                          |
|-----------------------------------------------|----------------------------------------------------------------------------------------|
| `--user 10001:10001`                          | Non-root inside the container — confines a code-exec escape to an unprivileged uid   |
| `--memory 1g` + `--memory-swap 1g`            | Hard 1 GB cap, no swap — kills runaway compilations                                  |
| `--cpus 1.0`                                  | 1 vCPU equivalent — neighbours stay responsive                                       |
| `--pids-limit 256`                            | Fork-bomb protection; Vite/Next dev needs ~50 pids steady-state, 256 is comfortable  |
| `--ulimit nofile=1024:2048`                   | FD cap — webpack/Vite watcher fits inside 1024                                       |
| `--cap-drop ALL`                              | Drops every Linux capability; **we add none back** — nothing in our stack needs any  |
| `--security-opt no-new-privileges:true`       | setuid binaries can't elevate (defence-in-depth alongside cap-drop)                  |
| `--read-only`                                 | Root FS is read-only — only `/sandbox` (vol) and `/tmp`, `~/.cache`, `~/.npm` (tmpfs) writable |
| `--tmpfs /tmp ...,nosuid,nodev`               | Writable /tmp without a real disk; nosuid/nodev neutralises classic abuse paths      |
| `-v isb_session_<id>:/sandbox`                | The ONLY persistent mount; named volume, not a bind — host FS is not exposed         |
| No `-v host_path:container_path` ever         | A bind mount would expose the host to whatever the candidate runs                    |
| `-p hostPort:containerPort`                   | Publishes the dev server on a host-pool port (Phase 9 picks the port)                |
| `--network bridge`                            | Default — egress allowed for npm/pip installs. Phase 12 may add egress filtering     |
| `--init`                                      | tini as PID 1 — reaps zombies, propagates SIGTERM correctly                          |
| `--restart no`                                | Crashed sessions stay dead — orchestrator decides whether to recover                 |

### Idle / auto-kill timeout

Phase 12 ships a reaper that polls `last_active_at` (already in
`sessions`) and `docker stop`s + `docker rm`s any container idle for
**> 30 min**. After stop, the session row flips to `recoverable` so the
user can resume.

### Per-host budget

Conservative ceilings × 20 concurrent containers:

| Resource | Per container | × 20 containers | Comfortable on a host with |
|----------|---------------|-----------------|-----------------------------|
| Memory   | 1 GB           | 20 GB           | 32 GB RAM                   |
| CPU      | 1 vCPU (soft)  | 20 vCPU (oversubscribed) | 8+ cores (interview work is bursty) |
| PIDs     | 256            | 5 120 total     | well under default 32 k cap |
| Disk     | ~500 MB / vol  | ~10 GB          | typical dev SSD             |

If a host has less, drop concurrent-session cap in `MAX_CONCURRENT_SESSIONS`
rather than weakening these per-container caps.

---

## Init script contract

Each base image's `ENTRYPOINT` is `/usr/local/bin/init`. The init script:

1. **Reads** `$FRAMEWORK` + `$CUSTOMIZATION` (JSON, parsed with `jq`).
2. **Emits machine-readable progress** on stdout. Every meaningful step
   prints exactly one line of the form:
   ```
   PROGRESS <json-blob>
   ```
   The orchestrator (Phase 6) tails container logs and filters for that
   `PROGRESS ` prefix. JSON blob shape:
   ```json
   { "step": "create-vite", "status": "running|done|error", "pct": 0-100, "msg": "..." }
   ```
   `pct` is monotonically non-decreasing per session. `status:"error"`
   means the init failed and the orchestrator should mark the session
   `error`.
3. **Scaffolds** the project into `/sandbox/` (which is the empty named
   volume on first start). The "skip scaffold if already present" branch
   handles resume.
4. **Writes the dev-server port** to `/sandbox/.port` so the orchestrator
   knows what container port to publish.
5. **`exec`s the dev server** as PID 1 (so SIGTERM stops it cleanly).
6. For C++ which has no dev server, `exec`s `tail -f /dev/null` after a
   successful test compile.

A failed init must `printf "PROGRESS {...status:error...}\n"` and exit
non-zero so the orchestrator's `docker wait` sees a non-zero exit code.

---

## Compose for local dev

`docker-compose.yml` at the repo root brings up the dev dependencies the
API needs (just Postgres for now). It does NOT include the sandbox
containers — those are spawned per-session by the orchestrator with the
explicit flags above.

```bash
docker compose up -d        # bring up Postgres
pnpm migrate && pnpm seed   # one-time bootstrap
pnpm dev                    # run the API
```

---

## Preview path (v1: direct host-port mapping)

In v1 the orchestrator publishes each session's dev-server port directly to
the loopback interface:

```
docker run … -p 127.0.0.1:<hostPort>:<containerDevPort> …
```

`<hostPort>` is allocated from the pool defined by `PREVIEW_PORT_MIN`/`PREVIEW_PORT_MAX`
(default `4100–4199`, 100 slots vs. the 20-concurrent-session cap — see
`src/services/portPool.ts`). On session create the port is persisted on
`sessions.host_preview_port`; on close it's released back to the pool.

The orchestrator emits `preview_ready` over the socket with:

```json
{ "hostPort": 4117, "url": "http://localhost:4117", "kind": "iframe", "hint": null }
```

`kind` decides how the client renders:

| kind     | Used for                            | Client treatment                                                |
|----------|--------------------------------------|-----------------------------------------------------------------|
| `iframe` | React/Vite, Next.js, plain JS        | Integrated browser tab — iframe to `url`, reload + open-in-new  |
| `api`    | Node, Python (FastAPI/Django/Flask), Go | Phase 10 API-client tab uses `url` as the request base          |
| `none`   | C++                                  | "Terminal only" placeholder                                     |

**HMR / Fast Refresh works natively** because the dev server inside the
container binds `0.0.0.0:<containerDevPort>` and the page is served from
`http://localhost:<hostPort>`. Vite's HMR WebSocket and Next.js's Fast
Refresh WS connect back to the same origin — the direct port-forward is
transparent to them.

## Preview path (cloud: wildcard subdomain + reverse proxy)

When you leave localhost, direct port mapping breaks down: ports are
opaque on a shared domain, browsers won't trust mixed origins for HMR
WebSockets, and you can't hand out raw `host:port` to interview
candidates. The cloud path is **wildcard subdomain + a reverse proxy
that forwards both HTTP and WebSocket upgrades**.

```
                 ┌──────────────────────┐
candidate ──TLS──▶ *.sandbox.example.com │
                 │   (wildcard cert,    │
                 │   nginx/Traefik)     │
                 └──────────┬───────────┘
                            │
                            ▼
                ┌─────────────────────────────┐
                │ {sessionId}.sandbox.…       │
                │   → looks up host_preview_  │
                │     port from /sessions/…   │
                │   → proxy_pass http://      │
                │     127.0.0.1:<hostPort>;   │
                │     proxy_http_version 1.1; │
                │     proxy_set_header        │
                │       Upgrade $http_upgrade │
                │       Connection "upgrade"; │
                └─────────────────────────────┘
```

**Concrete pieces of the cloud migration** (out-of-scope for v1, captured
here so it's a known straight line):

1. **DNS**: wildcard `A`/`AAAA` `*.sandbox.example.com` → the orchestrator host.
2. **TLS**: wildcard cert via ACME DNS-01 (Let's Encrypt) — keeps the
   per-session cert count at zero.
3. **Reverse proxy** (nginx or Traefik) terminates TLS and routes by the
   leftmost subdomain label. The label IS the sessionId. The proxy looks
   up the session's `host_preview_port` either by reading a small Redis
   key the orchestrator maintains, or by querying `GET /internal/sessions/<id>`
   (authenticated server-to-server).
4. **WebSocket forwarding** is REQUIRED for HMR + the app's own socket.io
   connection. Both nginx (`proxy_set_header Upgrade $http_upgrade` +
   `Connection "upgrade"`) and Traefik handle this with a single label.
5. **Origin lockdown**: bind containers to `127.0.0.1:<hostPort>` (same as
   v1 — the proxy is the only path in from outside). Egress filtering
   per Phase 12.
6. **Lifecycle**: when a session ends, the proxy entry becomes a 410. The
   server emits `preview_unavailable` on the socket so the iframe shows
   the right placeholder.
7. **Per-session cookies**: leverage `SameSite=None; Secure` for the
   subdomain-isolated preview frame; the main app cookie stays on the
   primary domain.

The v1 → cloud diff is bounded: orchestrator stays the same; the WS
realtime layer stays the same; only `previewService` and the proxy
config differ. The Phase 9 `preview.kind` distinction already gives the
client the right rendering decision regardless of which path is live.

## File map of this directory

```
docker/
  README.md                    ← you are here
  Dockerfile.react
  Dockerfile.node
  Dockerfile.python
  Dockerfile.golang
  Dockerfile.javascript
  Dockerfile.cpp
  scripts/
    lib/
      progress.sh              ← shared `progress` shell function
    init-react.sh
    init-node.sh
    init-python.sh
    init-golang.sh
    init-javascript.sh
    init-cpp.sh
    build-all.sh               ← `docker build` for all 6 base images
    verify-images.sh           ← boot + scaffold check for each base image
```
