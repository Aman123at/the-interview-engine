# Architecture — interview-sandbox-server

v1 deployment is single-host, localhost-only, ≤ 20 concurrent users. The system
is intentionally a single Node process per host, with all state on local
disk (Docker named volumes + Postgres).

## High-level topology

```mermaid
flowchart LR
  subgraph browser ["Browser"]
    UI["Next.js client<br/>(separate repo)"]
  end

  subgraph host ["Host (localhost-only v1)"]
    subgraph server ["interview-sandbox-server (single Node process)"]
      API[Express<br/>HTTP routes]
      WS[socket.io<br/>rooms]
      ORCH[sessionService<br/>orchestrator]
      LIFE[lifecycleService<br/>docker events]
      REAP[reaperService<br/>periodic + boot]
      DAL[DAL<br/>usersDal · sessionsDal<br/>sessionEventsDal · sessionFilesDal]
      BUS([eventBus])
    end

    PG[(Postgres<br/>users · sessions<br/>session_events<br/>session_files)]
    DKR[(Docker daemon<br/>/var/run/docker.sock)]

    subgraph containers ["per-session containers"]
      C1["isb_session_&lt;uuid&gt;<br/>(react/node/python/…)<br/>uid 10001 · 1 GiB · 1 CPU<br/>cap-drop ALL · read-only root"]
    end

    subgraph volumes ["named volumes (local disk)"]
      V1[/"isb_session_&lt;uuid&gt;<br/>/sandbox"/]
    end
  end

  UI -- "HTTP /auth/login, /sessions, /sessions/recoverable" --> API
  UI -- "socket.io: session:join, file:*, term:*" --> WS

  API --> ORCH
  WS --> ORCH
  WS <-->|relay| BUS
  ORCH --> DAL
  ORCH --> DKR
  LIFE -->|"streamEvents() filtered<br/>by label=isb_managed"| DKR
  LIFE --> DAL
  REAP --> DAL
  REAP --> DKR
  DAL --> PG
  DAL --> BUS

  DKR --> C1
  C1 -. "/sandbox bind" .- V1

  UI -- "preview iframe<br/>http://localhost:&lt;hostPort&gt;" --> C1
```

Key invariants:

- **All DB access goes through the DAL.** Services + routes + WS handlers
  never run raw SQL; one file per entity in `src/dal/`.
- **One room per session** (`session:<uuid>`) in socket.io. Lifecycle events
  + file/terminal pushes are emitted to the room; subscribers receive
  exactly the events for sessions they own.
- **Hard one-session rule** enforced at two levels: a partial unique index
  in Postgres (`sessions_one_active_per_user_uniq`), and the DAL
  pre-checking before insert.
- **No host bind mounts** — sandbox containers see only the per-session
  named volume + per-container tmpfs (`/tmp`, `~/.cache`, `~/.npm`).
- **Single-host today; decoupled-for-Redis** — the eventBus + room model
  are the only places that would need a Redis adapter to go multi-process.

---

## Critical paths

### Session create → init → running

```mermaid
sequenceDiagram
  autonumber
  participant C as Client (Next.js)
  participant API as POST /sessions
  participant ORCH as sessionService
  participant DKR as Docker
  participant DB as Postgres
  participant BUS as eventBus / socket.io

  C->>API: POST /sessions {framework, customization}
  API->>ORCH: createSession()
  ORCH->>ORCH: validateCustomization()
  ORCH->>DB: getActiveSessionForUser() [one-session check]
  alt user already has non-terminal session
    ORCH-->>C: 409 CONFLICT (details.sessionId)
  end
  ORCH->>DKR: image inspect (must be built)
  ORCH->>ORCH: portPool.allocate()
  ORCH->>DB: sessions.insert (status=pending)
  Note over ORCH: partial unique index is the<br/>race-proof backstop here
  ORCH-->>API: { session, preview }
  API-->>C: 201 Created

  par async init pipeline
    ORCH->>DKR: createVolume + createContainer + start
    DKR-->>BUS: container/create, container/start
    BUS-->>DB: session_events.append (lifecycle)
    BUS-->>C: socket lifecycle:event

    ORCH->>DKR: streamLogs → parse PROGRESS lines
    loop init script output
      DKR-->>ORCH: PROGRESS {step, status, pct}
      ORCH-->>DB: session_events.append (ws_init)
      ORCH-->>C: lifecycle:event
    end
    ORCH->>DB: sessions.update(status=running)
    ORCH-->>C: lifecycle:event preview_ready {url, kind}
  end
```

### Reconnect (transient blip)

```mermaid
sequenceDiagram
  autonumber
  participant C as Client
  participant WS as socket.io
  participant ORCH as sessionService
  participant DKR as Docker

  Note over C,WS: socket drops (network blip)
  alt blip <= 2 min, state-recovery picks it up
    C->>WS: reconnect with same auth
    WS->>WS: connectionStateRecovery replays missed packets
    WS-->>C: connection:health { recovered: true }
  else fresh socket
    C->>WS: new socket + handshake {auth.token | isb_at cookie}
    WS->>WS: verifyAccessToken (single source of truth)
    WS-->>C: connection:health { recovered: false }
    C->>WS: session:join { sessionId }
    WS->>ORCH: load + ownership check
    WS-->>C: JoinResponse {session, preview, tabs[]}
    C->>WS: file:tree → fresh snapshot
    C->>WS: term:reattach per tab → ring-buffer backlog
  end
  Note over DKR: container kept running throughout —<br/>no resume needed if alive
```

### Resume (prolonged loss → recoverable → rehydrate)

```mermaid
sequenceDiagram
  autonumber
  participant DKR as Docker
  participant LIFE as lifecycleService
  participant DB as Postgres
  participant C as Client (dashboard)
  participant API as POST /sessions/:id/resume
  participant ORCH as sessionService

  DKR-->>LIFE: container/die {exitCode}
  LIFE->>DB: sessions.update(status=recoverable)
  LIFE->>DB: session_events.append (container_die, error)

  Note over C: User opens dashboard
  C->>API: GET /sessions/recoverable
  API-->>C: { session, preview }
  Note over C: "Continue previous session" card shown<br/>"Start new" hidden

  C->>API: POST /sessions/:id/resume
  API->>ORCH: resumeSession()
  ORCH->>DKR: volumeExists(volumeName)
  alt volume missing
    ORCH->>DB: status=error, ended_at=now
    ORCH-->>C: 404 (workspace lost)
  end
  ORCH->>ORCH: portPool.allocate (fresh)
  ORCH->>DKR: removeContainerByName (tear down stale)
  ORCH->>DB: status=pending, host_preview_port, container_id=null
  ORCH->>DB: session_events.append (session_resume)
  ORCH-->>C: 202 { session, preview }

  par init pipeline (existing project branch)
    ORCH->>DKR: createContainer + start (volume reused)
    Note over DKR: init script sees existing<br/>/sandbox/package.json →<br/>npm install (re-hydrate node_modules)
    ORCH->>DB: status=running
    ORCH-->>C: lifecycle:event preview_ready
  end
```

### Close (save → prune → release)

```mermaid
sequenceDiagram
  autonumber
  participant C as Client
  participant API as DELETE /sessions/:id
  participant ORCH as sessionService
  participant FS as fileSync
  participant DKR as Docker
  participant DB as Postgres

  C->>API: DELETE /sessions/:id
  API->>ORCH: closeSession()
  alt session is recoverable (fast-path)
    ORCH->>DB: portPool.release + markEnded
    ORCH-->>C: { session: { status: ended } }
  else session was running / initializing / saving
    ORCH->>DB: status=saving
    ORCH-->>C: lifecycle:event session_close {phase: saving}

    ORCH->>FS: persistAllFiles(sessionId, containerId)
    FS->>DKR: docker exec find + cat (per file)
    FS->>DB: session_files.upsert (only if content differs)
    ORCH-->>C: lifecycle:event session_close {phase: persisted}

    ORCH->>DKR: docker exec rm -rf node_modules .venv vendor dist
    ORCH-->>C: lifecycle:event session_close {phase: pruned}

    ORCH->>DKR: stopContainer + removeContainer
    ORCH->>ORCH: portPool.release, terminalManager.closeAll
    ORCH->>DB: status=ended, ended_at=now
    ORCH-->>C: { session: { status: ended } }
    Note over DB: volume KEPT on local disk
  end
```

---

## Storage layout

```
Postgres:
  users
  sessions             ← container_id, volume_name, host_preview_port, status
  session_events       ← append-only audit log (relayed to room)
  session_files        ← durable source copy (excludes node_modules)

Local disk (named Docker volumes):
  /var/lib/docker/volumes/isb_session_<uuid>/_data
    ├── package.json          (source — durable)
    ├── src/…                 (source — durable)
    ├── vite.config.js         (source — durable)
    └── node_modules/         (heavy — pruned on close, re-installed on resume)
```

Excluded from the durable `session_files` copy: `node_modules`, `.venv`,
`vendor`, `.git`, `dist`, `build`, `.next`. The container still has them;
we just don't persist them in Postgres.

---

## Failure-mode map

| Failure | Detection | Response |
|---|---|---|
| Bad login | bcrypt verify in `services/auth.ts` | 401 `UNAUTHORIZED`, rate-limited 5×/min |
| Expired access token | `verifyAccessToken` throws | 401 — client refreshes + re-handshakes |
| API down | client `fetch` rejects | client shows banner, retries with backoff |
| Socket drop | `disconnect` event | state-recovery (2 min) or fresh handshake; `connection:health` event |
| Container start failure | `runInitPipeline` catch | `cleanupFailedInit` removes container/volume, releases port, status=error |
| Init script failure | `PROGRESS … "status":"error"` | same as above; error message bubbles to `session_events` |
| Container OOM / crash mid-session | `lifecycleService` `die`/`oom` events | status=recoverable, port released; user can resume |
| Preview not ready | session status != `running` | client polls `GET /sessions/:id` until ready, shows loader |
| Save failure during close | `persistAllFiles` catches, logs | proceed to ended; warn event in audit log |
| One-session conflict | DAL pre-check + partial unique index | 409 with `details.sessionId` — client shows recoverable card |
| Port exhausted | `portPool.allocate() === null` | 409 `CONFLICT` "No free preview ports — please retry shortly" |
| Volume missing on resume | `volumeExists` returns false | 404, session force-ended, clear error |
| Container ↔ DB drift | `reaperService.reconcile` at boot | non-terminal sessions without containers → recoverable; orphan containers removed |

---

## Concurrency budget

Per-container resource caps × 20 concurrent containers:

| Resource | Per container | × 20 | Comfortable on |
|---|---|---|---|
| Memory | 1 GiB | 20 GiB | 32 GiB host |
| CPU | 1 vCPU (soft) | 20 vCPU oversubscribed | 8+ cores |
| PIDs | 256 | 5120 | default 32k cap |
| Disk per volume | ~500 MB | ~10 GB | typical SSD |
| Host preview ports | 1 | 20 (of 100 pool) | trivially within range |

If a host can't sustain 20: drop `MAX_CONCURRENT_SESSIONS`; do not weaken
per-container caps. The runtime cap returns 409 with a clear reason when
exceeded.

---

## What changes on the way to cloud

Documented in `docker/README.md` under "Preview path (cloud)". The v1 → cloud
delta is **bounded** to two files:

1. `src/services/previewService.ts` — URL synthesis (subdomain instead of port)
2. `docker/` proxy config (nginx/Traefik with `Upgrade: $http_upgrade` for HMR WebSockets)

Everything else — orchestrator, WS layer, security flags, DAL — stays identical.
