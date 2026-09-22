#!/bin/bash
set -euo pipefail

# PARA Production Deploy Script — Server-Side Build
#
# SUPERSEDED by ansible/ (playbooks/site.yml, playbooks/deploy.yml), which does
# the same thing with health gating, backups and the Matrix stack wired in.
# Kept because it is the only path that has ever produced a running deployment
# and the ansible tree has not yet run against a real host. Delete it once
# ansible has deployed successfully at least once.
# Usage: ./infrascripts/deploy-production.sh [--with-matrix] [user@host]
#
# This script:
#   1. Validates local env
#   2. Syncs code to the server
#   3. Builds Docker images ON THE SERVER (native AMD64)
#   4. Starts the full stack
#   5. Runs health checks
#
# Options:
#   --with-matrix   Also deploy the optional Matrix/Synapse/Element stack

WITH_MATRIX=false
SERVER=""

for arg in "$@"; do
  case "$arg" in
    --with-matrix)
      WITH_MATRIX=true
      shift
      ;;
    *)
      SERVER="$arg"
      ;;
  esac
done

REMOTE_DIR="/opt/para"
# These scripts live INSIDE the repo (infrascripts/), but were written for a
# layout where they sat beside it and `WatZappa` was a subdirectory. Resolve
# the repo root from the script's own location so they work from any cwd.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${BACKEND_DIR:-$REPO_ROOT}"
LOCAL_DIR="$BACKEND_DIR"
ENV_FILE="$BACKEND_DIR/.env"

echo "═══════════════════════════════════════════════════════════════"
echo "  PARA Production Deploy"
echo "═══════════════════════════════════════════════════════════════"

# Validate
if [ -z "$SERVER" ]; then
    echo "❌ Usage: $0 [--with-matrix] [user@server-ip-or-hostname]"
    echo "   Example: $0 root@your-server"
    echo "   Example: $0 --with-matrix root@your-server"
    exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
    echo "❌ $ENV_FILE not found. Run infrascripts/generate-secrets.sh first."
    exit 1
fi

# Warn if PDS_HOSTNAME is localhost
if grep -q "PDS_HOSTNAME=localhost" "$ENV_FILE"; then
    echo "❌ BLOCKER: PDS_HOSTNAME is still 'localhost'."
    echo "   Fix it: sed -i '' 's/PDS_HOSTNAME=localhost/PDS_HOSTNAME=pds.para.social/' $ENV_FILE"
    exit 1
fi

# Warn if using placeholder values
if grep -q "<set-your-own>\|<will-be-known>\|changeme\|YOUR_API_KEY\|example.com" "$ENV_FILE"; then
    echo "⚠️  WARNING: $ENV_FILE still contains placeholder values."
    echo "   Review and fill them before continuing."
    read -p "   Press Enter to continue anyway, or Ctrl-C to abort..."
fi

# Sync code to server
echo ""
echo "📤 Syncing code to $SERVER:$REMOTE_DIR ..."
ssh "$SERVER" "mkdir -p $REMOTE_DIR"

# rsync backend source excluding heavy/unnecessary dirs
rsync -avz --delete \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='.pnpm-store' \
  --exclude='dist' \
  --exclude='build' \
  --exclude='*.log' \
  --exclude='.DS_Store' \
  --exclude='__tests__' \
  --exclude='coverage' \
  --exclude='.changeset' \
  "$LOCAL_DIR/" "$SERVER:$REMOTE_DIR/"

# Build & deploy on server
echo ""
echo "🔨 Building & deploying on $SERVER ..."

# Both compose files declare `para-edge` as an external network, so neither
# creates it. Without this, `--with-matrix` fails with "network para-edge
# declared as external, but could not be found". This step was missing.
ssh "$SERVER" "docker network inspect para-edge >/dev/null 2>&1 || docker network create para-edge"

COMPOSE_CMD="cd $REMOTE_DIR && docker compose -f docker-compose.prod.yaml down --remove-orphans && docker compose -f docker-compose.prod.yaml build --no-cache && docker compose -f docker-compose.prod.yaml up -d"

if [ "$WITH_MATRIX" = true ]; then
    echo "   (including Matrix stack)"
    COMPOSE_CMD="$COMPOSE_CMD && docker compose -f docker-compose.matrix.yaml up -d --build"
fi

ssh "$SERVER" "$COMPOSE_CMD"

# Health checks
echo ""
echo "🏥 Running health checks..."
sleep 10

HEALTH_PDS=$(ssh "$SERVER" "curl -sf http://localhost:2583/xrpc/_health && echo OK || echo FAIL")
HEALTH_BSKY=$(ssh "$SERVER" "curl -sf http://localhost:2584/xrpc/_health && echo OK || echo FAIL")
HEALTH_READY=$(ssh "$SERVER" "curl -sf http://localhost:2583/xrpc/_ready && echo OK || echo FAIL")

echo "   PDS health:     $HEALTH_PDS"
echo "   AppView health: $HEALTH_BSKY"
echo "   PDS ready:      $HEALTH_READY"

MATRIX_HEALTH=""
if [ "$WITH_MATRIX" = true ]; then
    echo ""
    echo "🏥 Checking Matrix health..."
    MATRIX_SYNAPSE=$(ssh "$SERVER" "curl -sf http://localhost:8008/health && echo OK || echo FAIL")
    MATRIX_BRIDGE=$(ssh "$SERVER" "curl -sf http://localhost:3001/healthz && echo OK || echo FAIL")
    echo "   Synapse health: $MATRIX_SYNAPSE"
    echo "   Bridge health:  $MATRIX_BRIDGE"
fi

if [ "$HEALTH_PDS" = "OK" ] && [ "$HEALTH_BSKY" = "OK" ] && [ "$HEALTH_READY" = "OK" ]; then
    echo ""
    echo "✅ Deploy successful!"
    echo ""
    echo "   PDS:      https://pds.para.social"
    echo "   AppView:  https://appview.para.social"
    if [ "$WITH_MATRIX" = true ]; then
        echo "   Matrix:   https://chat.para.social"
    fi
    echo ""
    echo "   Check logs: ssh $SERVER 'cd $REMOTE_DIR && docker compose logs -f'"
    exit 0
else
    echo ""
    echo "❌ Health checks failed. Investigate:"
    echo "   ssh $SERVER 'cd $REMOTE_DIR && docker compose logs'"
    exit 1
fi
