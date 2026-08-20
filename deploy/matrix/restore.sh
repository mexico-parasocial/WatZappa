#!/bin/bash
set -euo pipefail

# ═════════════════════════════════════════════════════════════════════════════
# PARA Matrix — restore
#
# DESTRUCTIVE. Replaces the database, the config directory and the media volume
# with the contents of a backup archive. Requires --yes to run unattended.
#
# Usage:
#   ./deploy/matrix/restore.sh backups/para-matrix-<stamp>.tar.gz [--yes]
#
# Order matters. Postgres must be recreated from an empty volume so that initdb
# applies the C collation Synapse requires (MATRIX_V2.md F11) — restoring into a
# volume that was initialised with any other collation produces a database
# Synapse refuses to start against.
# ═════════════════════════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
COMPOSE_FILE="${REPO_ROOT}/docker-compose.matrix.yaml"
ENV_FILE="${REPO_ROOT}/.env"

ARCHIVE="${1:-}"
ASSUME_YES="${2:-}"

if [ -z "$ARCHIVE" ] || [ ! -f "$ARCHIVE" ]; then
    echo "usage: $0 <backup.tar.gz> [--yes]"
    exit 1
fi

if [ -f "$ENV_FILE" ]; then
    export $(grep -E '^MATRIX_' "$ENV_FILE" | xargs) || true
    export $(grep -E '^POSTGRES_' "$ENV_FILE" | xargs) || true
fi
MATRIX_DB_NAME="${MATRIX_DB_NAME:-matrix}"
POSTGRES_USER="${POSTGRES_USER:-pg}"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "═══════════════════════════════════════════════════════════════"
echo "  PARA Matrix restore"
echo "═══════════════════════════════════════════════════════════════"

tar -xzf "$ARCHIVE" -C "$WORK"
if [ ! -f "${WORK}/manifest.txt" ]; then
    echo "❌ No manifest.txt — this does not look like a PARA Matrix backup."
    exit 1
fi
echo ""
sed 's/^/   /' "${WORK}/manifest.txt"

echo ""
echo "🔍 Verifying checksums..."
( cd "$WORK" && shasum -a 256 -c SHA256SUMS ) || { echo "❌ Checksum mismatch — archive is corrupt. Refusing to restore."; exit 1; }

if [ "$ASSUME_YES" != "--yes" ]; then
    echo ""
    echo "⚠️  This DESTROYS the current database, config and media."
    read -r -p "   Type 'restore' to continue: " CONFIRM
    [ "$CONFIRM" = "restore" ] || { echo "aborted"; exit 1; }
fi

# ─── 1. Stop everything and drop the volumes ─────────────────────────────────
echo ""
echo "🛑 Stopping the stack and removing volumes..."
docker compose -f "$COMPOSE_FILE" down -v >/dev/null 2>&1 || true

# ─── 2. Config and signing key ───────────────────────────────────────────────
echo "🔑 Restoring config and signing key..."
rm -rf "${SCRIPT_DIR}/synapse"
tar -xf "${WORK}/config.tar" -C "$SCRIPT_DIR"
chmod 600 "${SCRIPT_DIR}"/synapse/*.signing.key 2>/dev/null || true
chmod 600 "${SCRIPT_DIR}"/synapse/zz-para-database.yaml 2>/dev/null || true

# ─── 3. Fresh Postgres, then load the dump ───────────────────────────────────
echo "🐘 Recreating Postgres with the required C collation..."
docker compose -f "$COMPOSE_FILE" up -d synapse-db >/dev/null 2>&1
for _ in $(seq 1 60); do
    if docker compose -f "$COMPOSE_FILE" exec -T synapse-db pg_isready -U "$POSTGRES_USER" >/dev/null 2>&1; then break; fi
    sleep 1
done

echo "   Loading dump..."
# --clean --if-exists so the restore is idempotent against a non-empty database.
docker compose -f "$COMPOSE_FILE" exec -T synapse-db \
    pg_restore -U "$POSTGRES_USER" -d "$MATRIX_DB_NAME" --clean --if-exists --no-owner \
    < "${WORK}/postgres.dump" 2>&1 | grep -vi "^pg_restore: warning" || true

# ─── 4. Media ────────────────────────────────────────────────────────────────
echo "🖼  Restoring media..."
docker compose -f "$COMPOSE_FILE" up -d synapse-init >/dev/null 2>&1 || true
sleep 2
SYNAPSE_VOL="$(docker volume ls -q -f name=synapse_data | head -1)"
docker run --rm -v "${SYNAPSE_VOL}:/data" -v "${WORK}:/backup" alpine:3 \
    sh -c "tar -xf /backup/media.tar -C /data && chown -R 991:991 /data"

# ─── 5. Bridge ───────────────────────────────────────────────────────────────
BRIDGE_VOL="$(docker volume ls -q -f name=bridge_data | head -1)"
if [ -n "$BRIDGE_VOL" ] && [ -s "${WORK}/bridge.tar" ]; then
    echo "🌉 Restoring bridge data..."
    docker run --rm -v "${BRIDGE_VOL}:/data" -v "${WORK}:/backup" alpine:3 \
        sh -c "tar -xf /backup/bridge.tar -C /data" || true
fi

# ─── 6. Back up ──────────────────────────────────────────────────────────────
echo "💊 Starting Synapse..."
docker compose -f "$COMPOSE_FILE" up -d synapse >/dev/null 2>&1

for _ in $(seq 1 60); do
    if curl -sf http://127.0.0.1:8008/health >/dev/null 2>&1; then
        echo ""
        echo "✅ Synapse is healthy."
        echo ""
        echo "   Verify before declaring success: log in as a known user and read"
        echo "   back a message you sent before the restore. A server that starts"
        echo "   is not the same as a server whose data came back."
        exit 0
    fi
    sleep 1
done

echo "❌ Synapse did not become healthy. Check: docker logs para-matrix-synapse"
exit 1
