#!/usr/bin/env bash
# init-node.sh — scaffolds a Node project inside the per-session volume, and
# (optionally) boots an in-container database engine seeded with a `health`
# table/collection + an unauthenticated GET /health/db endpoint.
#
# Customization:
#   .language : "TypeScript" | "JavaScript"
#   .express  : array — contains "express" to enable
#   .database : "PostgreSQL" | "MySQL" | "MongoDB" | null
#
# DB constants below are kept in sync with src/services/dbShell.ts on the server.

set -euo pipefail
# shellcheck source=lib/progress.sh
source /usr/local/bin/lib/progress.sh

require_cmd jq
require_cmd node
require_cmd npm

LANGUAGE=$(read_customization_key '.language' 'JavaScript')
DATABASE=$(read_customization_key '.database' '')
USE_EXPRESS=0; customization_has '.express' 'express' && USE_EXPRESS=1

# A database session always needs an HTTP server for the /health/db endpoint.
[ -n "$DATABASE" ] && USE_EXPRESS=1

# ---- DB constants (MUST match src/services/dbShell.ts) ----------------------
DB_NAME=sandbox_db
DB_USER=sandbox
PG_PORT=5432
PGDATA=/sandbox/.pgdata
PG_LOG=/sandbox/.pglog
PG_URL="postgresql://${DB_USER}@127.0.0.1:${PG_PORT}/${DB_NAME}"

MONGO_PORT=27017
MONGO_DATA=/sandbox/.mongo
MONGO_URI="mongodb://127.0.0.1:${MONGO_PORT}"

MYSQL_PORT=3306
MYSQL_DATA=/sandbox/.mysql
MYSQL_SOCK=/tmp/mysql.sock
MYSQL_URL="mysql://root@127.0.0.1:${MYSQL_PORT}/${DB_NAME}"

progress init starting 1 "node / $LANGUAGE / db=${DATABASE:-none} / express=$USE_EXPRESS"

cd /sandbox

# =============================================================================
# Postgres helpers — start in BOTH fresh + resume paths. Data lives on the
# volume (PGDATA), so it survives close→resume. Seeding is idempotent.
# =============================================================================
start_postgres() {
  if [ ! -s "$PGDATA/PG_VERSION" ]; then
    progress db-init running 28 "initializing postgres cluster"
    rm -rf "$PGDATA"
    mkdir -p "$PGDATA"
    # --locale=C avoids needing generated UTF-8 locales in the slim image;
    # encoding stays UTF8. trust auth — loopback only, single-host v1.
    initdb -D "$PGDATA" -U "$DB_USER" -E UTF8 --locale=C \
      --auth-local=trust --auth-host=trust >/tmp/initdb.log 2>&1 \
      || die "initdb failed: $(tail -5 /tmp/initdb.log)"
  fi
  progress db-start running 33 "starting postgres"
  # Unix socket on the writable /tmp tmpfs (root fs is read-only).
  # dynamic_shared_memory_type=mmap keeps PG off the tiny default /dev/shm.
  # fsync/full_page_writes off — it's a throwaway sandbox, favor speed.
  pg_ctl -D "$PGDATA" -l "$PG_LOG" -w -t 60 \
    -o "-c listen_addresses=127.0.0.1 -c port=${PG_PORT} -c unix_socket_directories=/tmp -c shared_buffers=32MB -c dynamic_shared_memory_type=mmap -c max_connections=20 -c fsync=off -c full_page_writes=off" \
    start >/tmp/pgstart.log 2>&1 \
    || die "postgres failed to start: $(tail -20 "$PG_LOG" 2>/dev/null)"
  # Belt-and-suspenders readiness wait.
  local i
  for i in $(seq 1 30); do
    pg_isready -h 127.0.0.1 -p "${PG_PORT}" -q && break
    sleep 1
  done
  pg_isready -h 127.0.0.1 -p "${PG_PORT}" -q || die "postgres not accepting connections"
}

seed_postgres() {
  progress db-seed running 38 "seeding ${DB_NAME}"
  # Create the database if absent.
  if ! psql -h 127.0.0.1 -p "${PG_PORT}" -U "${DB_USER}" -d postgres -tAc \
        "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
    psql -h 127.0.0.1 -p "${PG_PORT}" -U "${DB_USER}" -d postgres \
      -c "CREATE DATABASE ${DB_NAME}" >/dev/null \
      || die "could not create database ${DB_NAME}"
  fi
  # Idempotent health table + a seed row.
  psql -h 127.0.0.1 -p "${PG_PORT}" -U "${DB_USER}" -d "${DB_NAME}" >/dev/null <<'SQL' \
    || die "could not seed health table"
CREATE TABLE IF NOT EXISTS health (
  id         serial PRIMARY KEY,
  status     text NOT NULL DEFAULT 'ok',
  checked_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO health (status)
SELECT 'ok' WHERE NOT EXISTS (SELECT 1 FROM health);
SQL
  progress db-seed done 42 "postgres ready: ${DB_NAME}"
}

# =============================================================================
# MongoDB helpers — start in BOTH fresh + resume paths. Data persists in
# /sandbox/.mongo across close→resume. Seeding is idempotent.
# =============================================================================
start_mongo() {
  mkdir -p "$MONGO_DATA"
  if [ -f "$MONGO_DATA/mongod.lock" ]; then
    # Stale lock from an unclean stop — mongod refuses to start with it held.
    rm -f "$MONGO_DATA/mongod.lock" 2>/dev/null || true
  fi
  progress db-start running 33 "starting mongod"
  # wiredTiger cache kept small to fit the 1.5 GiB cap. --fork daemonizes;
  # socket lives on the writable /tmp tmpfs (root fs is read-only).
  mongod --dbpath "$MONGO_DATA" --bind_ip 127.0.0.1 --port "$MONGO_PORT" \
    --wiredTigerCacheSizeGB 0.25 --unixSocketPrefix /tmp \
    --logpath "$MONGO_DATA/mongod.log" --fork >/tmp/mongostart.log 2>&1 \
    || die "mongod failed to start: $(tail -20 "$MONGO_DATA/mongod.log" 2>/dev/null)"
  local i
  for i in $(seq 1 30); do
    mongosh "$MONGO_URI" --quiet --eval 'db.runCommand({ping:1}).ok' 2>/dev/null | grep -q 1 && break
    sleep 1
  done
  mongosh "$MONGO_URI" --quiet --eval 'db.runCommand({ping:1}).ok' 2>/dev/null | grep -q 1 \
    || die "mongod not accepting connections"
}

seed_mongo() {
  progress db-seed running 38 "seeding ${DB_NAME}"
  # Idempotent: create the `health` collection with a JSON-schema validator and
  # a seed doc only if absent.
  mongosh "${MONGO_URI}/${DB_NAME}" --quiet --eval '
    if (!db.getCollectionNames().includes("health")) {
      db.createCollection("health", {
        validator: { $jsonSchema: {
          bsonType: "object",
          required: ["status", "checkedAt"],
          properties: {
            status:    { bsonType: "string", description: "health status" },
            checkedAt: { bsonType: "date",   description: "last check time" }
          }
        } }
      });
    }
    if (db.health.countDocuments({}) === 0) {
      db.health.insertOne({ status: "ok", checkedAt: new Date() });
    }
  ' >/tmp/mongoseed.log 2>&1 || die "mongo seed failed: $(tail -5 /tmp/mongoseed.log)"
  progress db-seed done 42 "mongodb ready: ${DB_NAME}"
}

# =============================================================================
# MariaDB (MySQL) helpers — start in BOTH fresh + resume paths. Data persists in
# /sandbox/.mysql. Runs as uid 10001: datadir on the volume, socket on /tmp,
# skip-grant-tables → no-auth root over loopback only. Seeding is idempotent.
# =============================================================================
start_mariadb() {
  if [ ! -d "$MYSQL_DATA/mysql" ]; then
    progress db-init running 28 "initializing mariadb"
    mkdir -p "$MYSQL_DATA"
    mariadb-install-db --datadir="$MYSQL_DATA" \
      --auth-root-authentication-method=normal --skip-test-db >/tmp/installdb.log 2>&1 \
      || die "mariadb-install-db failed: $(tail -5 /tmp/installdb.log)"
  fi
  progress db-start running 33 "starting mariadb"
  mariadbd --datadir="$MYSQL_DATA" --socket="$MYSQL_SOCK" --pid-file=/tmp/mariadbd.pid \
    --bind-address=127.0.0.1 --port="$MYSQL_PORT" --skip-grant-tables --skip-networking=0 \
    --innodb-buffer-pool-size=64M --skip-name-resolve >"$MYSQL_DATA/err.log" 2>&1 &
  local i
  for i in $(seq 1 40); do mariadb-admin --socket="$MYSQL_SOCK" ping >/dev/null 2>&1 && break; sleep 1; done
  mariadb-admin --socket="$MYSQL_SOCK" ping >/dev/null 2>&1 \
    || die "mariadb not accepting connections: $(tail -20 "$MYSQL_DATA/err.log" 2>/dev/null)"
}
seed_mariadb() {
  progress db-seed running 38 "seeding ${DB_NAME}"
  mariadb --socket="$MYSQL_SOCK" -e "CREATE DATABASE IF NOT EXISTS ${DB_NAME};" \
    || die "could not create database ${DB_NAME}"
  mariadb --socket="$MYSQL_SOCK" "${DB_NAME}" >/dev/null <<'SQL' || die "could not seed health table"
CREATE TABLE IF NOT EXISTS health (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  status     VARCHAR(64) NOT NULL DEFAULT 'ok',
  checked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
SQL
  local cnt
  cnt=$(mariadb --socket="$MYSQL_SOCK" -N -B "${DB_NAME}" -e "SELECT COUNT(*) FROM health" 2>/dev/null || echo 0)
  if [ "${cnt:-0}" = "0" ]; then
    mariadb --socket="$MYSQL_SOCK" "${DB_NAME}" -e "INSERT INTO health (status) VALUES ('ok');" \
      || die "could not seed health row"
  fi
  progress db-seed done 42 "mysql ready: ${DB_NAME}"
}

# =============================================================================
# Scaffold
# =============================================================================
if [ -f /sandbox/package.json ]; then
  progress resume running 10 "existing project detected"
  npm install --no-audit --no-fund || die "npm install failed during resume"
  progress resume done 25
else
  progress npm-init running 10
  npm init -y >/dev/null
  npm pkg set type=module >/dev/null
  progress npm-init done 20

  ENTRY=index.js
  if [ "$LANGUAGE" = "TypeScript" ]; then
    progress ts-setup running 24
    npm install -D typescript tsx @types/node >/tmp/install.log 2>&1 \
      || die "ts setup failed: $(tail -5 /tmp/install.log)"
    npx tsc --init --target es2022 --module nodenext --moduleResolution nodenext \
      --rootDir src --outDir dist --strict true --esModuleInterop true >/dev/null
    mkdir -p src
    ENTRY=src/index.ts
    npm pkg set scripts.dev="tsx watch $ENTRY" >/dev/null
    progress ts-setup done 30
  else
    npm pkg set scripts.dev="node --watch $ENTRY" >/dev/null
  fi

  DEPS=()
  if [ "$USE_EXPRESS" = "1" ]; then DEPS+=(express); fi
  case "$DATABASE" in
    PostgreSQL) DEPS+=(pg) ;;
    MySQL)      DEPS+=(mysql2) ;;
    MongoDB)    DEPS+=(mongodb) ;;
  esac
  if [ ${#DEPS[@]} -gt 0 ]; then
    progress install running 45 "${DEPS[*]}"
    OK=0
    for attempt in 1 2 3; do
      if npm install --prefer-offline --no-audit --no-fund "${DEPS[@]}" >/tmp/install.log 2>&1; then
        OK=1; break
      fi
      sleep $((attempt * 3))
    done
    [ "$OK" = "1" ] || die "dep install failed after 3 attempts: $(tail -5 /tmp/install.log)"
    progress install done 55
  fi

  progress scaffold running 60
  if [ "$DATABASE" = "PostgreSQL" ]; then
    # Express + pg, with an UNAUTHENTICATED GET /health/db endpoint.
    cat > "$ENTRY" <<'EOF'
import express from 'express';
import pg from 'pg';

// Connection string is injected by the sandbox init (see DATABASE_URL). The
// fallback keeps the file runnable if you copy it elsewhere.
const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ?? 'postgresql://sandbox@127.0.0.1:5432/sandbox_db',
});

const app = express();
app.use(express.json());

app.get('/', (_req, res) => res.json({ ok: true, hint: 'edit the entry file to start coding' }));

// No-auth DB health probe — confirms the in-container Postgres is reachable
// and the seeded `health` table is queryable.
app.get('/health/db', async (_req, res) => {
  try {
    const r = await pool.query(
      'SELECT status, checked_at FROM health ORDER BY id DESC LIMIT 1',
    );
    res.json({ ok: true, db: 'postgres', database: 'sandbox_db', health: r.rows[0] ?? null });
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, '0.0.0.0', () => console.log(`listening on ${PORT}`));
EOF
  elif [ "$DATABASE" = "MongoDB" ]; then
    # Express + mongodb driver, with an UNAUTHENTICATED GET /health/db endpoint.
    cat > "$ENTRY" <<'EOF'
import express from 'express';
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017';
const dbName = process.env.MONGODB_DB ?? 'sandbox_db';
const client = new MongoClient(uri);

const app = express();
app.use(express.json());

app.get('/', (_req, res) => res.json({ ok: true, hint: 'edit the entry file to start coding' }));

// No-auth DB health probe — confirms the in-container MongoDB is reachable and
// the seeded `health` collection is queryable.
app.get('/health/db', async (_req, res) => {
  try {
    await client.connect();
    const doc = await client.db(dbName).collection('health').findOne({}, { sort: { _id: -1 } });
    res.json({ ok: true, db: 'mongodb', database: dbName, health: doc });
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, '0.0.0.0', () => console.log(`listening on ${PORT}`));
EOF
  elif [ "$DATABASE" = "MySQL" ]; then
    # Express + mysql2, with an UNAUTHENTICATED GET /health/db endpoint.
    cat > "$ENTRY" <<'EOF'
import express from 'express';
import mysql from 'mysql2/promise';

const pool = mysql.createPool(process.env.DATABASE_URL ?? 'mysql://root@127.0.0.1:3306/sandbox_db');

const app = express();
app.use(express.json());

app.get('/', (_req, res) => res.json({ ok: true, hint: 'edit the entry file to start coding' }));

// No-auth DB health probe — confirms the in-container MySQL/MariaDB is reachable
// and the seeded `health` table is queryable.
app.get('/health/db', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT status, checked_at FROM health ORDER BY id DESC LIMIT 1');
    res.json({ ok: true, db: 'mysql', database: 'sandbox_db', health: rows[0] ?? null });
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, '0.0.0.0', () => console.log(`listening on ${PORT}`));
EOF
  elif [ "$USE_EXPRESS" = "1" ]; then
    cat > "$ENTRY" <<'EOF'
import express from 'express';
const app = express();
app.get('/', (_req, res) => res.json({ ok: true, hint: 'edit src/ to start coding' }));
const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, '0.0.0.0', () => console.log(`listening on ${PORT}`));
EOF
  else
    cat > "$ENTRY" <<'EOF'
import http from 'node:http';
const PORT = Number(process.env.PORT ?? 3000);
http.createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ ok: true, hint: 'edit index.js / src/index.ts to start coding' }));
}).listen(PORT, '0.0.0.0', () => console.log(`listening on ${PORT}`));
EOF
  fi
  write_port 3000
  progress scaffold done 70
fi

# =============================================================================
# Boot the database engine (fresh + resume) and wire the dev server to it.
# =============================================================================
write_port 3000
if [ "$DATABASE" = "PostgreSQL" ]; then
  start_postgres
  seed_postgres
  export DATABASE_URL="$PG_URL"
elif [ "$DATABASE" = "MongoDB" ]; then
  start_mongo
  seed_mongo
  export MONGODB_URI="$MONGO_URI"
  export MONGODB_DB="$DB_NAME"
elif [ "$DATABASE" = "MySQL" ]; then
  start_mariadb
  seed_mariadb
  export DATABASE_URL="$MYSQL_URL"
fi

progress ready done 100 "starting dev server"
exec npm run dev
