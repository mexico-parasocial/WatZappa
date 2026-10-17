#!/usr/bin/env bash
# An isolated persistent acceptance profile; leaves the current demo and other projects running.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PARA_DEV_ENV_DATA="${PARA_MESSAGING_DATA:-$ROOT/.messaging-dev-data}"
export DEV_ENV_COMPOSE_PROJECT=para-messaging
export DEV_ENV_PG_PORT=5544
export DEV_ENV_REDIS_PORT=6481
export DB_POSTGRES_SCHEMA=para_messaging
export DEV_ENV_INTROSPECT_PORT=3581
export DEV_ENV_PLC_PORT=3582
export DEV_ENV_PDS_PORT=3583
export DEV_ENV_BSKY_PORT=3584
export DEV_ENV_OZONE_PORT=3587
export DEV_ENV_CHAT_PORT=3590
export BRIDGE_PORT="${BRIDGE_PORT:-3001}"
export M8_BASE_URL="${M8_BASE_URL:-http://localhost:8788/v1}"
export DEV_ENV_M8_URL="$M8_BASE_URL"
export MUBEZ_ENV="$PARA_DEV_ENV_DATA/m8/.env"
if [[ ! -f "$MUBEZ_ENV" ]]; then
  echo 'Initialize the isolated broker first: bash scripts/messaging-broker.sh' >&2
  exit 2
fi
exec "$ROOT/scripts/dev-env-persistent.sh"
