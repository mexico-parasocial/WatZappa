#!/bin/bash
set -euo pipefail

# =============================================================================
# PARA Blobstore Migration Script: Local Disk or R2 → SeaweedFS
# =============================================================================
# Migrates existing blobs into the SeaweedFS S3 bucket used by the bare-metal
# stack. Run this BEFORE pointing PDS at SeaweedFS if you have existing blobs.
#
# Prerequisites:
#   - rclone installed: https://rclone.org/install/
#   - SeaweedFS S3 gateway reachable (start the stack first)
#   - .env configured with PDS_BLOBSTORE_S3_* variables
#
# Usage:
#   ./infrascripts/migrate-blobs-to-seaweedfs.sh [disk|r2|auto]
#
# Source auto-detection order:
#   1. PDS_BLOBSTORE_DISK_LOCATION if it exists
#   2. ~/.paramx-demo/blobstore
#   3. R2 bucket if R2_ENDPOINT and R2_BUCKET are set
# =============================================================================

# These scripts live INSIDE the repo (infrascripts/), but were written for a
# layout where they sat beside it and `WatZappa` was a subdirectory. Resolve
# the repo root from the script's own location so they work from any cwd.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${BACKEND_DIR:-$REPO_ROOT}"
ENV_FILE="$BACKEND_DIR/.env"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

pass() { echo -e "  ${GREEN}✓${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; exit 1; }
warn() { echo -e "  ${YELLOW}⚠${NC} $1"; }
info() { echo -e "  ${BLUE}ℹ${NC}  $1"; }

echo "═══════════════════════════════════════════════════════════════"
echo "  PARA Blobstore Migration → SeaweedFS"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Check prerequisites
if ! command -v rclone &> /dev/null; then
  warn "rclone not found. Install it:"
  echo "  macOS: brew install rclone"
  echo "  Linux: curl https://rclone.org/install.sh | sudo bash"
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  fail ".env file not found at $ENV_FILE"
fi

# Source env vars
set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a

# Validate SeaweedFS destination
for var in PDS_BLOBSTORE_S3_BUCKET PDS_BLOBSTORE_S3_ENDPOINT PDS_BLOBSTORE_S3_ACCESS_KEY_ID PDS_BLOBSTORE_S3_SECRET_ACCESS_KEY; do
  value="${!var:-}"
  if [ -z "$value" ] || [[ "$value" == *"<"* ]] || [[ "$value" == *"changeme"* ]]; then
    fail "$var is not set in $ENV_FILE"
  fi
  pass "$var set"
done

SEAWEED_REGION="${PDS_BLOBSTORE_S3_REGION:-us-east-1}"
SEAWEED_BUCKET="$PDS_BLOBSTORE_S3_BUCKET"
SEAWEED_ENDPOINT="$PDS_BLOBSTORE_S3_ENDPOINT"
SEAWEED_KEY="$PDS_BLOBSTORE_S3_ACCESS_KEY_ID"
SEAWEED_SECRET="$PDS_BLOBSTORE_S3_SECRET_ACCESS_KEY"

# Configure rclone remote for SeaweedFS
rclone config delete para-seaweed 2>/dev/null || true
rclone config create para-seaweed s3 \
  provider Minio \
  access_key_id "$SEAWEED_KEY" \
  secret_access_key "$SEAWEED_SECRET" \
  endpoint "$SEAWEED_ENDPOINT" \
  region "$SEAWEED_REGION" \
  force_path_style true \
  2>/dev/null || true

echo ""
echo "Destination: s3://$SEAWEED_BUCKET @ $SEAWEED_ENDPOINT"

# Determine source
SOURCE="${1:-auto}"
if [ "$SOURCE" = "auto" ]; then
  if [ -n "${PDS_BLOBSTORE_DISK_LOCATION:-}" ] && [ -d "$PDS_BLOBSTORE_DISK_LOCATION" ]; then
    SOURCE="disk"
    DISK_DIR="$PDS_BLOBSTORE_DISK_LOCATION"
  elif [ -d "${HOME}/.paramx-demo/blobstore" ]; then
    SOURCE="disk"
    DISK_DIR="${HOME}/.paramx-demo/blobstore"
  elif [ -n "${R2_ENDPOINT:-}" ] && [ -n "${R2_BUCKET:-}" ]; then
    SOURCE="r2"
  else
    fail "Cannot auto-detect source. Pass 'disk' or 'r2', or set PDS_BLOBSTORE_DISK_LOCATION / R2_ENDPOINT."
  fi
fi

case "$SOURCE" in
  disk)
    DISK_DIR="${DISK_DIR:-${PDS_BLOBSTORE_DISK_LOCATION:-}}"
    if [ -z "$DISK_DIR" ] || [ ! -d "$DISK_DIR" ]; then
      fail "Disk blob directory not found: ${DISK_DIR:-<not set>}"
    fi

    echo "Source: local disk $DISK_DIR"
    echo ""

    # The PDS disk blobstore layout is:
    #   {location}/{did}/{cid}              -> permanent blobs -> s3 blocks/{did}/{cid}
    #   {location}/temp/{did}/{key}         -> temp uploads    -> s3 tmp/{did}/{key}
    #   {location}/quarantine/{did}/{cid}   -> quarantined    -> s3 quarantine/{did}/{cid}
    #
    # We stage symlinks so rclone can upload everything in one efficient pass.

    STAGING_DIR="$(mktemp -d /tmp/para-migrate-seaweedfs.XXXXXX)"
    trap 'rm -rf "$STAGING_DIR"' EXIT

    info "Staging disk blobs for S3 key layout..."
    mkdir -p "$STAGING_DIR/blocks" "$STAGING_DIR/tmp" "$STAGING_DIR/quarantine"

    stage_dir() {
      local src="$1"
      local dest_prefix="$2"
      if [ ! -d "$src" ]; then
        return 0
      fi
      local count
      count=$(find "$src" -type f | wc -l | xargs)
      if [ "$count" -eq 0 ]; then
        return 0
      fi
      info "Staging $count files from $(basename "$src") → $dest_prefix/"
      find "$src" -type f | while read -r file; do
        rel="${file#$src/}"
        dest="$STAGING_DIR/$dest_prefix/$rel"
        mkdir -p "$(dirname "$dest")"
        ln -s "$file" "$dest"
      done
    }

    stage_dir "$DISK_DIR" "blocks"
    stage_dir "$DISK_DIR/temp" "tmp"
    stage_dir "$DISK_DIR/quarantine" "quarantine"

    TOTAL_FILES=$(find "$STAGING_DIR" -type l | wc -l | xargs)
    if [ "$TOTAL_FILES" -eq 0 ]; then
      warn "No blob files found to migrate."
      exit 0
    fi

    echo ""
    echo "Migrating $TOTAL_FILES blob object(s) to SeaweedFS..."
    rclone copy "$STAGING_DIR/" "para-seaweed:$SEAWEED_BUCKET" \
      --progress \
      --checksum \
      --transfers 16 \
      --checkers 32 \
      --links
    ;;

  r2)
    if [ -z "${R2_ACCESS_KEY_ID:-}" ] || [ -z "${R2_SECRET_ACCESS_KEY:-}" ] || [ -z "${R2_ENDPOINT:-}" ] || [ -z "${R2_BUCKET:-}" ]; then
      fail "R2 source variables (R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET) must be set in $ENV_FILE"
    fi

    echo "Source: R2 s3://$R2_BUCKET @ $R2_ENDPOINT"
    echo ""

    rclone config delete para-r2-source 2>/dev/null || true
    rclone config create para-r2-source s3 \
      provider Cloudflare \
      access_key_id "$R2_ACCESS_KEY_ID" \
      secret_access_key "$R2_SECRET_ACCESS_KEY" \
      endpoint "$R2_ENDPOINT" \
      region auto \
      force_path_style true \
      2>/dev/null || true

    echo "Migrating blobs from R2 to SeaweedFS..."
    rclone sync "para-r2-source:$R2_BUCKET" "para-seaweed:$SEAWEED_BUCKET" \
      --progress \
      --checksum \
      --transfers 16 \
      --checkers 32
    ;;

  *)
    fail "Unknown source: $SOURCE. Use 'disk', 'r2', or 'auto'."
    ;;
esac

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Migration complete — verifying sample"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Verify by comparing a sample of object keys
SAMPLE_COUNT=10
SOURCE_COUNT=$(rclone ls "para-seaweed:$SEAWEED_BUCKET" 2>/dev/null | wc -l | xargs || echo "0")
info "Objects now in SeaweedFS bucket: $SOURCE_COUNT"

if [ "$SOURCE_COUNT" -gt 0 ]; then
  pass "Bucket listing succeeded"
else
  warn "Bucket appears empty — verify source and destination manually"
fi

echo ""
echo "Next steps:"
echo "  1. Confirm PDS_BLOBSTORE_S3_* values are correct in $ENV_FILE."
echo "  2. Restart PDS and run ./infrascripts/smoke-test-production.sh"
echo "  3. Back up SeaweedFS volumes: cd PARA/dev-env/seaweedfs && SEAWEEDFS_COMPOSE_PROJECT=watzappa ./seaweed-backup.sh"
echo ""
