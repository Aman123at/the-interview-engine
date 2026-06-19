#!/bin/sh
# Run DB migrations idempotently, then exec the server.
# Safe on every boot — the migrator's `_migrations` ledger no-ops applied entries.
set -eu

# Resolve *_FILE secrets into their env vars (Docker secrets pattern).
# DATABASE_PASSWORD_FILE is interpolated into the DATABASE_URL placeholder.
if [ -n "${DATABASE_PASSWORD_FILE:-}" ] && [ -f "$DATABASE_PASSWORD_FILE" ]; then
  __pw=$(tr -d '\n\r' < "$DATABASE_PASSWORD_FILE")
  # URL-encode reserved chars conservatively (@, :, /, ?, #, %).
  __pw_enc=$(printf '%s' "$__pw" | sed -e 's/%/%25/g' -e 's/@/%40/g' -e 's/:/%3A/g' -e 's,/,%2F,g' -e 's/?/%3F/g' -e 's/#/%23/g')
  export DATABASE_URL="$(printf '%s' "${DATABASE_URL:-}" | sed "s|__PG_PASSWORD__|${__pw_enc}|")"
fi
for var in JWT_ACCESS_SECRET JWT_REFRESH_SECRET; do
  file_var="${var}_FILE"
  eval "fp=\${$file_var:-}"
  if [ -n "${fp:-}" ] && [ -f "$fp" ]; then
    eval "export $var=\"$(tr -d '\n\r' < "$fp")\""
  fi
done

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "[entrypoint] applying database migrations…"
  node dist/db/migrate.js up
else
  echo "[entrypoint] RUN_MIGRATIONS=false — skipping migrations"
fi

echo "[entrypoint] starting server: $*"
exec "$@"
