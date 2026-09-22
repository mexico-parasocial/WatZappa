#!/bin/bash
set -euo pipefail

# =============================================================================
# PARA Bare-Metal Pre-Deploy Checklist
# =============================================================================
# Run this BEFORE running ./infrascripts/deploy-local.sh on the bare-metal box.
# It validates env, secrets, compose syntax, and SeaweedFS readiness.
#
# Usage:
#   ./infrascripts/pre-deploy-local.sh
#
# Exit codes:
#   0 = ready to deploy
#   1 = blockers found
# =============================================================================

# These scripts live INSIDE the repo (infrascripts/), but were written for a
# layout where they sat beside it and `WatZappa` was a subdirectory. Resolve
# the repo root from the script's own location so they work from any cwd.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${BACKEND_DIR:-$REPO_ROOT}"
ENV_FILE="$BACKEND_DIR/.env"
COMPOSE_FILE="$BACKEND_DIR/docker-compose.local.yaml"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

ERRORS=0
WARNINGS=0

pass() { echo -e "  ${GREEN}✓${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; ((ERRORS++)) || true; }
warn() { echo -e "  ${YELLOW}⚠${NC} $1"; ((WARNINGS++)) || true; }
info() { echo -e "  ${BLUE}ℹ${NC}  $1"; }

header() {
  echo ""
  echo -e "${BOLD}${BLUE}═══ $1 ═══${NC}"
}

# =============================================================================
# 1. Files exist
# =============================================================================
header "File Presence"

for f in "$ENV_FILE" "$COMPOSE_FILE"; do
  if [ -f "$f" ]; then
    pass "$(basename "$f") exists"
  else
    fail "$(basename "$f") MISSING"
  fi
done

# =============================================================================
# 2. Environment variables
# =============================================================================
header "Environment Variables"

required_vars=(
  "POSTGRES_PASSWORD"
  "PDS_REPO_SIGNING_KEY_K256_PRIVATE_KEY_HEX"
  "PDS_PLC_ROTATION_KEY_K256_PRIVATE_KEY_HEX"
  "PDS_DPOP_SECRET"
  "PDS_JWT_SECRET"
  "PDS_ADMIN_PASSWORD"
  "PDS_BLOBSTORE_S3_BUCKET"
  "PDS_BLOBSTORE_S3_ENDPOINT"
  "PDS_BLOBSTORE_S3_ACCESS_KEY_ID"
  "PDS_BLOBSTORE_S3_SECRET_ACCESS_KEY"
  "BSKY_SERVICE_SIGNING_KEY"
  "ADMIN_PASSWORDS"
)

for var in "${required_vars[@]}"; do
  value=$(grep "^${var}=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- | head -1 || true)

  if [ -z "$value" ]; then
    fail "$var is empty"
  elif [[ "$value" == *"<"* ]] || [[ "$value" == *">"* ]] || [[ "$value" == *"changeme"* ]] || [[ "$value" == *"YOUR_"* ]] || [[ "$value" == *"example.com"* ]] || [[ "$value" == *"set-your"* ]]; then
    fail "$var has placeholder value: $value"
  else
    if [ "${#value}" -gt 8 ]; then
      masked="${value:0:4}...${value: -4}"
    else
      masked="$value"
    fi
    pass "$var set ($masked)"
  fi
done

# ADMIN_DIDS is optional for bare-metal launch (set after first account)
admin_dids=$(grep "^ADMIN_DIDS=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- | head -1 || true)
if [ -z "$admin_dids" ]; then
  warn "ADMIN_DIDS is empty — set it after creating the first admin account"
elif [[ "$admin_dids" == *"will-be-known"* ]]; then
  warn "ADMIN_DIDS still has placeholder — set it after creating the first admin account"
fi

# Make sure legacy disk blobstore is not still set
disk_blobstore=$(grep "^PDS_BLOBSTORE_DISK_LOCATION=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- | head -1 || true)
if [ -n "$disk_blobstore" ]; then
  fail "PDS_BLOBSTORE_DISK_LOCATION is still set ($disk_blobstore). Remove it to use SeaweedFS."
fi

force_path_style=$(grep "^PDS_BLOBSTORE_S3_FORCE_PATH_STYLE=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- | head -1 || true)
if [ "$force_path_style" != "true" ]; then
  warn "PDS_BLOBSTORE_S3_FORCE_PATH_STYLE should be 'true' for SeaweedFS"
fi

# =============================================================================
# 3. Secret entropy
# =============================================================================
header "Secret Entropy"

for var in PDS_REPO_SIGNING_KEY_K256_PRIVATE_KEY_HEX PDS_PLC_ROTATION_KEY_K256_PRIVATE_KEY_HEX PDS_DPOP_SECRET PDS_JWT_SECRET BSKY_SERVICE_SIGNING_KEY; do
  value=$(grep "^${var}=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- | head -1 || true)
  len="${#value}"
  if [ "$len" -ge 32 ]; then
    pass "$var has good length ($len chars)"
  elif [ "$len" -gt 0 ]; then
    warn "$var is short ($len chars) — should be 64 hex chars"
  fi
done

# =============================================================================
# 4. Docker Compose syntax
# =============================================================================
header "Docker Compose"

if docker compose -f "$COMPOSE_FILE" config > /dev/null 2>&1; then
  pass "$COMPOSE_FILE syntax is valid"
else
  fail "$COMPOSE_FILE has syntax errors"
  docker compose -f "$COMPOSE_FILE" config 2>&1 | head -5 | sed 's/^/    /'
fi

# =============================================================================
# 5. Docker daemon & images
# =============================================================================
header "Docker Images"

if ! docker info > /dev/null 2>&1; then
  fail "Docker daemon is not running"
else
  pass "Docker daemon is running"

  if docker images | grep -q "chrislusf/seaweedfs.*4.37"; then
    pass "SeaweedFS 4.37 image is present locally"
  else
    warn "SeaweedFS 4.37 image not pulled yet — deploy will pull it"
  fi

  if docker images | grep -q "para-pds"; then
    pass "PDS image exists in local cache"
  else
    warn "PDS image not built yet — deploy will build it"
  fi

  if docker images | grep -q "para-bsky"; then
    pass "AppView image exists in local cache"
  else
    warn "AppView image not built yet — deploy will build it"
  fi
fi

# =============================================================================
# 6. System tuning
# =============================================================================
header "System Tuning"

if [ -f "/etc/security/limits.d/para.conf" ]; then
  pass "System limits configured"
else
  warn "System limits not configured — run ./infrascripts/bare-metal/system-tune.sh"
fi

# =============================================================================
# Summary
# =============================================================================
header "Summary"

if [ "$ERRORS" -eq 0 ] && [ "$WARNINGS" -eq 0 ]; then
  echo -e "  ${GREEN}✅ READY TO DEPLOY${NC} — All checks passed"
  echo ""
  echo "  Next step:"
  echo "    ./infrascripts/deploy-local.sh"
  exit 0
elif [ "$ERRORS" -eq 0 ]; then
  echo -e "  ${YELLOW}⚠️  READY WITH WARNINGS${NC} — ${WARNINGS} warning(s)"
  echo ""
  echo "  You can deploy, but review warnings above."
  exit 0
else
  echo -e "  ${RED}❌ BLOCKED${NC} — ${ERRORS} error(s), ${WARNINGS} warning(s)"
  echo ""
  echo "  Fix errors before deploying."
  exit 1
fi
