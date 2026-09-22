#!/bin/bash
set -euo pipefail

# ═════════════════════════════════════════════════════════════════════════════
# PARA Matrix VPS bootstrap — runs ON the server (Ubuntu 22.04/24.04, amd64)
#
# Called by infrascripts/deploy-matrix-vps.sh from the Mac. Idempotent: safe
# to re-run. Expects the repo at /opt/para with deploy/matrix already synced,
# including the gitignored secrets and the seed SQL dumps.
# ═════════════════════════════════════════════════════════════════════════════

REMOTE_DIR="/opt/para"
SEED_DIR="${REMOTE_DIR}/deploy/matrix/seed"
COMPOSE="docker compose -f ${REMOTE_DIR}/docker-compose.matrix.yaml"

echo "═══════════════════════════════════════════════════════════════"
echo "  PARA Matrix VPS bootstrap"
echo "═══════════════════════════════════════════════════════════════"

if [ "$(id -u)" -eq 0 ]; then SUDO=""; else SUDO="sudo"; fi

# ─── 1. Docker + Compose ─────────────────────────────────────────────────────
if docker info >/dev/null 2>&1; then
    echo "✅ Docker already installed"
else
    echo "🐳 Installing Docker from the Ubuntu archive…"
    $SUDO apt-get update -qq
    # Ubuntu ships docker.io + docker-compose-v2; using them avoids a
    # third-party apt repo whose codename may lag a brand-new Ubuntu release.
    $SUDO apt-get install -y -qq docker.io docker-compose-v2
    $SUDO systemctl enable --now docker
fi
$SUDO usermod -aG docker "${SUDO_USER:-ubuntu}" || true

# t3.small has 2 GB RAM — Synapse wants breathing room. Add swap if missing.
if ! $SUDO swapon --show=NAME --noheadings | grep -q .; then
    echo "🌀 Adding 2 GB swap…"
    $SUDO fallocate -l 2G /swapfile
    $SUDO chmod 600 /swapfile
    $SUDO mkswap /swapfile
    $SUDO swapon /swapfile
    echo '/swapfile none swap sw 0 0' | $SUDO tee -a /etc/fstab >/dev/null
fi

# ─── 2. Docker network for the edge ──────────────────────────────────────────
docker network create para-edge 2>/dev/null && echo "✅ Created para-edge network" \
    || echo "✅ para-edge network already exists"

# ─── 3. Bind-mount ownership ─────────────────────────────────────────────────
# rsync lands the config files owned by the login user with 600 perms. The
# containers read them as other UIDs (Synapse drops to 991, MAS runs as
# 65532), which Docker Desktop's file sharing masks on the Mac but real Linux
# enforces. Runs after every sync, so a re-deployed file is re-owned.
$SUDO chown -R 991:991 "$REMOTE_DIR/deploy/matrix/synapse"
$SUDO chown -R 65532:65532 "$REMOTE_DIR/deploy/matrix/mas"
# The login user still needs to READ the MAS dir: docker compose parses every
# service's env_file (para-idp's lives in mas/) on every command.
$SUDO groupadd -g 65532 mas-nonroot 2>/dev/null || true
$SUDO chmod 640 "$REMOTE_DIR/deploy/matrix/mas/config.yaml" \
                "$REMOTE_DIR/deploy/matrix/mas/para-idp.env"
$SUDO usermod -aG mas-nonroot "${SUDO_USER:-ubuntu}" || true

# ─── 4. Seed data (first run only: only if the DB is empty) ──────────────────
cd "$REMOTE_DIR"
$COMPOSE up -d synapse-db mas-db
echo "⏳ Waiting for databases…"
for i in {1..30}; do
    $COMPOSE exec -T synapse-db pg_isready -U pg >/dev/null 2>&1 \
        && $COMPOSE exec -T mas-db pg_isready -U pg >/dev/null 2>&1 && break
    sleep 1
done

seed_if_empty() { # $1=container $2=db $3=dump-file
    local count
    count=$($COMPOSE exec -T "$1" psql -U pg -d "$2" -tAc \
        "SELECT count(*) FROM pg_tables WHERE schemaname='public'")
    if [ "$count" -gt 0 ]; then
        echo "✅ $2 already has tables, skipping seed"
        return
    fi
    if [ ! -f "$3" ]; then
        echo "⚠️  Seed dump $3 missing, leaving $2 empty"
        return
    fi
    echo "📦 Seeding $2 from $(basename "$3")…"
    $COMPOSE exec -T "$1" psql -U pg -d "$2" -q < "$3"
}

seed_if_empty mas-db    mas    "$SEED_DIR"/mas.sql
seed_if_empty synapse-db matrix "$SEED_DIR"/matrix.sql

# ─── 4. Bring up the auth path ───────────────────────────────────────────────
# synapse, mas, para-idp (bridge/element are started separately — they were
# not part of the running local stack either).
$COMPOSE up -d para-idp mas synapse

echo "⏳ Waiting for Synapse…"
for i in {1..30}; do
    curl -sf http://localhost:8008/health >/dev/null 2>&1 && break
    sleep 1
done

# ─── 5. Health checks ────────────────────────────────────────────────────────
HEALTHY=true
curl -sf http://localhost:8008/health >/dev/null && echo "✅ Synapse health" || { echo "❌ Synapse"; HEALTHY=false; }
curl -sf http://localhost:8090/healthz >/dev/null && echo "✅ para-idp health" || { echo "❌ para-idp"; HEALTHY=false; }
VERSION=$(curl -sf http://localhost:8008/_synapse/admin/v1/server_version || echo "?")
echo "   Synapse version: $VERSION"
docker logs para-matrix-mas 2>&1 | grep -q "Listening on" && echo "✅ MAS listening" || { echo "❌ MAS"; HEALTHY=false; }

if [ "$HEALTHY" = true ]; then
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo "  ✅ Matrix stack up on this VPS"
    echo "  Remaining (needs DNS + Caddy): public TLS edge, Element, bridge"
    echo "═══════════════════════════════════════════════════════════════"
else
    echo "❌ Some checks failed — inspect: docker compose -f $REMOTE_DIR/docker-compose.matrix.yaml logs"
    exit 1
fi
