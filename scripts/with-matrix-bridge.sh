#!/usr/bin/env bash
# with-matrix-bridge.sh — run a backend command with the PARA matrix-bridge
# attached.
#
# The bridge (services/matrix-bridge) serves the PARA app's /api endpoints and
# consumes the dev PDS firehose. It is started once the dev PDS accepts
# connections (its firehose consumer exits when it cannot connect), restarted
# if it dies while the backend is still up, and stopped together with the
# backend on Ctrl-C.
#
# Usage:
#   scripts/with-matrix-bridge.sh <command...>
#
# Environment (all optional):
#   BRIDGE_PORT            default 3001
#   BRIDGE_DB_PATH         default <repo>/data/bridge/bridge.db
#   MATRIX_HOMESERVER_URL  default http://localhost:8008 — the local Synapse
#                          stack from docker-compose.matrix.yaml
#   MATRIX_ADMIN_TOKEN     auto-provisioned for the local stack when unset
#                          (scripts/get-matrix-dev-token.sh); placeholder if
#                          no Synapse is reachable
#   PDS_FIREHOSE_URL       default ws://localhost:2583/... (the dev PDS)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BRIDGE_DIR="$ROOT/services/matrix-bridge"
BRIDGE_PORT="${BRIDGE_PORT:-3001}"
BRIDGE_DB_PATH="${BRIDGE_DB_PATH:-$ROOT/data/bridge/bridge.db}"
PDS_HEALTH_URL="${PDS_HEALTH_URL:-http://localhost:2583/xrpc/_health}"

if [ $# -eq 0 ]; then
  echo "usage: $0 <command...>" >&2
  exit 64
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

cleanup() {
  if [ -n "$BRIDGE_PID" ]; then
    kill "$BRIDGE_PID" 2>/dev/null || true
  fi
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

# Obtain an admin token for the local Synapse stack unless the caller set one.
if [ -z "${MATRIX_ADMIN_TOKEN:-}" ]; then
  if MATRIX_ADMIN_TOKEN="$("$ROOT/scripts/get-matrix-dev-token.sh")"; then
    echo "🔑 matrix-bridge: using admin token from the local Synapse stack"
  else
    echo "matrix-bridge: no admin token available — Matrix-side calls will fail" >&2
    MATRIX_ADMIN_TOKEN=dev-admin-token
  fi
fi

start_bridge() {
  (
    cd "$BRIDGE_DIR"
    export NODE_ENV=development
    export PORT="$BRIDGE_PORT"
    export PDS_FIREHOSE_URL="${PDS_FIREHOSE_URL:-ws://localhost:2583/xrpc/com.atproto.sync.subscribeRepos}"
    export MATRIX_HOMESERVER_URL="${MATRIX_HOMESERVER_URL:-http://localhost:8008}"
    export MATRIX_ADMIN_TOKEN
    export BRIDGE_DB_PATH
    exec node --enable-source-maps dist/index.js
  ) &
  BRIDGE_PID=$!
}

start_bridge
echo "🌉 matrix-bridge: started on :$BRIDGE_PORT (db: $BRIDGE_DB_PATH)"

# Supervise until the backend exits, restarting the bridge if it dies.
while :; do
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    wait "$BACKEND_PID"
    exit $?
  fi
  if ! kill -0 "$BRIDGE_PID" 2>/dev/null; then
    wait "$BRIDGE_PID" || true
    echo "matrix-bridge: exited — restarting in 2s..." >&2
    sleep 2
    start_bridge
  fi
  sleep 1
done
