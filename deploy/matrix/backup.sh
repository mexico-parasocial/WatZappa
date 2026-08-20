#!/bin/bash
set -euo pipefail

# ═════════════════════════════════════════════════════════════════════════════
# PARA Matrix — backup
#
# Captures everything needed to rebuild this homeserver from nothing:
#
#   postgres.dump   Synapse's database: users, rooms, every message
#   config.tar      homeserver.yaml, the overlays, and THE SIGNING KEY
#   media.tar       uploaded media
#   bridge.tar      the bridge's SQLite database, if it uses one
#
# The signing key is the part that cannot be replaced. It is this server's
# identity: without it every existing account, room and event signature becomes
# unverifiable and the only way forward is a new server name. Everything else
# on this list is painful to lose; the signing key is terminal.
#
# Consistency: pg_dump is transactionally consistent, media files are
# effectively immutable once written, and the config is static. No downtime is
# required and the stack is not stopped.
#
# Usage:
#   ./deploy/matrix/backup.sh [output-dir]
#
# Restore with restore.sh. A backup that has never been restored is not a
# backup — see docs/MATRIX_BACKUP.md for the drill.
# ═════════════════════════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
COMPOSE_FILE="${REPO_ROOT}/docker-compose.matrix.yaml"
ENV_FILE="${REPO_ROOT}/.env"

OUT_DIR="${1:-${REPO_ROOT}/backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

if [ -f "$ENV_FILE" ]; then
    export $(grep -E '^MATRIX_' "$ENV_FILE" | xargs) || true
    export $(grep -E '^POSTGRES_' "$ENV_FILE" | xargs) || true
fi
MATRIX_SERVER_NAME="${MATRIX_SERVER_NAME:-matrix.para.social}"
MATRIX_DB_NAME="${MATRIX_DB_NAME:-matrix}"
POSTGRES_USER="${POSTGRES_USER:-pg}"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

say() { printf '%s\n' "$*"; }

say "═══════════════════════════════════════════════════════════════"
say "  PARA Matrix backup — ${STAMP}"
say "═══════════════════════════════════════════════════════════════"

# ─── 1. Postgres ─────────────────────────────────────────────────────────────
# Dumped from inside the container so the pg_dump version always matches the
# server. A host pg_dump that is older than the server refuses to run.
say ""
say "🐘 Dumping Postgres (${MATRIX_DB_NAME})..."
docker compose -f "$COMPOSE_FILE" exec -T synapse-db \
    pg_dump -U "$POSTGRES_USER" -d "$MATRIX_DB_NAME" -Fc > "${WORK}/postgres.dump"
say "   $(du -h "${WORK}/postgres.dump" | cut -f1)"

# ─── 2. Config, including the signing key ────────────────────────────────────
say ""
say "🔑 Archiving config and signing key..."
if [ ! -f "${SCRIPT_DIR}/synapse/${MATRIX_SERVER_NAME}.signing.key" ]; then
    say "❌ Signing key not found at ${SCRIPT_DIR}/synapse/${MATRIX_SERVER_NAME}.signing.key"
    say "   Refusing to write a backup that cannot restore the server's identity."
    exit 1
fi
tar -cf "${WORK}/config.tar" -C "${SCRIPT_DIR}" synapse
say "   $(du -h "${WORK}/config.tar" | cut -f1)"

# ─── 3. Media ────────────────────────────────────────────────────────────────
# Read out of the named volume via a throwaway container: the volume is not
# mounted on the host, and Synapse's own container may be stopped.
say ""
say "🖼  Archiving media..."
docker run --rm -v "$(docker volume ls -q -f name=synapse_data | head -1):/data" \
    -v "${WORK}:/backup" alpine:3 \
    sh -c "tar -cf /backup/media.tar -C /data media_store 2>/dev/null || tar -cf /backup/media.tar -T /dev/null"
say "   $(du -h "${WORK}/media.tar" | cut -f1)"

# ─── 4. Bridge database ──────────────────────────────────────────────────────
# Only present when the bridge runs on SQLite; with DATABASE_URL set it lives in
# Postgres and is covered by that system's own backups, not this script.
say ""
say "🌉 Archiving bridge data..."
BRIDGE_VOL="$(docker volume ls -q -f name=bridge_data | head -1)"
if [ -n "$BRIDGE_VOL" ]; then
    docker run --rm -v "${BRIDGE_VOL}:/data" -v "${WORK}:/backup" alpine:3 \
        sh -c "tar -cf /backup/bridge.tar -C /data . 2>/dev/null || tar -cf /backup/bridge.tar -T /dev/null"
    say "   $(du -h "${WORK}/bridge.tar" | cut -f1)"
else
    tar -cf "${WORK}/bridge.tar" -T /dev/null
    say "   no bridge volume found — empty archive"
fi

# ─── 5. Manifest ─────────────────────────────────────────────────────────────
SYNAPSE_VERSION="$(docker compose -f "$COMPOSE_FILE" exec -T synapse \
    python3 -c 'import synapse; print(synapse.__version__)' 2>/dev/null | tr -d '\r' || echo unknown)"

cat > "${WORK}/manifest.txt" <<MANIFEST
para-matrix-backup
created           ${STAMP}
server_name       ${MATRIX_SERVER_NAME}
database          ${MATRIX_DB_NAME}
synapse_version   ${SYNAPSE_VERSION}
host              $(hostname)

contents
  postgres.dump   pg_dump custom format (pg_restore)
  config.tar      deploy/matrix/synapse/ including the signing key
  media.tar       /data/media_store
  bridge.tar      bridge volume, empty if the bridge uses Postgres

restore with deploy/matrix/restore.sh
MANIFEST

( cd "$WORK" && shasum -a 256 ./*.dump ./*.tar > SHA256SUMS )

# ─── 6. Seal ─────────────────────────────────────────────────────────────────
mkdir -p "$OUT_DIR"
ARCHIVE="${OUT_DIR}/para-matrix-${STAMP}.tar.gz"
tar -czf "$ARCHIVE" -C "$WORK" .
chmod 600 "$ARCHIVE"

say ""
say "═══════════════════════════════════════════════════════════════"
say "✅ ${ARCHIVE}"
say "   $(du -h "$ARCHIVE" | cut -f1)"
say ""
say "⚠️  THIS ARCHIVE IS AS SENSITIVE AS THE SERVER ITSELF."
say "   It contains the signing key and every message in plaintext."
say "   It is mode 600 here, which is only as good as this host."
say ""
say "   ENCRYPT IT BEFORE IT LEAVES THIS MACHINE. It must never be"
say "   copied to object storage, a laptop, or a backup service as-is:"
say ""
say "     age -r <recipient> -o ${ARCHIVE##*/}.age ${ARCHIVE##*/}"
say "     # or: gpg --encrypt --recipient <key> ${ARCHIVE##*/}"
say ""
say "   Restore drill: docs/MATRIX_BACKUP.md. An untested backup is not"
say "   a backup — run the drill on a schedule, not after an incident."
say "═══════════════════════════════════════════════════════════════"
