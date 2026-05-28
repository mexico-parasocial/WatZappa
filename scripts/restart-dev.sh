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

# ── 2. Ensure test infra containers are healthy ──────────────────────────────
echo ""
echo "🐳  Ensuring db_test (:5433) and redis_test (:6380) are running..."
docker compose -f "$INFRA_DIR/docker-compose.yaml" up -d --wait db_test redis_test
echo "    Containers healthy ✓"

# ── 3. Launch dev-env (pretty-printed logs) ───────────────────────────────────
echo ""
echo "🚀  Starting dev-env (Ctrl-C to stop)..."
echo ""
cd "$DEV_ENV_DIR"
LOG_ENABLED=true NODE_ENV=development \
  "$INFRA_DIR/with-test-redis-and-db.sh" \
  node --enable-source-maps dist/bin.js \
  | pnpm exec pino-pretty
