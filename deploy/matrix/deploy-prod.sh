#!/bin/bash
set -euo pipefail

# ═════════════════════════════════════════════════════════════════════════════
# PARA Matrix Production Deploy Script
# Run THIS on the bare metal server (5950X), not on dev Mac
# ═════════════════════════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${SCRIPT_DIR}/../.."
COMPOSE_FILE="${REPO_ROOT}/docker-compose.matrix.yaml"
ENV_FILE="${REPO_ROOT}/.env"

echo "═══════════════════════════════════════════════════════════════"
echo "  PARA Matrix Production Deploy"
echo "══════════════════════════════════════════════════════════════="

# ─── Validate env file ───
if [ ! -f "$ENV_FILE" ]; then
    echo "❌ .env not found at $ENV_FILE"
    exit 1
fi

export $(grep -E '^MATRIX_' "$ENV_FILE" | xargs) || true
export $(grep -E '^POSTGRES_' "$ENV_FILE" | xargs) || true
export $(grep -E '^PDS_FIREHOSE_URL' "$ENV_FILE" | xargs) || true
export $(grep -E '^BRIDGE_' "$ENV_FILE" | xargs) || true

# ─── Step 1: Generate Synapse config (if missing) ───
if [ ! -d "${SCRIPT_DIR}/synapse" ]; then
    echo ""
    echo "🔧 Generating Synapse configuration..."
    bash "${SCRIPT_DIR}/setup.sh"
else
    echo ""
    echo "⚠️  Synapse config already exists. Skipping generation."
    echo "   Delete ${SCRIPT_DIR}/synapse/ to regenerate."
fi

# ─── Step 2: Build bridge image ───
echo ""
echo "🔨 Building matrix-bridge image..."
cd "$REPO_ROOT"
docker compose -f "$COMPOSE_FILE" build matrix-bridge

# ─── Step 3: Start database ───
echo ""
echo "🐘 Starting PostgreSQL for Synapse..."
docker compose -f "$COMPOSE_FILE" up -d synapse-db

# Wait for DB
for i in {1..30}; do
    if docker compose -f "$COMPOSE_FILE" exec -T synapse-db pg_isready -U "${POSTGRES_USER:-pg}" >/dev/null 2>&1; then
        echo "✅ PostgreSQL is ready"
        break
    fi
    sleep 1
done

# ─── Step 4: Start Synapse ───
echo ""
echo "💊 Starting Synapse..."
docker compose -f "$COMPOSE_FILE" up -d synapse

# Wait for Synapse
for i in {1..30}; do
    if curl -sf http://localhost:8008/health >/dev/null 2>&1; then
        echo "✅ Synapse is healthy"
        break
    fi
    sleep 1
done

# ─── Step 5: Create admin user (if first deploy) ───
echo ""
if ! docker compose -f "$COMPOSE_FILE" exec -T synapse sqlite3 /data/homeserver.db \
    "SELECT name FROM users WHERE name='@admin:${MATRIX_SERVER_NAME:-matrix.para.social}'" 2>/dev/null | grep -q admin; then
    echo "👤 Creating Synapse admin user..."
    echo "⚠️  You will be prompted for a password"
    docker compose -f "$COMPOSE_FILE" exec synapse register_new_matrix_user \
        -c /data/homeserver.yaml \
        -a -u admin
    echo ""
    echo "📝 Now get the access token:"
    echo "   curl -XPOST -d '{\"type\":\"m.login.password\",\"user\":\"admin\",\"password\":\"YOUR_PASSWORD\"}' http://localhost:8008/_matrix/client/v3/login"
    echo "   Then save the access_token to .env as MATRIX_ADMIN_TOKEN"
    echo ""
    echo "⏸️  PAUSED: Set MATRIX_ADMIN_TOKEN in .env, then re-run this script."
    exit 0
else
    echo "✅ Admin user already exists"
fi

# ─── Step 6: Validate admin token ───
if [ -z "${MATRIX_ADMIN_TOKEN:-}" ] || [ "$MATRIX_ADMIN_TOKEN" = "<fill-after-setup>" ]; then
    echo "❌ MATRIX_ADMIN_TOKEN not set in .env"
    echo "   Get it with: curl -XPOST -d '{\"type\":\"m.login.password\",\"user\":\"admin\",\"password\":\"YOUR_PASSWORD\"}' http://localhost:8008/_matrix/client/v3/login"
    exit 1
fi

# Test token
if ! curl -sf -H "Authorization: Bearer $MATRIX_ADMIN_TOKEN" \
    "http://localhost:8008/_synapse/admin/v1/server_version" >/dev/null 2>&1; then
    echo "❌ MATRIX_ADMIN_TOKEN is invalid"
    exit 1
fi
echo "✅ Admin token is valid"

# ─── Step 7: Start everything ───
echo ""
echo "🚀 Starting Element Web and Matrix Bridge..."
docker compose -f "$COMPOSE_FILE" up -d element-web matrix-bridge

# ─── Step 8: Health checks ───
echo ""
echo "🏥 Running health checks..."
sleep 5

HEALTHY=true

if curl -sf http://localhost:3001/healthz >/dev/null 2>&1; then
    echo "✅ Bridge health: OK"
else
    echo "❌ Bridge health: FAIL"
    HEALTHY=false
fi

if curl -sf -o /dev/null -I "http://localhost:8080" >/dev/null 2>&1; then
    echo "✅ Element Web: OK"
else
    echo "❌ Element Web: FAIL"
    HEALTHY=false
fi

# ─── Done ───
echo ""
echo "═══════════════════════════════════════════════════════════════"
if [ "$HEALTHY" = true ]; then
    echo "  ✅ Deploy complete!"
    echo ""
    echo "  Synapse:     http://localhost:8008"
    echo "  Element Web: http://localhost:8080"
    echo "  Bridge API:  http://localhost:3001"
    echo ""
    echo "  Test: curl http://localhost:3001/healthz"
else
    echo "  ⚠️  Deploy finished with health check failures"
    echo "  Check logs: docker compose -f $COMPOSE_FILE logs"
fi
echo "═══════════════════════════════════════════════════════════════"
