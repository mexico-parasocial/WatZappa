#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${PARA_DEV_ENV_DATA:-$ROOT/.dev-env-data}"
INFRA="$ROOT/packages/dev-infra"

# A persistent profile is one storage unit. Mixing directories breaks DID and cursor identity.
for name in DEV_ENV_PDS_DATA_DIRECTORY DEV_ENV_PDS_BLOBSTORE_DIRECTORY DEV_ENV_PLC_DIRECTORY BRIDGE_DB_PATH; do
  if [[ -n "${!name:-}" ]]; then
    echo "$name cannot override the persistent profile; set PARA_DEV_ENV_DATA instead" >&2
    exit 2
  fi
done

if ! command -v docker >/dev/null || ! docker info >/dev/null 2>&1; then
  echo 'Docker must be running for persistent PostgreSQL and Redis.' >&2
  exit 2
fi

for port in 2581 2582 2583 2584 2587 2590 "${BRIDGE_PORT:-3001}"; do
  if command -v lsof >/dev/null && lsof -nP -tiTCP:"$port" -sTCP:LISTEN | grep -q .; then
    echo "Port $port is already in use. Stop that dev stack before starting another." >&2
    exit 2
  fi
done

mkdir -p "$DATA_DIR/pds" "$DATA_DIR/blobs" "$DATA_DIR/plc" "$DATA_DIR/bridge"
SOURCE_FILE="$DATA_DIR/pds/instance-id"
if [[ ! -f "$SOURCE_FILE" ]]; then
  umask 077
  uuidgen > "$SOURCE_FILE"
fi

cd "$ROOT/packages/dev-env"
pnpm run build
node --enable-source-maps dist/local-doctor.js "$DATA_DIR"

# Force regeneration of the migration registry; incremental builds can leave
# an obsolete dist/index.js after a migration was renamed on another branch.
cd "$ROOT/packages/bsky"
../../node_modules/.bin/tsc --build tsconfig.build.json --force

# The durable db and redis containers are deliberately left running on exit.
docker compose -f "$INFRA/docker-compose.yaml" up -d --wait db redis
node "$ROOT/scripts/check-dev-migrations.mjs"

cd "$ROOT/packages/dev-env"

export NODE_ENV=development
export DB_POSTGRES_URL=postgresql://pg:password@127.0.0.1:5434/postgres
export REDIS_HOST=127.0.0.1:6381
export DB_POSTGRES_SCHEMA=para_local
export DEV_ENV_PDS_DATA_DIRECTORY="$DATA_DIR/pds"
export DEV_ENV_PDS_BLOBSTORE_DIRECTORY="$DATA_DIR/blobs"
export DEV_ENV_PLC_DIRECTORY="$DATA_DIR/plc"
export DEV_ENV_PDS_REPO_BACKFILL_LIMIT_MS=315360000000
export DEV_ENV_SKIP_MOCK_SETUP=1
export DEV_ENV_SKIP_PARA_DEMO_SEED=1
export BRIDGE_DB_PATH="$DATA_DIR/bridge/bridge.db"
export BRIDGE_PDS_SOURCE_ID="$(cat "$SOURCE_FILE")"
export BRIDGE_BACKFILL_FROM_START=1
export DEV_ENV_M8_URL="${DEV_ENV_M8_URL:-http://localhost:8787/v1}"
MUBEZ_ENV="${MUBEZ_DIR:-$ROOT/../mubEZ}/.env"
export DEV_ENV_M8_RESOLVER_SECRET="${DEV_ENV_M8_RESOLVER_SECRET:-$(sed -n 's/^CIVIC_DELEGATION_RESOLVER_SECRET=//p' "$MUBEZ_ENV" 2>/dev/null | tail -n1)}"

echo "Persistent dev profile: $DATA_DIR (PostgreSQL schema: $DB_POSTGRES_SCHEMA)"
exec "$ROOT/scripts/with-matrix-bridge.sh" \
  node --enable-source-maps dist/bin.js
