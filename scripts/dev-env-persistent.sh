#!/usr/bin/env bash
set -euo pipefail

# ═════════════════════════════════════════════════════════════════════════════
# PARA dev-env — PERSISTENT variant
#
# The normal `make run-dev-env` / restart-dev.sh path is deliberately
# throwaway: it runs against `db_test` (:5433) and `redis_test` (:6380), which
# have no volumes, and dev-env itself puts the PDS data directory, the
# blobstore and the PLC database under random `os.tmpdir()` paths. Every
# restart mints new DIDs, so a test account cannot outlive a session.
#
# This variant keeps them. Accounts, repos, blobs and DIDs survive a restart:
#
#   postgres   `db` on :5434      (volume atp_db)     — AppView + Ozone
#   redis      `redis` on :6381   (volume atp_redis)
#   PDS data   .dev-env-data/pds       — account sqlite + repos
#   blobs      .dev-env-data/blobs
#   PLC        .dev-env-data/plc       — plc.json, the local DID registry
#
# DIDs are minted on the LOCAL PLC, never plc.directory. Nothing here is
# public and nothing is permanent: delete .dev-env-data to start over.
#
# Seed accounts with ./scripts/seed-test-accounts.sh once this is up.
# ═════════════════════════════════════════════════════════════════════════════

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INFRA_DIR="$REPO_ROOT/packages/dev-infra"
DEV_ENV_DIR="$REPO_ROOT/packages/dev-env"
DATA_DIR="${PARA_DEV_ENV_DATA:-$REPO_ROOT/.dev-env-data}"

echo "═══════════════════════════════════════════════"
echo "  PARA dev-env (persistent)"
echo "  data: $DATA_DIR"
echo "═══════════════════════════════════════════════"

# ── Stop a stale dev-env so it releases the ports ────────────────────────────
if pkill -f "dist/bin.js" 2>/dev/null; then
  echo "🛑  Stopped a stale dev-env process."
  sleep 2
fi
if pkill -f "matrix-bridge/dist/index.js" 2>/dev/null; then
  echo "🛑  Stopped a stale matrix-bridge."
  sleep 1
fi

mkdir -p "$DATA_DIR/pds" "$DATA_DIR/blobs" "$DATA_DIR/plc"

# ── Bring up the PERSISTENT services ─────────────────────────────────────────
# Started here, deliberately, rather than by with-redis-and-db.sh: that script
# tears down whatever it started with `docker compose rm --force --stop
# --volumes`, which would delete the very volumes this script exists to keep.
# Because they are already running when it looks, it leaves them alone.
echo ""
echo "🐳  Ensuring persistent db (:5434) and redis (:6381) are up…"
docker compose -f "$INFRA_DIR/docker-compose.yaml" up -d --wait db redis
echo "    Healthy ✓"

# ── Launch ───────────────────────────────────────────────────────────────────
# Mock setup and the demo seed are skipped: both write fixtures on every boot,
# which against persistent storage means duplicates piling up run after run.
# Use seed-test-accounts.sh instead — it is idempotent.
echo ""
echo "🚀  Starting dev-env (Ctrl-C to stop)…"
echo ""
cd "$DEV_ENV_DIR"
LOG_ENABLED=true \
NODE_ENV=development \
DEV_ENV_PDS_DATA_DIRECTORY="$DATA_DIR/pds" \
DEV_ENV_PDS_BLOBSTORE_DIRECTORY="$DATA_DIR/blobs" \
DEV_ENV_PLC_DIRECTORY="$DATA_DIR/plc" \
DEV_ENV_SKIP_MOCK_SETUP="${DEV_ENV_SKIP_MOCK_SETUP:-1}" \
DEV_ENV_SKIP_PARA_DEMO_SEED="${DEV_ENV_SKIP_PARA_DEMO_SEED:-1}" \
  exec "$INFRA_DIR/with-redis-and-db.sh" \
  node --enable-source-maps dist/bin.js
