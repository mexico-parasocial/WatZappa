#!/bin/bash
set -euo pipefail

# PARA R2 Setup Verification
# =============================================================================
# Verifies that Cloudflare R2 is accessible and correctly configured.
#
# Usage:
#   ./infrascripts/setup-r2.sh
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

echo "═══════════════════════════════════════════════════════════════"
echo "  Cloudflare R2 Setup Verification"
echo "═══════════════════════════════════════════════════════════════"
echo ""

if [ ! -f "$ENV_FILE" ]; then
  echo -e "${RED}❌ $ENV_FILE not found${NC}"
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

# Check required vars
check_var() {
  local name="$1"
  local value="${!name:-}"
  if [ -z "$value" ] || [[ "$value" == *"<set-your"* ]] || [[ "$value" == *"<r2-"* ]]; then
    echo -e "  ${RED}✗ $name not set${NC}"
    return 1
  else
    echo -e "  ${GREEN}✓ $name set${NC}"
    return 0
  fi
}

echo "Checking environment variables..."
check_var "R2_ACCESS_KEY_ID" || exit 1
check_var "R2_SECRET_ACCESS_KEY" || exit 1
check_var "R2_ENDPOINT" || exit 1
check_var "R2_BUCKET" || exit 1

echo ""
echo "  Bucket:    $R2_BUCKET"
echo "  Endpoint:  $R2_ENDPOINT"
echo ""

# Try to list bucket contents using curl
# R2 supports AWS Signature Version 4

echo "Testing R2 connectivity..."
echo ""

# Use rclone if available
if command -v rclone &> /dev/null; then
  rclone config create para-r2 s3 \
    provider Cloudflare \
    access_key_id "$R2_ACCESS_KEY_ID" \
    secret_access_key "$R2_SECRET_ACCESS_KEY" \
    endpoint "$R2_ENDPOINT" \
    region auto \
    force_path_style true \
    2>/dev/null || true

  if rclone ls "para-r2:$R2_BUCKET" > /dev/null 2>&1; then
    echo -e "  ${GREEN}✓ R2 bucket is accessible${NC}"
    BLOB_COUNT=$(rclone ls "para-r2:$R2_BUCKET" 2>/dev/null | wc -l | xargs)
    echo -e "  ${BLUE}ℹ Objects in bucket: $BLOB_COUNT${NC}"
  else
    echo -e "  ${RED}✗ Cannot access R2 bucket${NC}"
    echo "   Check your access key and secret."
    exit 1
  fi
elif command -v aws &> /dev/null; then
  if aws s3 ls "s3://$R2_BUCKET" --endpoint-url "$R2_ENDPOINT" > /dev/null 2>&1; then
    echo -e "  ${GREEN}✓ R2 bucket is accessible${NC}"
  else
    echo -e "  ${RED}✗ Cannot access R2 bucket${NC}"
    exit 1
  fi
else
  echo -e "  ${YELLOW}⚠ Neither rclone nor aws-cli installed.${NC}"
  echo "   Install one to verify connectivity:"
  echo "     brew install rclone"
  echo "     or: pip install awscli"
  exit 0
fi

echo ""
echo -e "${GREEN}✅ R2 is correctly configured and accessible${NC}"
echo ""
