#!/usr/bin/env bash
# restart-dev.sh
# Kills any stale dev-env process, ensures db_test/redis_test containers are
# healthy, then relaunches the dev-env with pretty-printed logs.
#
# Usage (from repo root):
#   ./scripts/restart-dev.sh
# Or via Make:
#   make restart-dev-env

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
INFRA_DIR="$REPO_ROOT/packages/dev-infra"
DEV_ENV_DIR="$REPO_ROOT/packages/dev-env"

echo "═══════════════════════════════════════════════"
echo "  PARA dev-env restart"
echo "═══════════════════════════════════════════════"

# ── 1. Kill any running dev-env node process ─────────────────────────────────
echo ""
echo "🛑  Stopping stale dev-env process (if any)..."
if pkill -f "dist/bin.js" 2>/dev/null; then
  echo "    Sent SIGTERM to dev-env process."
  sleep 2   # give it a moment to flush / release ports
else
  echo "    No running dev-env process found — skipping."
fi

# Also stop a stale matrix-bridge left behind by a crashed wrapper, so the new
# one can bind :3001.
if pkill -f "matrix-bridge/dist/index.js" 2>/dev/null; then
  echo "    Sent SIGTERM to a stale matrix-bridge process."
  sleep 1
fi

# ── 2. Ensure test infra containers are healthy ──────────────────────────────
echo ""
echo "🐳  Ensuring db_test (:5433) and redis_test (:6380) are running..."
docker compose -f "$INFRA_DIR/docker-compose.yaml" up -d --wait db_test redis_test
echo "    Containers healthy ✓"

# ── 3. Launch dev-env with the matrix-bridge attached ────────────────────────
echo ""
echo "🚀  Starting dev-env + matrix-bridge (Ctrl-C to stop)..."
echo ""
cd "$DEV_ENV_DIR"
LOG_ENABLED=true NODE_ENV=development \
  exec "$REPO_ROOT/scripts/with-matrix-bridge.sh" \
  bash -c 'LOG_ENABLED=true ../dev-infra/with-test-redis-and-db.sh node --enable-source-maps dist/bin.js | pnpm exec pino-pretty'
