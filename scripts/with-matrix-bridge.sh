#!/usr/bin/env bash
# with-matrix-bridge.sh — run a backend command with the PARA matrix-bridge
# attached.
#
# The bridge (services/matrix-bridge) serves the PARA app's /api endpoints and
# consumes the dev PDS firehose. It is started once the dev PDS accepts
# connections (its firehose consumer exits when it cannot connect), and both
# processes are stopped together on Ctrl-C or a fatal bridge error.
#
# Usage:
#   scripts/with-matrix-bridge.sh <command...>
#
# Environment (all optional):
#   BRIDGE_PORT            default 3001
#   BRIDGE_DB_PATH         default a per-run temporary SQLite database
#   BRIDGE_PDS_SOURCE_ID   stable identifier for the matching PDS data generation
#   BRIDGE_BACKFILL_FROM_START  set to 1 to replay available prior events
#   MATRIX_HOMESERVER_URL  default http://localhost:8008 — the local Synapse
#                          stack from docker-compose.matrix.yaml
#   MATRIX_ADMIN_TOKEN     auto-provisioned for the local stack when unset
#                          (scripts/get-matrix-dev-token.sh); placeholder if
#                          no Synapse is reachable
#   PDS_FIREHOSE_URL       default ws://localhost:2583 (the dev PDS). Service
#                          base only — the consumer appends /xrpc/... itself.
#   PLC_URL                default http://localhost:2582 — the dev-env mints
#                          DIDs on its own PLC; the public directory 404s them.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BRIDGE_DIR="$ROOT/services/matrix-bridge"
BRIDGE_PORT="${BRIDGE_PORT:-3001}"
TEMP_BRIDGE_DIR=''
PDS_HEALTH_URL="${PDS_HEALTH_URL:-http://localhost:2583/xrpc/_health}"

if [ $# -eq 0 ]; then
  echo "usage: $0 <command...>" >&2
  exit 64
fi

for port in 2583 "$BRIDGE_PORT"; do
  if command -v lsof >/dev/null 2>&1 && lsof -nP -tiTCP:"$port" -sTCP:LISTEN | grep -q .; then
    echo "Port $port is already in use; refusing to start a second dev stack." >&2
    exit 2
  fi
done

if [ -z "${BRIDGE_DB_PATH:-}" ]; then
  TEMP_BRIDGE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/para-bridge.XXXXXX")"
  BRIDGE_DB_PATH="$TEMP_BRIDGE_DIR/bridge.db"
  BRIDGE_PDS_SOURCE_ID="$(uuidgen)"
  BRIDGE_BACKFILL_FROM_START=1
fi

# Always clean-build the bridge: the root `pnpm build` does not cover this
# service (it is not in the root tsconfig references), tsc does not delete
# output of files removed from src (stale orphans have bitten us before), and
# timestamp-based staleness checks are not portable across find variants.
echo "⚙️  matrix-bridge: building..."
rm -rf "$BRIDGE_DIR/dist"
(cd "$BRIDGE_DIR" && pnpm run build)

mkdir -p "$(dirname "$BRIDGE_DB_PATH")"

BRIDGE_PID=''
BACKEND_PID=''

cleanup() {
  if [ -n "$BRIDGE_PID" ]; then
    kill_tree "$BRIDGE_PID"
  fi
  if [ -n "$BACKEND_PID" ]; then
    kill_tree "$BACKEND_PID"
  fi
  if [ -n "$TEMP_BRIDGE_DIR" ]; then
    rm -rf "$TEMP_BRIDGE_DIR"
  fi
}
kill_tree() {
  local child
  while read -r child; do
    [ -n "$child" ] && kill_tree "$child"
  done < <(pgrep -P "$1" 2>/dev/null || true)
  kill "$1" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# The backend itself (the dev-env, normally).
"$@" &
BACKEND_PID=$!

echo "⏳ matrix-bridge: waiting for dev PDS ($PDS_HEALTH_URL)..."
PDS_UP=false
for _ in $(seq 1 120); do
  if curl -sf -o /dev/null "$PDS_HEALTH_URL"; then
    PDS_UP=true
    break
  fi
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    echo "matrix-bridge: backend exited before the PDS came up" >&2
    wait "$BACKEND_PID"
    exit $?
  fi
  sleep 1
done
if [ "$PDS_UP" != true ]; then
  echo "matrix-bridge: PDS did not come up within 120s — starting the bridge anyway" >&2
fi

# Auto-start Synapse if Docker is available and Synapse is not reachable.
SYNAPSE_URL="${MATRIX_HOMESERVER_URL:-http://localhost:8008}"
if ! curl -sf -o /dev/null "$SYNAPSE_URL/_matrix/client/versions"; then
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    echo "🐳  matrix-bridge: auto-starting local Synapse container..."
    "$ROOT/scripts/matrix-stack.sh" up
    for _ in $(seq 1 30); do
      if curl -sf -o /dev/null "$SYNAPSE_URL/_matrix/client/versions"; then
        break
      fi
      sleep 1
    done
  fi
fi

# Obtain an admin token for the local Synapse stack unless the caller set one.
if [ -z "${MATRIX_ADMIN_TOKEN:-}" ]; then
  if MATRIX_ADMIN_TOKEN="$("$ROOT/scripts/get-matrix-dev-token.sh")"; then
    echo "🔑 matrix-bridge: using admin token from the local Synapse stack"
  else
    echo "matrix-bridge: no admin token available — Matrix-side calls will fail" >&2
    MATRIX_ADMIN_TOKEN=dev-admin-token
  fi
fi

# Read one key out of the repo .env. Deliberately not `source`: that file also
# holds production R2 and PDS credentials which this process has no business
# exporting. Always succeeds, so `set -e` does not abort on a missing key.
env_from_repo() {
  local key="$1"
  if [ -f "$ROOT/.env" ]; then
    sed -n "s/^${key}=//p" "$ROOT/.env" | tail -n1
  fi
  return 0
}

# Appservice credentials. Without these the bridge rejects Synapse's
# transaction pushes, so no room event ever reaches matrix_events and the
# whole ingestion half of the bridge is silently dead.
MATRIX_APPSERVICE_TOKEN="${MATRIX_APPSERVICE_TOKEN:-$(env_from_repo MATRIX_APPSERVICE_TOKEN)}"
MATRIX_HS_TOKEN="${MATRIX_HS_TOKEN:-$(env_from_repo MATRIX_HS_TOKEN)}"
# Rooms are created with m.room.encryption only when this is true, and they are
# never retro-encrypted. The native PARA chat engine refuses an unencrypted
# room (ENCRYPTED_ROOM_REQUIRED), so a false here means the native screen can
# open nothing that this bridge created.
MATRIX_ENABLE_ENCRYPTION="${MATRIX_ENABLE_ENCRYPTION:-$(env_from_repo MATRIX_ENABLE_ENCRYPTION)}"
# What GET /api/matrix-identity hands a native client as its homeserver. The
# built-in fallback is https://matrix.para.social, which does not resolve; on a
# phone, localhost is the phone. Set it to the Mac's LAN address.
MATRIX_PUBLIC_HOMESERVER_URL="${MATRIX_PUBLIC_HOMESERVER_URL:-$(env_from_repo MATRIX_PUBLIC_HOMESERVER_URL)}"
# The identity broker every bridge endpoint authenticates against (mubEZ).
M8_BASE_URL="${M8_BASE_URL:-http://localhost:8787/v1}"

if [ -z "$MATRIX_HS_TOKEN" ]; then
  echo "matrix-bridge: MATRIX_HS_TOKEN unset — Synapse transaction pushes will be rejected (401)" >&2
fi
if [ "$MATRIX_ENABLE_ENCRYPTION" != true ]; then
  echo "matrix-bridge: MATRIX_ENABLE_ENCRYPTION is not true — rooms will be created unencrypted and the native chat engine will refuse them" >&2
fi

start_bridge() {
  (
    cd "$BRIDGE_DIR"
    export NODE_ENV=development
    export PORT="$BRIDGE_PORT"
    export PDS_FIREHOSE_URL="${PDS_FIREHOSE_URL:-ws://localhost:2583}"
    export PLC_URL="${PLC_URL:-http://localhost:2582}"
    export MATRIX_HOMESERVER_URL="${MATRIX_HOMESERVER_URL:-http://localhost:8008}"
    export MATRIX_ADMIN_TOKEN
    export MATRIX_APPSERVICE_TOKEN
    export MATRIX_HS_TOKEN
    export MATRIX_ENABLE_ENCRYPTION
    export MATRIX_PUBLIC_HOMESERVER_URL
    export M8_BASE_URL
    export BRIDGE_DB_PATH
    export BRIDGE_PDS_SOURCE_ID
    export BRIDGE_BACKFILL_FROM_START
    exec node --enable-source-maps dist/index.js
  ) &
  BRIDGE_PID=$!
}

start_bridge
echo "🌉 matrix-bridge: started on :$BRIDGE_PORT (db: $BRIDGE_DB_PATH)"

# A failed bridge must stop the stack rather than restart with the same bad cursor.
while :; do
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    wait "$BACKEND_PID"
    exit $?
  fi
  if ! kill -0 "$BRIDGE_PID" 2>/dev/null; then
    if wait "$BRIDGE_PID"; then
      echo 'matrix-bridge: exited unexpectedly' >&2
    else
      echo 'matrix-bridge: failed; stopping its dev backend' >&2
    fi
    exit 1
  fi
  sleep 1
done
