#!/bin/bash
set -euo pipefail

# ═════════════════════════════════════════════════════════════════════════════
# PARA Matrix VPS deploy — runs ON THE MAC, pushes everything to the VPS.
#
# Usage: ./infrascripts/deploy-matrix-vps.sh [user@host]
#          (default: ubuntu@13.58.226.230 — the MASmatrix EC2 instance)
#
# Ships: compose file, deploy/matrix (secrets + config + signing key included),
# para-idp source, .env, and the DB seed dumps from ~/Backups/para/vps-seed-*.
# Then runs bootstrap-matrix-vps.sh on the box.
# ═════════════════════════════════════════════════════════════════════════════

SERVER="${1:-ubuntu@13.58.226.230}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE_DIR="/opt/para"
SEED_SRC="$(ls -td ~/Backups/para/vps-seed-* | head -1)"

echo "═══════════════════════════════════════════════════════════════"
echo "  PARA Matrix VPS deploy → $SERVER"
echo "  seed: $SEED_SRC"
echo "═══════════════════════════════════════════════════════════════"

ssh "$SERVER" "sudo mkdir -p $REMOTE_DIR && sudo chown \$(id -un) $REMOTE_DIR && mkdir -p $REMOTE_DIR/deploy/matrix/seed $REMOTE_DIR/services/para-idp $REMOTE_DIR/infrascripts"

echo "📤 Syncing repo files…"
rsync -avz \
  "$REPO/docker-compose.matrix.yaml" \
  "$REPO/.env" \
  "$SERVER:$REMOTE_DIR/"

rsync -avz --exclude 'seed' "$REPO/deploy/matrix/" "$SERVER:$REMOTE_DIR/deploy/matrix/"

rsync -avz "$REPO/services/para-idp/" "$SERVER:$REMOTE_DIR/services/para-idp/"

# matrix-bridge builds through the pnpm monorepo: it needs the root manifests
# plus the packages its Dockerfile COPYs. Excludes keep node_modules/dist
# out of the transfer.
BRIDGE_ROOT_FILES=(package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json)
rsync -avz --exclude node_modules --exclude dist --exclude '*.tsbuildinfo' \
  ${BRIDGE_ROOT_FILES[@]/#/"$REPO"/} "$SERVER:$REMOTE_DIR/"
rsync -avz --exclude node_modules --exclude dist --exclude '*.tsbuildinfo' \
  "$REPO/tsconfig" "$REPO/lexicons" "$REPO/packages" \
  "$SERVER:$REMOTE_DIR/"
rsync -avz --exclude node_modules --exclude dist --exclude '*.tsbuildinfo' \
  "$REPO/services/matrix-bridge" "$SERVER:$REMOTE_DIR/services/"

echo "📤 Syncing seed dumps…"
LATEST_MAS=$(ls "$SEED_SRC"/mas-*.sql | tail -1)
LATEST_MATRIX=$(ls "$SEED_SRC"/matrix-*.sql | tail -1)
rsync -avz "$LATEST_MAS" "$SERVER:$REMOTE_DIR/deploy/matrix/seed/mas.sql"
rsync -avz "$LATEST_MATRIX" "$SERVER:$REMOTE_DIR/deploy/matrix/seed/matrix.sql"

echo "📤 Syncing bootstrap script…"
rsync -avz "$REPO/infrascripts/bootstrap-matrix-vps.sh" "$SERVER:$REMOTE_DIR/infrascripts/"

echo "🚀 Bootstrapping on ${SERVER}..."
# sudo: the ubuntu user is not in the docker group until its next login.
ssh "$SERVER" "sudo bash $REMOTE_DIR/infrascripts/bootstrap-matrix-vps.sh"
