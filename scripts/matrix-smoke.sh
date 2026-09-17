#!/usr/bin/env bash
# Matrix stack smoke test: boots Synapse + bridge (docker-compose.matrix.yaml)
# and proves the appservice paths against a REAL Synapse:
#   1. health
#   2. appservice registration + namespace claim (m.login.application_service)
#   3. transaction push: accept, dedup, 401 on wrong hs_token
#   4. event ingestion lands in the bridge DB
#   5. SSE delivers hello + chat.unread (M8 auth via a local stub)
#   6. /api/matrix-token mints a device session Synapse can list
#
# Usage: scripts/matrix-smoke.sh   (or: make matrix-smoke)
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE="docker compose -f docker-compose.matrix.yaml"
BRIDGE=http://127.0.0.1:3001
SYNAPSE=http://127.0.0.1:8008
M8_PORT=8788
STUB_PID=""

AS_TOKEN="$(grep '^MATRIX_APPSERVICE_TOKEN=' .env | cut -d= -f2-)"
HS_TOKEN="$(grep '^MATRIX_HS_TOKEN=' .env | cut -d= -f2-)"
ADMIN_TOKEN="$(grep '^MATRIX_ADMIN_TOKEN=' .env | cut -d= -f2-)"
if [[ -z "$AS_TOKEN" || -z "$HS_TOKEN" || -z "$ADMIN_TOKEN" ]]; then
  echo "FAIL: .env needs MATRIX_APPSERVICE_TOKEN, MATRIX_HS_TOKEN, MATRIX_ADMIN_TOKEN" >&2
  exit 1
fi

SMOKE_MXID="@did-plc-smoketest000000000000000000:localhost"
TXN_ID=" smoke-txn-1"  # leading space on purpose? no — clean below
TXN_ID="smoke-txn-1"

cleanup() {
  [[ -n "$STUB_PID" ]] && kill "$STUB_PID" 2>/dev/null || true
  $COMPOSE rm --force --stop synapse matrix-bridge >/dev/null 2>&1 || true
}
trap cleanup EXIT

step() { printf '\n== %s\n' "$1"; }
fail() { echo "FAIL: $*" >&2; exit 1; }

step "0. shared network + build"
docker network inspect para-edge >/dev/null 2>&1 || docker network create para-edge
$COMPOSE build matrix-bridge >/dev/null

step "1. boot synapse"
$COMPOSE up -d --wait synapse synapse-db >/dev/null

step "2. m8 stub + bridge"
node scripts/m8-stub/server.mjs "$M8_PORT" &
STUB_PID=$!
sleep 0.5
M8_BASE_URL="http://host.docker.internal:${M8_PORT}/v1" $COMPOSE up -d --wait matrix-bridge >/dev/null

step "3. health"
curl -sf "$BRIDGE/healthz" >/dev/null || fail "bridge healthz"
echo "ok"

step "4. appservice registration + device login"
# Register the namespace user as an admin (mirrors the bridge's upsert),
# then log in as the appservice: proves registration + exclusive namespace.
curl -sf -XPOST "$SYNAPSE/_synapse/admin/v1/users/$SMOKE_MXID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' \
  -d '{"password":"smoke-only-throwaway","admin":false,"displayname":"Smoke"}' >/dev/null || true
LOGIN=$(curl -sf -XPOST "$SYNAPSE/_matrix/client/v3/login" \
  -H "Authorization: Bearer $AS_TOKEN" -H 'content-type: application/json' \
  -d "{\"type\":\"m.login.application_service\",\"identifier\":{\"type\":\"m.id.user\",\"user\":\"$SMOKE_MXID\"},\"device_id\":\"PARA-SMOKE-1\"}")
echo "$LOGIN" | grep -q '"device_id":"PARA-SMOKE-1"' || fail "appservice login returned no device: $LOGIN"
echo "appservice login ok (real device)"

step "5. transaction push"
BODY='{"events":[{"event_id":"$smoke-1","room_id":"!smoke:localhost","sender":"'"$SMOKE_MXID"'","type":"m.room.message","origin_server_ts":1}]}'
CODE=$(curl -s -o /dev/null -w '%{http_code}' -XPUT "$BRIDGE/_matrix/app/unstable/transactions/$TXN_ID?access_token=$HS_TOKEN" \
  -H 'content-type: application/json' -d "$BODY")
[[ "$CODE" == "200" ]] || fail "txn accept got $CODE"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -XPUT "$BRIDGE/_matrix/app/unstable/transactions/$TXN_ID?access_token=$HS_TOKEN" \
  -H 'content-type: application/json' -d "$BODY")
[[ "$CODE" == "200" ]] || fail "txn dedup got $CODE"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -XPUT "$BRIDGE/_matrix/app/unstable/transactions/smoke-txn-bad?access_token=wrong" \
  -H 'content-type: application/json' -d "$BODY")
[[ "$CODE" == "401" ]] || fail "wrong hs_token got $CODE (want 401)"
echo "accept/dedup/401 ok"

step "6. ingestion in bridge DB"
ROWS=$(docker exec para-matrix-bridge sqlite3 /data/bridge.db \
  "select count(*) from matrix_events where event_id='\$smoke-1'")
[[ "$ROWS" -ge 1 ]] || fail "event not ingested (rows=$ROWS)"
echo "ingested"

step "7. SSE delivers chat.unread"
( timeout 8 curl -sN -H 'Authorization: Bearer smoke-any' "$BRIDGE/api/events" > /tmp/matrix-smoke-sse.txt ) &
SSE_PID=$!
sleep 2
curl -sf -XPUT "$BRIDGE/_matrix/app/unstable/transactions/smoke-txn-2?access_token=$HS_TOKEN" \
  -H 'content-type: application/json' -d "$BODY" >/dev/null
wait $SSE_PID 2>/dev/null || true
grep -q 'event: hello' /tmp/matrix-smoke-sse.txt || fail "no hello in SSE"
grep -q 'event: chat.unread' /tmp/matrix-smoke-sse.txt || fail "no chat.unread in SSE"
echo "hello + chat.unread ok"

step "8. /api/matrix-token mints a Synapse-visible device"
docker exec para-matrix-bridge sqlite3 /data/bridge.db \
  "insert or replace into user_matrix_map(did,matrix_user_id,password) values('did:plc:smoketest000000000000000000','${SMOKE_MXID}','')"
TOK=$(curl -sf -XPOST "$BRIDGE/api/matrix-token" \
  -H 'Authorization: Bearer smoke-any' -H 'content-type: application/json' \
  -d '{"friendlyName":"smoke"}')
echo "$TOK" | grep -q '"sessionId"' || fail "no sessionId: $TOK"
DEVID=$(echo "$TOK" | sed -n 's/.*"deviceId":"\([^"]*\)".*/\1/p')
DEVLIST=$(curl -sf "$SYNAPSE/_synapse/admin/v2/users/$SMOKE_MXID/devices" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
echo "$DEVLIST" | grep -q "$DEVID" || fail "device $DEVID not listed in Synapse: $DEVLIST"
echo "device session minted and visible ($DEVID)"

step "ALL GREEN ✅"
