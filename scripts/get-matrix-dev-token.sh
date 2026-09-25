#!/usr/bin/env bash
# get-matrix-dev-token.sh — ensure a Matrix admin account exists on the local
# Synapse stack (docker-compose.matrix.yaml, para-matrix-synapse on :8008) and
# print a valid access token for it, caching the token at
# data/matrix/admin-token.
#
# The matrix-bridge authenticates to Synapse's admin API with this token
# (MATRIX_ADMIN_TOKEN). The cached token is reused only if it can list rooms:
# MAS's static admin token passes server_version but fails on room messages.
#
# Usage:
#   scripts/get-matrix-dev-token.sh     # prints the token on stdout

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOKEN_FILE="$ROOT/data/matrix/admin-token"
SYNAPSE_CONTAINER="${SYNAPSE_CONTAINER:-para-matrix-synapse}"
SYNAPSE_URL="${MATRIX_HOMESERVER_URL:-http://localhost:8008}"
ADMIN_USER="${MATRIX_ADMIN_USER:-bridge-admin}"
ADMIN_PASS="${MATRIX_ADMIN_PASSWORD:-para-dev-bridge-admin}"

token_ok() {
  local t="${1:-}"
  [ -n "$t" ] || return 1
  curl -sf -H "Authorization: Bearer $t" \
    "$SYNAPSE_URL/_synapse/admin/v1/rooms?limit=1" >/dev/null 2>&1
}

cache_token() {
  mkdir -p "$(dirname "$TOKEN_FILE")"
  umask 077
  printf '%s' "$1" >"$TOKEN_FILE"
}

if [ -s "$TOKEN_FILE" ] && token_ok "$(cat "$TOKEN_FILE")"; then
  cat "$TOKEN_FILE"
  exit 0
fi

# Use the local stack's existing admin session if available. Never send the
# local .env token to a configured remote homeserver.
if [[ "$SYNAPSE_URL" =~ ^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?/?$ ]] && [ -f "$ROOT/.env" ]; then
  ENV_TOKEN="$(sed -n 's/^MATRIX_ADMIN_TOKEN=//p' "$ROOT/.env" | tail -n1)"
  if token_ok "$ENV_TOKEN"; then
    cache_token "$ENV_TOKEN"
    echo "get-matrix-dev-token: using validated local .env admin token" >&2
    cat "$TOKEN_FILE"
    exit 0
  fi
fi

if ! curl -sf -o /dev/null "$SYNAPSE_URL/_matrix/client/versions"; then
  echo "get-matrix-dev-token: no Synapse reachable at $SYNAPSE_URL" >&2
  echo "  start the stack first:  docker compose -f docker-compose.matrix.yaml up -d" >&2
  exit 1
fi

# If Synapse authentication is delegated to MAS (MSC3861), use the static admin_token.
MSC3861_CONFIG="$ROOT/deploy/matrix/synapse/zz-para-msc3861.yaml"
if [ -f "$MSC3861_CONFIG" ]; then
  MSC_TOKEN="$(grep 'admin_token:' "$MSC3861_CONFIG" | head -n1 | awk '{print $2}' | tr -d '\r\n"'\''')"
  if [ -n "$MSC_TOKEN" ]; then
    if token_ok "$MSC_TOKEN"; then
      cache_token "$MSC_TOKEN"
      echo "get-matrix-dev-token: using MSC3861 admin token (cached at $TOKEN_FILE)" >&2
      printf '%s' "$MSC_TOKEN"
      exit 0
    fi
  fi
fi

# Register the admin user if it does not exist yet. Fails with "user already
# exists" otherwise, which is fine. registration_shared_secret comes from the
# generated homeserver.yaml mounted at /config.
if ! docker exec "$SYNAPSE_CONTAINER" register_new_matrix_user \
  -u "$ADMIN_USER" -p "$ADMIN_PASS" -a -c /config/homeserver.yaml \
  http://localhost:8008 >/dev/null 2>&1; then
  echo "get-matrix-dev-token: registration failed (continuing — the user may already exist)" >&2
fi

TOKEN="$(curl -sf -X POST "$SYNAPSE_URL/_matrix/client/v3/login" \
  -H 'Content-Type: application/json' \
  -d "{\"type\":\"m.login.password\",\"identifier\":{\"type\":\"m.id.user\",\"user\":\"$ADMIN_USER\"},\"password\":\"$ADMIN_PASS\"}" |
  python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')" || {
  echo "get-matrix-dev-token: login failed for $ADMIN_USER — if the user exists with a different password, pick another MATRIX_ADMIN_USER or fix it on the homeserver" >&2
  exit 1
}

cache_token "$TOKEN"

echo "get-matrix-dev-token: issued admin token for @$ADMIN_USER (cached at $TOKEN_FILE)" >&2
printf '%s' "$TOKEN"
