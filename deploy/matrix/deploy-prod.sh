#!/bin/bash
set -euo pipefail

# ═════════════════════════════════════════════════════════════════════════════
# PARA Matrix production deploy — Synapse + MAS + para-idp + Element + bridge
#
# Run on the server, from the deployment checkout. Idempotent: generation steps
# skip when their config exists, and re-running only restarts what changed.
# ansible/roles/matrix_stack is the same sequence with an MAS doctor check and a
# probe through the public edge; prefer it when the host is managed by Ansible.
#
# Authentication is delegated to MAS: Synapse has no password login, so the
# bridge's admin token is a MAS compatibility token, not a /login result.
# ═════════════════════════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
COMPOSE_FILE="${REPO_ROOT}/docker-compose.matrix.yaml"
ENV_FILE="${REPO_ROOT}/.env"
ADMIN_USER="${MATRIX_ADMIN_USER:-admin}"

dc() { docker compose -f "$COMPOSE_FILE" "$@"; }
die() { echo "❌ $*" >&2; exit 1; }

# Read KEY=VALUE lines without evaluating them (.env is Compose syntax, not
# shell). Surrounding quotes are stripped.
load_env() {
    local line key value
    while IFS= read -r line || [ -n "$line" ]; do
        [[ "$line" =~ ^(MATRIX_|POSTGRES_|BRIDGE_|PDS_FIREHOSE_URL=|PARA_AUTHORITY_SERVICE_TOKEN=) ]] || continue
        key="${line%%=*}"
        value="${line#*=}"
        value="${value%\"}"; value="${value#\"}"
        value="${value%\'}"; value="${value#\'}"
        export "$key=$value"
    done < "$ENV_FILE"
}

wait_for() {
    local what="$1"; shift
    for _ in $(seq 1 60); do
        if "$@" >/dev/null 2>&1; then echo "✅ ${what}"; return 0; fi
        sleep 2
    done
    die "${what}: not ready after 120s (docker compose -f ${COMPOSE_FILE} logs)"
}

echo "═══════════════════════════════════════════════════════════════"
echo "  PARA Matrix production deploy"
echo "═══════════════════════════════════════════════════════════════"

# ─── 1. Operator configuration ───────────────────────────────────────────────
[ -f "$ENV_FILE" ] || die ".env not found at $ENV_FILE"
load_env

missing=()
for key in MATRIX_SERVER_NAME POSTGRES_PASSWORD MATRIX_MAS_PUBLIC_URL MATRIX_IDP_PUBLIC_URL \
           MATRIX_MAS_CLIENT_SECRET PDS_FIREHOSE_URL BRIDGE_AUTHORITY_APPVIEW_URL PARA_AUTHORITY_SERVICE_TOKEN; do
    [ -n "${!key:-}" ] || missing+=("$key")
done
[ "${#missing[@]}" -eq 0 ] || die "Set in .env: ${missing[*]}"
[ "$POSTGRES_PASSWORD" != "changeme" ] || die "POSTGRES_PASSWORD is the placeholder 'changeme'"
[[ "$MATRIX_MAS_CLIENT_SECRET" =~ ^[a-f0-9]{64}$ ]] \
    || die "MATRIX_MAS_CLIENT_SECRET must be 64 lowercase hex characters (openssl rand -hex 32)"
for url in "$MATRIX_MAS_PUBLIC_URL" "$MATRIX_IDP_PUBLIC_URL"; do
    [[ "$url" == https://* ]] || die "${url} must be https:// in production"
done
echo "✅ .env has the required Matrix settings for ${MATRIX_SERVER_NAME}"

# The containerised Caddy and Prometheus reach Synapse, MAS, para-idp, Element
# and the bridge over this network.
docker network inspect para-edge >/dev/null 2>&1 || docker network create para-edge >/dev/null
echo "✅ para-edge network present"

# ─── 2. Generate configuration (each step skips when its config exists) ──────
bash "${SCRIPT_DIR}/setup.sh"
# The bridge's MAS service client and its secret are the same value.
MAS_BRIDGE_ADMIN_SECRET="$MATRIX_MAS_CLIENT_SECRET" bash "${SCRIPT_DIR}/setup-mas.sh"

# ─── 3. Databases, then the one-way MAS migration ────────────────────────────
cd "$REPO_ROOT"
dc build para-idp matrix-bridge
dc up -d synapse-db mas-db
wait_for "Synapse database" dc exec -T synapse-db pg_isready -U "${POSTGRES_USER:-pg}"
wait_for "MAS database" dc exec -T mas-db pg_isready -U "${POSTGRES_USER:-pg}"
echo "ℹ️  MAS migrations are one-way. A version bump needs a backup first (backup.sh)."
dc run --rm mas database migrate -c /config/config.yaml

# ─── 4. Identity, auth and homeserver ────────────────────────────────────────
dc up -d para-idp mas synapse
wait_for "para-idp" curl -fsS http://127.0.0.1:8090/healthz
wait_for "MAS" curl -fsS http://127.0.0.1:8081/health
wait_for "Synapse" curl -fsS http://127.0.0.1:8008/health
dc exec -T mas mas-cli doctor -c /config/config.yaml || \
    echo "⚠️  mas-cli doctor reported problems. Its /login probe fails without the edge proxy; read the other checks."

# ─── 5. Bridge admin token (issued by MAS) ───────────────────────────────────
# The admin user is the creator of every community room the bridge provisions,
# so keep the same localpart for the life of the server.
token_ok() {
    curl -fsS -H "Authorization: Bearer $1" \
        "http://127.0.0.1:8008/_synapse/admin/v1/server_version" >/dev/null 2>&1
}
if [ -z "${MATRIX_ADMIN_TOKEN:-}" ] || [ "$MATRIX_ADMIN_TOKEN" = "<fill-after-setup>" ]; then
    cat <<EOF
⏸️  MATRIX_ADMIN_TOKEN is not set. Issue it from MAS (no password is involved):

   docker compose -f ${COMPOSE_FILE} exec mas \\
     mas-cli manage register-user -c /config/config.yaml --yes ${ADMIN_USER}   # first deploy only
   docker compose -f ${COMPOSE_FILE} exec mas \\
     mas-cli manage issue-compatibility-token -c /config/config.yaml ${ADMIN_USER} PARABRIDGE \\
     --yes-i-want-to-grant-synapse-admin-privileges

   Put the printed token in .env as MATRIX_ADMIN_TOKEN, then re-run this script.
   Rotation: issue a new one the same way, restart matrix-bridge, then end the
   old compatibility session in MAS.
EOF
    exit 0
fi
token_ok "$MATRIX_ADMIN_TOKEN" || die "MATRIX_ADMIN_TOKEN is not a valid Synapse admin token"
echo "✅ Bridge admin token is valid"

# ─── 6. Client and bridge ────────────────────────────────────────────────────
dc up -d element-web matrix-bridge
wait_for "Element Web" curl -fsS -o /dev/null http://127.0.0.1:8082/
wait_for "Bridge" curl -fsS http://127.0.0.1:3001/healthz

dc ps
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  ✅ Matrix stack is up on this host."
echo ""
echo "  Public routes come from services/caddy/Caddyfile.prod (matrix., auth.,"
echo "  idp., chat. and bridge. under PARA_DOMAIN). Verify through the edge:"
echo "    curl -fsS https://${MATRIX_SERVER_NAME}/_matrix/client/v3/login   # answered by MAS"
echo "    curl -s -o /dev/null -w '%{http_code}\\n' https://${MATRIX_SERVER_NAME}/_synapse/admin/v1/server_version   # 404"
echo ""
echo "  Then take a backup: BRIDGE_DB_PATH=<live bridge.db> deploy/matrix/backup.sh"
echo "═══════════════════════════════════════════════════════════════"
