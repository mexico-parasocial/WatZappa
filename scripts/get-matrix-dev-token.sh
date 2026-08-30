#!/usr/bin/env bash
# get-matrix-dev-token.sh — ensure a Matrix admin account exists on the local
# Synapse stack (docker-compose.matrix.yaml, para-matrix-synapse on :8008) and
# print a valid access token for it, caching the token at
# data/matrix/admin-token.
#
# The matrix-bridge authenticates to Synapse's admin API with this token
# (MATRIX_ADMIN_TOKEN). Tokens do not expire, so the cached one is reused after
# a /account/whoami check; on failure the admin user is (re-)registered and a
# fresh token is issued.
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
  [ -s "$TOKEN_FILE" ] &&
    curl -sf -H "Authorization: Bearer $(cat "$TOKEN_FILE")" \
      "$SYNAPSE_URL/_matrix/client/v3/account/whoami" >/dev/null 2>&1
}

if token_ok; then
  cat "$TOKEN_FILE"
  exit 0
fi

if ! curl -sf -o /dev/null "$SYNAPSE_URL/_matrix/client/versions"; then
  echo "get-matrix-dev-token: no Synapse reachable at $SYNAPSE_URL" >&2
  echo "  start the stack first:  docker compose -f docker-compose.matrix.yaml up -d" >&2
  exit 1
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

mkdir -p "$(dirname "$TOKEN_FILE")"
umask 077
printf '%s' "$TOKEN" >"$TOKEN_FILE"

echo "get-matrix-dev-token: issued admin token for @$ADMIN_USER (cached at $TOKEN_FILE)" >&2
printf '%s' "$TOKEN"
