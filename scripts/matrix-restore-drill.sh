#!/usr/bin/env bash
# Matrix disaster-recovery drill on an isolated, disposable copy of the stack.
#
#   scripts/matrix-restore-drill.sh [WORK_DIR]      (KEEP=1 leaves it running)
#
# WORK_DIR keeps the evidence and the decrypted archive; delete it afterwards.
#
# Exercises the production procedure end to end with real Synapse, MAS,
# Postgres and Element images:
#   1. setup.sh + setup-mas.sh, MAS migration, stack start
#   2. MAS-issued bridge admin token (register-user, issue-compatibility-token)
#   3. a room with messages and an uploaded media file
#   4. nightly-backup.sh: backup.sh, age encryption, upload to S3 (SeaweedFS)
#   5. host loss: volumes, generated config, .env and bridge data deleted
#   6. download, decrypt with the off-host age identity, restore.sh --verify
#      and restore.sh --yes into the empty checkout
#   7. signing key, token, history and media compared with the originals
#   8. set-public-urls.sh --apply on the restored stack
#
# para-idp and the bridge are stubs (a health endpoint, a source-bound SQLite
# file): browser sign-in through para-idp and the bridge's own recovery are not
# covered. Nothing here touches the operator's stack: the copy has its own
# Compose project, networks and volumes and publishes no ports.
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Not under /tmp or /var/folders: Docker Desktop cannot place the hardening
# overlay's nested bind mount inside a /private path.
WORK="${1:-$HOME/.cache/para-matrix-drill/$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$WORK"
WORK="$(cd "$WORK" && pwd)"
D="$WORK/paradrill" # checkout; its directory name is the Compose project
PROJECT=paradrill
NET=paradrill-s3
SERVER=matrix.drill.test
SOURCE_ID=drill-generation-1
EVIDENCE="$WORK/evidence.txt"

say() { printf '\n== %s\n' "$*"; }
ok() { echo "PASS  $*" | tee -a "$EVIDENCE"; }
fail() { echo "FAIL  $*" | tee -a "$EVIDENCE" >&2; exit 1; }
dc() { docker compose -p "$PROJECT" -f "$D/docker-compose.matrix.yaml" "$@"; }
api() { # METHOD PATH [curl args...] — client API from inside the Synapse container
  local method="$1" path="$2"; shift 2
  dc exec -T synapse curl -fsS -X "$method" -H "Authorization: Bearer $TOKEN" "$@" "http://localhost:8008$path"
}
cleanup() {
  [[ "${KEEP:-0}" == 1 ]] && { echo "KEEP=1: left running in $WORK"; return; }
  dc down -v --remove-orphans >/dev/null 2>&1 || true
  docker rm -f paradrill-s3 >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
}
trap cleanup EXIT
: >"$EVIDENCE"
echo "Matrix restore drill $(date -u +%FT%TZ) from $(git -C "$ROOT" rev-parse --short HEAD)$(git -C "$ROOT" diff --quiet -- deploy/matrix docker-compose.matrix.yaml || echo ' + uncommitted deploy/matrix changes')" >>"$EVIDENCE"

say "Preparing the isolated checkout in $D"
mkdir -p "$D/deploy/matrix" "$WORK/shims" "$WORK/offhost"
cp "$ROOT"/deploy/matrix/{setup.sh,setup-mas.sh,hardening.yaml,backup.sh,restore.sh,nightly-backup.sh,set-public-urls.sh} "$D/deploy/matrix/"
YAML_LIB="$(find "$ROOT/node_modules/.pnpm" -maxdepth 1 -name 'yaml@2*' | head -1)/node_modules/yaml"
node - "$YAML_LIB" "$ROOT/docker-compose.matrix.yaml" "$D/docker-compose.matrix.yaml" <<'JS'
const [lib, src, dst] = process.argv.slice(2)
const YAML = require(lib)
const fs = require('fs')
const c = YAML.parse(fs.readFileSync(src, 'utf8'))
for (const s of Object.values(c.services)) { delete s.container_name; delete s.ports }
// Stubs for the two images built from this monorepo.
Object.assign(c.services['para-idp'], {
  image: 'busybox:1.36',
  command: ['sh', '-c', 'mkdir -p /www && echo ok > /www/healthz && exec httpd -f -p 8090 -h /www'],
})
delete c.services['para-idp'].build
const bridge = c.services['matrix-bridge']
delete bridge.build
Object.assign(bridge, {
  image: 'busybox:1.36',
  command: ['tail', '-f', '/dev/null'],
  healthcheck: { disable: true },
  // A bind mount, so the drill can reach the database from the host the way
  // nightly-backup.sh does on Linux through the volume's mount source.
  volumes: ['./drill-bridge-data:/app/data'],
})
c.networks['para-edge'] = {}
delete c.volumes.bridge_data
fs.writeFileSync(dst, YAML.stringify(c))
JS
cat >"$D/.env" <<EOF
MATRIX_SERVER_NAME=$SERVER
MATRIX_DOMAIN=chat.drill.test
POSTGRES_PASSWORD=$(openssl rand -hex 16)
MATRIX_MAS_CLIENT_SECRET=$(openssl rand -hex 32)
MATRIX_ADMIN_TOKEN=unused-by-the-stub
EOF
MAS_SECRET="$(sed -n 's/^MATRIX_MAS_CLIENT_SECRET=//p' "$D/.env")"

say "Generating Synapse and MAS configuration"
bash "$D/deploy/matrix/setup.sh" >/dev/null
MAS_BRIDGE_ADMIN_SECRET="$MAS_SECRET" bash "$D/deploy/matrix/setup-mas.sh" >/dev/null
ok "setup.sh and setup-mas.sh generated configuration"

say "Starting databases, migrating MAS, starting the stack"
dc up -d --wait synapse-db mas-db >/dev/null
dc run --rm mas database migrate -c /config/config.yaml >/dev/null 2>&1
dc up -d --wait para-idp mas synapse >/dev/null
dc exec -T synapse curl -fsS http://mas:8081/health >/dev/null
ok "MAS migrated; Synapse and MAS healthy"
for path in /_matrix/federation/v1/version /_matrix/key/v2/server; do
  code="$(dc exec -T synapse curl -s -o /dev/null -w '%{http_code}' "http://localhost:8008$path")"
  [[ "$code" == 404 ]] || fail "Synapse served $path ($code)"
done
ok "Synapse serves no federation or key endpoints"

say "Issuing the bridge admin token from MAS"
dc exec -T mas mas-cli manage register-user -c /config/config.yaml --yes admin >/dev/null 2>&1
TOKEN_OUT="$(dc exec -T mas mas-cli manage issue-compatibility-token -c /config/config.yaml admin PARABRIDGE --yes-i-want-to-grant-synapse-admin-privileges 2>&1)"
TOKEN="$(grep -oE 'mct_[A-Za-z0-9_]+' <<<"$TOKEN_OUT" | head -1)"
[[ -n "$TOKEN" ]] || fail "issue-compatibility-token printed no token: $TOKEN_OUT"
api GET /_synapse/admin/v1/server_version >/dev/null || fail "MAS token is not a Synapse admin token"
WHO="$(api GET /_matrix/client/v3/account/whoami | python3 -c 'import json,sys; print(json.load(sys.stdin)["user_id"])')"
[[ "$WHO" == "@admin:$SERVER" ]] || fail "token belongs to $WHO"
ok "register-user + issue-compatibility-token gave a Synapse admin token for $WHO"

say "Creating history and media"
ROOM="$(api POST /_matrix/client/v3/createRoom -H 'Content-Type: application/json' -d '{"name":"drill"}' | python3 -c 'import json,sys; print(json.load(sys.stdin)["room_id"])')"
for i in 1 2 3; do
  api PUT "/_matrix/client/v3/rooms/$ROOM/send/m.room.message/drill$i" -H 'Content-Type: application/json' -d "{\"msgtype\":\"m.text\",\"body\":\"drill message $i\"}" >/dev/null
done
head -c 4096 /dev/urandom >"$WORK/media.bin"
MXC="$(dc exec -T synapse curl -fsS -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/octet-stream' --data-binary @- 'http://localhost:8008/_matrix/media/v3/upload?filename=drill.bin' <"$WORK/media.bin" | python3 -c 'import json,sys; print(json.load(sys.stdin)["content_uri"])')"
count_messages() { api GET "/_matrix/client/v3/rooms/$ROOM/messages?dir=b&limit=50" | python3 -c 'import json,sys; print(sum(e["type"]=="m.room.message" for e in json.load(sys.stdin)["chunk"]))'; }
media_sha() { api GET "/_matrix/client/v1/media/download/${MXC#mxc://}" | shasum -a 256 | cut -d' ' -f1; }
BEFORE_MSGS="$(count_messages)"
BEFORE_MEDIA="$(media_sha)"
BEFORE_KEY="$(shasum -a 256 "$D"/deploy/matrix/synapse/*.signing.key | cut -d' ' -f1)"
[[ "$BEFORE_MSGS" == 3 && "$BEFORE_MEDIA" == "$(shasum -a 256 "$WORK/media.bin" | cut -d' ' -f1)" ]] || fail "could not create history/media"
ok "room $ROOM with 3 messages and media $MXC"

say "Stub bridge database bound to PDS generation $SOURCE_ID"
mkdir -p "$D/drill-bridge-data"
python3 - "$D/drill-bridge-data/bridge.db" "$SOURCE_ID" <<'PY'
import sqlite3, sys
db = sqlite3.connect(sys.argv[1])
db.execute('CREATE TABLE sync_source (id INTEGER PRIMARY KEY, source_id TEXT NOT NULL)')
db.execute('INSERT INTO sync_source VALUES (1, ?)', (sys.argv[2],))
db.commit()
PY
dc up -d matrix-bridge >/dev/null

say "Off-host storage (S3) and age keys"
docker network create "$NET" >/dev/null
# SeaweedFS's S3 gateway: an S3-compatible bucket that is not this checkout.
# With no identities configured it accepts any credentials.
S3_PW="$(openssl rand -hex 16)"
docker run -d --name paradrill-s3 --network "$NET" --network-alias s3 \
  chrislusf/seaweedfs:3.80 server -s3 -dir=/data >/dev/null
docker build -q -t paradrill-age - >/dev/null <<'DOCKERFILE'
FROM alpine:3.20
RUN apk add --no-cache age
DOCKERFILE
cat >"$WORK/shims/age" <<EOF
#!/bin/sh
exec docker run --rm -i -v "$WORK:$WORK" -w "\$PWD" paradrill-age age "\$@"
EOF
cat >"$WORK/shims/aws" <<EOF
#!/bin/sh
exec docker run --rm -i --network $NET -v "$WORK:$WORK" -w "\$PWD" \
  -e AWS_ACCESS_KEY_ID=drill -e AWS_SECRET_ACCESS_KEY=$S3_PW -e AWS_DEFAULT_REGION=us-east-1 \
  amazon/aws-cli:2.27.0 "\$@"
EOF
chmod +x "$WORK/shims/age" "$WORK/shims/aws"
export PATH="$WORK/shims:$PATH"
docker run --rm -v "$WORK/offhost:/k" paradrill-age age-keygen -o /k/identity.txt 2>/dev/null
docker run --rm -v "$WORK/offhost:/k" paradrill-age age-keygen -y /k/identity.txt >"$WORK/recipients.txt"
for _ in $(seq 1 60); do aws s3 mb s3://drill --endpoint-url http://s3:8333 >/dev/null 2>&1 && break; sleep 1; done
ok "S3 bucket and age identity ready (identity kept outside the checkout)"

say "nightly-backup.sh: backup, encrypt, upload"
MATRIX_BACKUP_DIR="$D/backups/matrix" MATRIX_BACKUP_AGE_RECIPIENTS="$WORK/recipients.txt" \
  MATRIX_BACKUP_S3_ENDPOINT=http://s3:8333 MATRIX_BACKUP_S3_BUCKET=drill \
  MATRIX_BACKUP_TEXTFILE_DIR="$WORK/textfile" \
  bash "$D/deploy/matrix/nightly-backup.sh" | sed 's/^/   /'
ls "$D"/backups/matrix/para-matrix-*.tar.gz >/dev/null 2>&1 && fail "plaintext archive left on disk"
KEY="$(aws s3 ls s3://drill/matrix/ --endpoint-url http://s3:8333 | awk '{print $4}' | tail -1)"
[[ "$KEY" == para-matrix-*.tar.gz.age ]] || fail "no encrypted object in the bucket"
grep -q '^para_matrix_backup_last_success_timestamp_seconds ' "$WORK/textfile/para_matrix_backup.prom" || fail "no freshness metric"
ok "encrypted $KEY uploaded; no plaintext left; freshness metric written"

say "Simulating host loss"
dc down -v >/dev/null 2>&1
rm -rf "$D/deploy/matrix/synapse" "$D/deploy/matrix/mas" "$D/.env" "$D/drill-bridge-data" "$D/backups"
ok "volumes, generated config, .env, bridge data and local backups deleted"

say "Fetching, decrypting and verifying"
mkdir -p "$WORK/restore"
aws s3 cp "s3://drill/matrix/$KEY" "$WORK/restore/$KEY" --endpoint-url http://s3:8333 --only-show-errors
age -d -i "$WORK/offhost/identity.txt" -o "$WORK/restore/archive.tar.gz" "$WORK/restore/$KEY"
bash "$D/deploy/matrix/restore.sh" "$WORK/restore/archive.tar.gz" --verify | sed 's/^/   /'
ok "downloaded, decrypted with the off-host identity, verified"

say "Restoring into the empty checkout"
BRIDGE_DB_PATH="$D/drill-bridge-data/bridge.db" BRIDGE_PDS_SOURCE_ID="$SOURCE_ID" BRIDGE_PORT=1 \
  MATRIX_COMPOSE_PROJECT="$PROJECT" bash "$D/deploy/matrix/restore.sh" "$WORK/restore/archive.tar.gz" --yes 2>&1 | tail -3 | sed 's/^/   /'
dc up -d matrix-bridge >/dev/null

say "Comparing with the originals"
[[ "$(shasum -a 256 "$D"/deploy/matrix/synapse/*.signing.key | cut -d' ' -f1)" == "$BEFORE_KEY" ]] || fail "signing key changed"
ok "homeserver signing key identical"
api GET /_synapse/admin/v1/server_version >/dev/null || fail "MAS-issued token no longer valid"
ok "bridge admin token still valid (MAS database restored)"
[[ "$(count_messages)" == "$BEFORE_MSGS" ]] || fail "message history differs"
ok "room history: $BEFORE_MSGS messages"
[[ "$(media_sha)" == "$BEFORE_MEDIA" ]] || fail "media differs"
ok "media identical"
[[ "$(sqlite3 "$D/drill-bridge-data/bridge.db" 'SELECT source_id FROM sync_source WHERE id=1')" == "$SOURCE_ID" ]] || fail "bridge source binding lost"
ok "bridge database restored with its PDS generation binding"

say "Moving MAS to new public URLs on the restored stack"
MATRIX_MAS_PUBLIC_URL=https://auth.drill.test MATRIX_IDP_PUBLIC_URL=https://idp.drill.test \
  MATRIX_COMPOSE_FILE="$D/docker-compose.matrix.yaml" COMPOSE_PROJECT_NAME="$PROJECT" \
  bash "$D/deploy/matrix/set-public-urls.sh" --apply 2>&1 | tail -2 | sed 's/^/   /'
grep -q '^  issuer: https://auth.drill.test/$' "$D/deploy/matrix/mas/config.yaml" || fail "issuer not updated"
for _ in $(seq 1 30); do dc exec -T synapse curl -fsS http://mas:8081/health >/dev/null 2>&1 && break; sleep 2; done
api GET /_synapse/admin/v1/server_version >/dev/null || fail "token invalid after URL change"
ok "set-public-urls.sh --apply: MAS restarted on the new issuer, existing token still valid"

# The decrypted archive holds this drill's server keys; the evidence stays.
rm -f "$WORK/restore/archive.tar.gz"
echo
echo "Drill passed. Evidence: $EVIDENCE"
