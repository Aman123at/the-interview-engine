#!/usr/bin/env bash
# init-fullstack.sh — full-stack combo: React (Vite) + Node + an in-container DB.
#
# Layout in the per-session volume:
#   /sandbox/client   — React + Vite front end (the preview; proxies /api → Node)
#   /sandbox/server   — Node back end (Express or http) talking to the DB
#   /sandbox/.pgdata | .mongo — the database data dir (persisted, hidden)
#
# Customization:
#   .language : "TypeScript" | "JavaScript"   (applies to both client + server)
#   .express  : array — contains "express" to use Express + routers (+ mongoose)
#   .tailwind : array — contains "tailwind"
#   .shadcn   : array — contains "shadcn"
#   .database : "PostgreSQL" | "MongoDB"
#
# Sample data: a `products` table/collection seeded with rows, served by the
# Node API at GET /api/products, rendered as cards by the React page.
#
# DB constants below MUST stay in sync with src/services/dbShell.ts.

set -euo pipefail
# shellcheck source=lib/progress.sh
source /usr/local/bin/lib/progress.sh

require_cmd jq
require_cmd node
require_cmd npm

LANGUAGE=$(read_customization_key '.language' 'JavaScript')
DATABASE=$(read_customization_key '.database' 'PostgreSQL')
USE_EXPRESS=0; customization_has '.express' 'express' && USE_EXPRESS=1
USE_TAILWIND=0; customization_has '.tailwind' 'tailwind' && USE_TAILWIND=1
USE_SHADCN=0;   customization_has '.shadcn'   'shadcn'   && USE_SHADCN=1
[ "$USE_SHADCN" = "1" ] && USE_TAILWIND=1

IS_TS=0; [ "$LANGUAGE" = "TypeScript" ] && IS_TS=1
CEXT=jsx; [ "$IS_TS" = "1" ] && CEXT=tsx   # client component extension

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

progress init starting 1 "fullstack / $LANGUAGE / db=$DATABASE / express=$USE_EXPRESS"

cd /sandbox

# =============================================================================
# Database — start (fresh + resume) + seed sample `products` data. Idempotent.
# =============================================================================
start_postgres() {
  if [ ! -s "$PGDATA/PG_VERSION" ]; then
    progress db-init running 8 "initializing postgres"
    rm -rf "$PGDATA"; mkdir -p "$PGDATA"
    initdb -D "$PGDATA" -U "$DB_USER" -E UTF8 --locale=C \
      --auth-local=trust --auth-host=trust >/tmp/initdb.log 2>&1 \
      || die "initdb failed: $(tail -5 /tmp/initdb.log)"
  fi
  progress db-start running 10 "starting postgres"
  pg_ctl -D "$PGDATA" -l "$PG_LOG" -w -t 60 \
    -o "-c listen_addresses=127.0.0.1 -c port=${PG_PORT} -c unix_socket_directories=/tmp -c shared_buffers=32MB -c dynamic_shared_memory_type=mmap -c max_connections=20 -c fsync=off -c full_page_writes=off" \
    start >/tmp/pgstart.log 2>&1 \
    || die "postgres failed to start: $(tail -20 "$PG_LOG" 2>/dev/null)"
  local i
  for i in $(seq 1 30); do pg_isready -h 127.0.0.1 -p "${PG_PORT}" -q && break; sleep 1; done
  pg_isready -h 127.0.0.1 -p "${PG_PORT}" -q || die "postgres not accepting connections"
}
seed_postgres() {
  progress db-seed running 12 "seeding ${DB_NAME}"
  if ! psql -h 127.0.0.1 -p "${PG_PORT}" -U "${DB_USER}" -d postgres -tAc \
        "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
    psql -h 127.0.0.1 -p "${PG_PORT}" -U "${DB_USER}" -d postgres \
      -c "CREATE DATABASE ${DB_NAME}" >/dev/null || die "could not create database"
  fi
  psql -h 127.0.0.1 -p "${PG_PORT}" -U "${DB_USER}" -d "${DB_NAME}" >/dev/null <<'SQL' || die "seed failed"
CREATE TABLE IF NOT EXISTS products (
  id          serial PRIMARY KEY,
  name        text NOT NULL,
  price       numeric(10,2) NOT NULL DEFAULT 0,
  description text NOT NULL DEFAULT ''
);
INSERT INTO products (name, price, description)
SELECT * FROM (VALUES
  ('Aurora Notebook', 18.00, 'Dotted A5 notebook with a soft-touch cover.'),
  ('Nimbus Mug',      12.50, 'Ceramic mug that keeps coffee warm longer.'),
  ('Pulse Earbuds',   59.99, 'Wireless earbuds with active noise cancelling.'),
  ('Drift Backpack',  74.00, 'Water-resistant 22L daypack with a laptop sleeve.')
) AS v(name, price, description)
WHERE NOT EXISTS (SELECT 1 FROM products);
SQL
  progress db-seed done 14 "postgres ready"
}

start_mongo() {
  mkdir -p "$MONGO_DATA"
  [ -f "$MONGO_DATA/mongod.lock" ] && rm -f "$MONGO_DATA/mongod.lock" 2>/dev/null || true
  progress db-start running 10 "starting mongod"
  mongod --dbpath "$MONGO_DATA" --bind_ip 127.0.0.1 --port "$MONGO_PORT" \
    --wiredTigerCacheSizeGB 0.25 --unixSocketPrefix /tmp \
    --logpath "$MONGO_DATA/mongod.log" --fork >/tmp/mongostart.log 2>&1 \
    || die "mongod failed: $(tail -20 "$MONGO_DATA/mongod.log" 2>/dev/null)"
  local i
  for i in $(seq 1 30); do
    mongosh "$MONGO_URI" --quiet --eval 'db.runCommand({ping:1}).ok' 2>/dev/null | grep -q 1 && break
    sleep 1
  done
  mongosh "$MONGO_URI" --quiet --eval 'db.runCommand({ping:1}).ok' 2>/dev/null | grep -q 1 \
    || die "mongod not accepting connections"
}
seed_mongo() {
  progress db-seed running 12 "seeding ${DB_NAME}"
  mongosh "${MONGO_URI}/${DB_NAME}" --quiet --eval '
    if (!db.getCollectionNames().includes("products")) { db.createCollection("products"); }
    if (db.products.countDocuments({}) === 0) {
      db.products.insertMany([
        { name: "Aurora Notebook", price: 18.00, description: "Dotted A5 notebook with a soft-touch cover." },
        { name: "Nimbus Mug",      price: 12.50, description: "Ceramic mug that keeps coffee warm longer." },
        { name: "Pulse Earbuds",   price: 59.99, description: "Wireless earbuds with active noise cancelling." },
        { name: "Drift Backpack",  price: 74.00, description: "Water-resistant 22L daypack with a laptop sleeve." }
      ]);
    }
  ' >/tmp/mongoseed.log 2>&1 || die "mongo seed failed: $(tail -5 /tmp/mongoseed.log)"
  progress db-seed done 14 "mongodb ready"
}

start_mariadb() {
  if [ ! -d "$MYSQL_DATA/mysql" ]; then
    progress db-init running 8 "initializing mariadb"
    mkdir -p "$MYSQL_DATA"
    mariadb-install-db --datadir="$MYSQL_DATA" \
      --auth-root-authentication-method=normal --skip-test-db >/tmp/installdb.log 2>&1 \
      || die "mariadb-install-db failed: $(tail -5 /tmp/installdb.log)"
  fi
  progress db-start running 10 "starting mariadb"
  mariadbd --datadir="$MYSQL_DATA" --socket="$MYSQL_SOCK" --pid-file=/tmp/mariadbd.pid \
    --bind-address=127.0.0.1 --port="$MYSQL_PORT" --skip-grant-tables --skip-networking=0 \
    --innodb-buffer-pool-size=64M --skip-name-resolve >"$MYSQL_DATA/err.log" 2>&1 &
  local i
  for i in $(seq 1 40); do mariadb-admin --socket="$MYSQL_SOCK" ping >/dev/null 2>&1 && break; sleep 1; done
  mariadb-admin --socket="$MYSQL_SOCK" ping >/dev/null 2>&1 \
    || die "mariadb not accepting connections: $(tail -20 "$MYSQL_DATA/err.log" 2>/dev/null)"
}
seed_mariadb() {
  progress db-seed running 12 "seeding ${DB_NAME}"
  mariadb --socket="$MYSQL_SOCK" -e "CREATE DATABASE IF NOT EXISTS ${DB_NAME};" || die "create db failed"
  mariadb --socket="$MYSQL_SOCK" "${DB_NAME}" >/dev/null <<'SQL' || die "seed table failed"
CREATE TABLE IF NOT EXISTS products (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  price       DECIMAL(10,2) NOT NULL DEFAULT 0,
  description TEXT NOT NULL
);
SQL
  local cnt
  cnt=$(mariadb --socket="$MYSQL_SOCK" -N -B "${DB_NAME}" -e "SELECT COUNT(*) FROM products" 2>/dev/null || echo 0)
  if [ "${cnt:-0}" = "0" ]; then
    mariadb --socket="$MYSQL_SOCK" "${DB_NAME}" -e "INSERT INTO products (name, price, description) VALUES
      ('Aurora Notebook', 18.00, 'Dotted A5 notebook with a soft-touch cover.'),
      ('Nimbus Mug',      12.50, 'Ceramic mug that keeps coffee warm longer.'),
      ('Pulse Earbuds',   59.99, 'Wireless earbuds with active noise cancelling.'),
      ('Drift Backpack',  74.00, 'Water-resistant 22L daypack with a laptop sleeve.');" \
      || die "seed rows failed"
  fi
  progress db-seed done 14 "mysql ready"
}

# =============================================================================
# Scaffold the SERVER (/sandbox/server)
# =============================================================================
scaffold_server() {
  mkdir -p /sandbox/server
  cd /sandbox/server

  local SRV_ENTRY=index.js
  [ "$IS_TS" = "1" ] && { mkdir -p src; SRV_ENTRY=src/index.ts; }

  # package.json — tsx watch runs JS too and honors CHOKIDAR polling so docker
  # exec writes hot-reload reliably.
  cat > package.json <<EOF
{
  "name": "sandbox-server",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": { "dev": "tsx watch $SRV_ENTRY" }
}
EOF
  npm pkg set devDependencies.tsx="^4.19.0" >/dev/null
  [ "$IS_TS" = "1" ] && npm pkg set devDependencies.typescript="^5.5.0" devDependencies.@types/node="^20.0.0" >/dev/null

  # deps per express × database
  local DEPS=()
  [ "$USE_EXPRESS" = "1" ] && DEPS+=(express)
  case "$DATABASE" in
    PostgreSQL) DEPS+=(pg) ;;
    MongoDB)    [ "$USE_EXPRESS" = "1" ] && DEPS+=(mongoose) || DEPS+=(mongodb) ;;
    MySQL)      DEPS+=(mysql2) ;;
  esac
  for d in "${DEPS[@]}"; do npm pkg set "dependencies.$d"="*" >/dev/null; done

  # Write the server entry for the chosen combo.
  if [ "$DATABASE" = "PostgreSQL" ] && [ "$USE_EXPRESS" = "1" ]; then
    cat > "$SRV_ENTRY" <<'EOF'
import express from 'express';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgresql://sandbox@127.0.0.1:5432/sandbox_db',
});

const app = express();
app.use(express.json());

const api = express.Router();
api.get('/health', (_req, res) => res.json({ ok: true }));
api.get('/products', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, name, price, description FROM products ORDER BY id');
    res.json({ products: rows });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
app.use('/api', api);

const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, '0.0.0.0', () => console.log(`api listening on ${PORT}`));
EOF
  elif [ "$DATABASE" = "PostgreSQL" ]; then
    cat > "$SRV_ENTRY" <<'EOF'
import http from 'node:http';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgresql://sandbox@127.0.0.1:5432/sandbox_db',
});

const server = http.createServer(async (req, res) => {
  res.setHeader('content-type', 'application/json');
  const path = (req.url ?? '').split('?')[0];
  if (path === '/api/health') return void res.end(JSON.stringify({ ok: true }));
  if (path === '/api/products') {
    try {
      const { rows } = await pool.query('SELECT id, name, price, description FROM products ORDER BY id');
      return void res.end(JSON.stringify({ products: rows }));
    } catch (err) {
      res.statusCode = 500;
      return void res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    }
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'not found' }));
});

const PORT = Number(process.env.PORT ?? 3000);
server.listen(PORT, '0.0.0.0', () => console.log(`api listening on ${PORT}`));
EOF
  elif [ "$DATABASE" = "MongoDB" ] && [ "$USE_EXPRESS" = "1" ]; then
    cat > "$SRV_ENTRY" <<'EOF'
import express from 'express';
import mongoose from 'mongoose';

const uri = (process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017') + '/' + (process.env.MONGODB_DB ?? 'sandbox_db');
await mongoose.connect(uri);

const Product = mongoose.model(
  'Product',
  new mongoose.Schema({ name: String, price: Number, description: String }, { collection: 'products' }),
);

const app = express();
app.use(express.json());

const api = express.Router();
api.get('/health', (_req, res) => res.json({ ok: true }));
api.get('/products', async (_req, res) => {
  try {
    const products = await Product.find().lean();
    res.json({ products });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
app.use('/api', api);

const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, '0.0.0.0', () => console.log(`api listening on ${PORT}`));
EOF
  elif [ "$DATABASE" = "MySQL" ] && [ "$USE_EXPRESS" = "1" ]; then
    cat > "$SRV_ENTRY" <<'EOF'
import express from 'express';
import mysql from 'mysql2/promise';

const pool = mysql.createPool(process.env.DATABASE_URL ?? 'mysql://root@127.0.0.1:3306/sandbox_db');

const app = express();
app.use(express.json());

const api = express.Router();
api.get('/health', (_req, res) => res.json({ ok: true }));
api.get('/products', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name, price, description FROM products ORDER BY id');
    res.json({ products: rows });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
app.use('/api', api);

const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, '0.0.0.0', () => console.log(`api listening on ${PORT}`));
EOF
  elif [ "$DATABASE" = "MySQL" ]; then
    cat > "$SRV_ENTRY" <<'EOF'
import http from 'node:http';
import mysql from 'mysql2/promise';

const pool = mysql.createPool(process.env.DATABASE_URL ?? 'mysql://root@127.0.0.1:3306/sandbox_db');

const server = http.createServer(async (req, res) => {
  res.setHeader('content-type', 'application/json');
  const path = (req.url ?? '').split('?')[0];
  if (path === '/api/health') return void res.end(JSON.stringify({ ok: true }));
  if (path === '/api/products') {
    try {
      const [rows] = await pool.query('SELECT id, name, price, description FROM products ORDER BY id');
      return void res.end(JSON.stringify({ products: rows }));
    } catch (err) {
      res.statusCode = 500;
      return void res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    }
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'not found' }));
});

const PORT = Number(process.env.PORT ?? 3000);
server.listen(PORT, '0.0.0.0', () => console.log(`api listening on ${PORT}`));
EOF
  else
    # MongoDB, no Express — native driver + http.
    cat > "$SRV_ENTRY" <<'EOF'
import http from 'node:http';
import { MongoClient } from 'mongodb';

const client = new MongoClient(process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017');
await client.connect();
const db = client.db(process.env.MONGODB_DB ?? 'sandbox_db');

const server = http.createServer(async (req, res) => {
  res.setHeader('content-type', 'application/json');
  const path = (req.url ?? '').split('?')[0];
  if (path === '/api/health') return void res.end(JSON.stringify({ ok: true }));
  if (path === '/api/products') {
    try {
      const products = await db.collection('products').find().toArray();
      return void res.end(JSON.stringify({ products }));
    } catch (err) {
      res.statusCode = 500;
      return void res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    }
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'not found' }));
});

const PORT = Number(process.env.PORT ?? 3000);
server.listen(PORT, '0.0.0.0', () => console.log(`api listening on ${PORT}`));
EOF
  fi

  if [ "$IS_TS" = "1" ]; then
    cat > tsconfig.json <<'EOF'
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler",
    "strict": true, "esModuleInterop": true, "skipLibCheck": true, "noEmit": true
  },
  "include": ["src"]
}
EOF
  fi
}

# =============================================================================
# Scaffold the CLIENT (/sandbox/client) — React + Vite, proxy /api → Node.
# =============================================================================
scaffold_client() {
  mkdir -p /sandbox/client/src
  cd /sandbox/client

  cat > package.json <<EOF
{
  "name": "sandbox-client",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host 0.0.0.0 --port 5173",
    "build": "vite build",
    "preview": "vite preview --host 0.0.0.0"
  },
  "dependencies": { "react": "^18.3.1", "react-dom": "^18.3.1" },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.0",
    "vite": "^5.4.0"$( [ "$IS_TS" = "1" ] && printf ',\n    "typescript": "^5.5.0",\n    "@types/react": "^18.3.0",\n    "@types/react-dom": "^18.3.0"' )
  }
}
EOF

  # Vite config — proxy /api → the Node server (single origin → no CORS).
  # Polling is required for HMR over docker-exec writes (see Phase 9).
  if [ "$USE_TAILWIND" = "1" ]; then
    cat > vite.config.js <<'EOF'
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      // ws: true forwards HTTP Upgrade so candidate code using `ws`,
      // `socket.io`, or any WebSocket library works the same as REST.
      '/api': { target: 'http://localhost:3000', changeOrigin: true, ws: true },
      '/socket.io': { target: 'http://localhost:3000', changeOrigin: true, ws: true },
    },
    watch: { usePolling: true, interval: 200 },
    // Vite host-check disabled — Traefik is the real gatekeeper. See init-react.sh.
    allowedHosts: true,
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

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      // ws: true forwards HTTP Upgrade so candidate code using `ws`,
      // `socket.io`, or any WebSocket library works the same as REST.
      '/api': { target: 'http://localhost:3000', changeOrigin: true, ws: true },
      '/socket.io': { target: 'http://localhost:3000', changeOrigin: true, ws: true },
    },
    watch: { usePolling: true, interval: 200 },
    // Vite host-check disabled — Traefik is the real gatekeeper. See init-react.sh.
    allowedHosts: true,
    hmr: process.env.PREVIEW_BASE_DOMAIN
      ? { protocol: 'wss', clientPort: 443 }
      : undefined,
  },
});
EOF
  fi

  cat > index.html <<EOF
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Full-Stack Sandbox</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.${CEXT}"></script>
  </body>
</html>
EOF

  cat > "src/main.${CEXT}" <<'EOF'
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
EOF

  if [ "$IS_TS" = "1" ]; then
    cat > tsconfig.json <<'EOF'
{
  "compilerOptions": {
    "target": "ES2020", "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext", "moduleResolution": "Bundler", "jsx": "react-jsx",
    "strict": true, "esModuleInterop": true, "skipLibCheck": true, "noEmit": true,
    "baseUrl": ".", "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src"]
}
EOF
  fi

  # App.* — fetches /api/products (proxied to Node) and renders cards.
  if [ "$USE_TAILWIND" = "1" ]; then
    printf '@import "tailwindcss";\n' > src/index.css
    cat > "src/App.${CEXT}" <<'EOF'
import './index.css';
import { useEffect, useState } from 'react';

export default function App() {
  const [products, setProducts] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/products')
      .then((r) => r.json())
      .then((d) => setProducts(d.products ?? []))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 p-8 text-gray-900">
      <h1 className="mb-1 text-3xl font-bold">Products</h1>
      <p className="mb-6 text-sm text-gray-500">
        Served by the Node API from the database. Edit <code>server/</code> or{' '}
        <code>client/</code> and watch it update live.
      </p>
      {loading ? <p className="text-gray-500">Loading…</p> : null}
      {error ? <p className="text-red-600">Failed to load: {error}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((p) => (
          <div key={p.id ?? p._id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">{p.name}</h2>
            <p className="mt-1 text-sm text-gray-500">{p.description}</p>
            <p className="mt-3 font-mono text-gray-900">${Number(p.price).toFixed(2)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
EOF
  else
    cat > "src/App.${CEXT}" <<'EOF'
import { useEffect, useState } from 'react';

const card = {
  border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff',
  padding: 20, boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
};

export default function App() {
  const [products, setProducts] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/products')
      .then((r) => r.json())
      .then((d) => setProducts(d.products ?? []))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ fontFamily: 'system-ui', minHeight: '100vh', background: '#f9fafb', color: '#111827', padding: 32 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Products</h1>
      <p style={{ color: '#6b7280', marginBottom: 24, fontSize: 14 }}>
        Served by the Node API from the database. Edit <code>server/</code> or <code>client/</code> and watch it update live.
      </p>
      {loading ? <p style={{ color: '#6b7280' }}>Loading…</p> : null}
      {error ? <p style={{ color: '#dc2626' }}>Failed to load: {error}</p> : null}
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
        {products.map((p) => (
          <div key={p.id ?? p._id} style={card}>
            <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{p.name}</h2>
            <p style={{ color: '#6b7280', fontSize: 14, marginTop: 4 }}>{p.description}</p>
            <p style={{ fontFamily: 'monospace', marginTop: 12 }}>${Number(p.price).toFixed(2)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
EOF
  fi
}

# =============================================================================
# Main
# =============================================================================
if [ -f /sandbox/client/package.json ]; then
  # ---- Resume: project already scaffolded; reinstall deps ----
  progress resume running 16 "existing project detected"
  ( cd /sandbox/server && npm install --no-audit --no-fund >/tmp/srv-install.log 2>&1 ) \
    || die "server npm install failed: $(tail -5 /tmp/srv-install.log)"
  ( cd /sandbox/client && npm install --no-audit --no-fund >/tmp/cli-install.log 2>&1 ) \
    || die "client npm install failed: $(tail -5 /tmp/cli-install.log)"
  progress resume done 35
else
  # ---- Fresh scaffold ----
  progress scaffold running 18 "server + client"
  scaffold_server
  scaffold_client
  progress scaffold done 30
fi

# ---- Start the database + seed sample data ----
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

# ---- Install deps (fresh path) ----
if [ ! -d /sandbox/server/node_modules ]; then
  progress install running 40 "server deps"
  ( cd /sandbox/server && npm install --no-audit --no-fund --prefer-offline >/tmp/srv-install.log 2>&1 ) \
    || die "server install failed: $(tail -5 /tmp/srv-install.log)"
fi
if [ ! -d /sandbox/client/node_modules ]; then
  progress install running 55 "client deps"
  ( cd /sandbox/client && npm install --no-audit --no-fund --prefer-offline >/tmp/cli-install.log 2>&1 ) \
    || die "client install failed: $(tail -5 /tmp/cli-install.log)"
  # Tailwind / shadcn (front end) — reuse the Phase-1 pre-init so a fresh combo
  # ships a working component.
  if [ "$USE_TAILWIND" = "1" ]; then
    progress tailwind running 62 "tailwind v4"
    ( cd /sandbox/client && npm install -D tailwindcss@4 @tailwindcss/vite >/tmp/tw.log 2>&1 ) \
      || die "tailwind install failed: $(tail -5 /tmp/tw.log)"
  fi
  if [ "$USE_SHADCN" = "1" ]; then
    progress shadcn running 66 "shadcn deps"
    ( cd /sandbox/client && npm install class-variance-authority clsx tailwind-merge lucide-react \
        radix-ui tw-animate-css @fontsource-variable/geist shadcn >/tmp/shadcn.log 2>&1 ) || true
  fi
fi

# ---- Start the Node server in the background (its own watcher) ----
progress server-start running 78 "starting node api"
SERVER_ENTRY=index.js
[ "$IS_TS" = "1" ] && SERVER_ENTRY=src/index.ts
( cd /sandbox/server && PORT=3000 exec npx tsx watch "$SERVER_ENTRY" ) >/sandbox/.serverlog 2>&1 &
# Wait for the API to answer before we hand the page to the user.
for i in $(seq 1 40); do
  curl -fsS "http://127.0.0.1:3000/api/health" >/dev/null 2>&1 && break
  sleep 1
done
curl -fsS "http://127.0.0.1:3000/api/health" >/dev/null 2>&1 \
  || progress server-start running 80 "api slow to start (continuing)"
progress server-start done 85 "node api up"

# ---- Exec the Vite dev server as the foreground process (the preview) ----
write_port 5173
progress ready done 100 "starting dev server"
cd /sandbox/client
exec npx vite --host 0.0.0.0 --port 5173
