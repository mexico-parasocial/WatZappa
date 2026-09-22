#!/bin/bash
set -euo pipefail

# PARA Blobstore Migration Script
# =============================================================================
# Migrates blobs from local disk to Cloudflare R2.
# Run this ONCE when switching from local disk blobstore to R2.
#
# Prerequisites:
#   - rclone installed: https://rclone.org/install/
#   - R2 credentials configured in the backend .env
#
# Usage:
#   ./infrascripts/migrate-blobs-to-r2.sh
#
# How it works:
#   1. Reads blobs from the local PDS data directory
#   2. Uploads them to R2 using the S3-compatible API
#   3. Verifies each upload
# =============================================================================

# These scripts live INSIDE the repo (infrascripts/), but were written for a
# layout where they sat beside it and `WatZappa` was a subdirectory. Resolve
# the repo root from the script's own location so they work from any cwd.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${BACKEND_DIR:-$REPO_ROOT}"
ENV_FILE="$BACKEND_DIR/.env"
LOCAL_BLOB_DIR="${HOME}/.paramx-demo/blobstore"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "═══════════════════════════════════════════════════════════════"
echo "  PARA Blobstore Migration: Local Disk → Cloudflare R2"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Check prerequisites
if ! command -v rclone &> /dev/null; then
  echo -e "${YELLOW}rclone not found. Install it:${NC}"
  echo "  macOS: brew install rclone"
  echo "  Linux: curl https://rclone.org/install.sh | sudo bash"
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo -e "${RED}❌ $ENV_FILE not found${NC}"
  exit 1
fi

# Source env vars
set -a
source "$ENV_FILE"
set +a

# Validate required vars
if [ -z "${R2_ACCESS_KEY_ID:-}" ] || [ "$R2_ACCESS_KEY_ID" = "<r2-access-key-id>" ]; then
  echo -e "${RED}❌ R2_ACCESS_KEY_ID not set in $ENV_FILE${NC}"
  echo "   Get it from Cloudflare Dashboard → R2 → Manage R2 API Tokens"
  exit 1
fi

if [ -z "${R2_SECRET_ACCESS_KEY:-}" ] || [ "$R2_SECRET_ACCESS_KEY" = "<r2-secret-access-key>" ]; then
  echo -e "${RED}❌ R2_SECRET_ACCESS_KEY not set in $ENV_FILE${NC}"
  exit 1
fi

# Detect local blob directory
if [ -d "$LOCAL_BLOB_DIR" ]; then
  echo -e "${GREEN}✓ Found local blobs at ${LOCAL_BLOB_DIR}${NC}"
elif [ -d "${PDS_BLOBSTORE_DISK_LOCATION:-}" ]; then
  LOCAL_BLOB_DIR="$PDS_BLOBSTORE_DISK_LOCATION"
  echo -e "${GREEN}✓ Found local blobs at ${LOCAL_BLOB_DIR}${NC}"
else
  echo -e "${YELLOW}⚠ Local blob directory not found at default locations.${NC}"
  read -rp "Enter local blob directory path: " LOCAL_BLOB_DIR
  if [ ! -d "$LOCAL_BLOB_DIR" ]; then
    echo -e "${RED}❌ Directory does not exist: $LOCAL_BLOB_DIR${NC}"
    exit 1
  fi
fi

# Count blobs
BLOB_COUNT=$(find "$LOCAL_BLOB_DIR" -type f | wc -l)
BLOB_SIZE=$(du -sh "$LOCAL_BLOB_DIR" | cut -f1)

echo ""
echo "  Source:      $LOCAL_BLOB_DIR"
echo "  Blobs:       $BLOB_COUNT files"
echo "  Size:        $BLOB_SIZE"
echo "  Destination: s3://$R2_BUCKET"
echo "  Endpoint:    $R2_ENDPOINT"
echo ""

read -rp "Start migration? Type 'yes' to continue: " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "Aborted."
  exit 0
fi

# Configure rclone remote on-the-fly
echo ""
echo "Configuring rclone remote..."
rclone config create para-r2 s3 \
  provider Cloudflare \
  access_key_id "$R2_ACCESS_KEY_ID" \
  secret_access_key "$R2_SECRET_ACCESS_KEY" \
  endpoint "$R2_ENDPOINT" \
  region auto \
  force_path_style true \
  2>/dev/null || true

# Run migration
echo ""
echo -e "${BLUE}Uploading blobs to R2...${NC}"
echo "  This may take a while depending on blob count and size."
echo ""

rclone copy "$LOCAL_BLOB_DIR" "para-r2:$R2_BUCKET" \
  --progress \
  --checksum \
  --transfers 16 \
  --checkers 32

echo ""
echo -e "${GREEN}✅ Migration complete!${NC}"
echo ""
echo "Next steps:"
echo "  1. Update docker-compose.prod.yaml to remove local blob volume"
echo "  2. Set PDS_BLOBSTORE_S3_* variables in .env"
echo "  3. Restart the PDS container"
echo "  4. Verify: make pds-doctor"
echo ""
echo "Optional: after confirming R2 works, delete local blobs:"
echo "  rm -rf $LOCAL_BLOB_DIR"
echo ""
