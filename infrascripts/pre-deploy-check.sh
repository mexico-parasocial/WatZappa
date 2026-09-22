#!/bin/bash
set -euo pipefail

# PARA Pre-Deploy Checklist
# =============================================================================
# Run this BEFORE deploying to production. It validates that all required
# configuration, secrets, and build artifacts are present and correct.
#
# Usage:
#   ./infrascripts/pre-deploy-check.sh
#
# Exit codes:
#   0 = ready to deploy
#   1 = blockers found, fix before deploying
# =============================================================================

# These scripts live INSIDE the repo (infrascripts/), but were written for a
# layout where they sat beside it and `WatZappa` was a subdirectory. Resolve
# the repo root from the script's own location so they work from any cwd.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${BACKEND_DIR:-$REPO_ROOT}"
ENV_FILE="$BACKEND_DIR/.env"
COMPOSE_FILE="$BACKEND_DIR/docker-compose.prod.yaml"
CADDYFILE="$BACKEND_DIR/services/caddy/Caddyfile.prod"

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

for f in "$ENV_FILE" "$COMPOSE_FILE" "$CADDYFILE"; do
  if [ -f "$f" ]; then
    pass "$(basename "$f") exists"
  else
    fail "$(basename "$f") MISSING"
  fi
done

# =============================================================================
# 2. Environment variables (no placeholders)
# =============================================================================
header "Environment Variables"

# Required vars that must not be empty or placeholder
required_vars=(
  "POSTGRES_PASSWORD"
  "PDS_REPO_SIGNING_KEY_K256_PRIVATE_KEY_HEX"
  "PDS_PLC_ROTATION_KEY_K256_PRIVATE_KEY_HEX"
  "PDS_DPOP_SECRET"
  "PDS_JWT_SECRET"
  "PDS_ADMIN_PASSWORD"
  "BSKY_SERVICE_SIGNING_KEY"
  "ADMIN_PASSWORDS"
  "PDS_BLOBSTORE_S3_BUCKET"
  "PDS_BLOBSTORE_S3_ENDPOINT"
  "PDS_BLOBSTORE_S3_ACCESS_KEY_ID"
  "PDS_BLOBSTORE_S3_SECRET_ACCESS_KEY"
  "PDS_INVITE_REQUIRED"
)

for var in "${required_vars[@]}"; do
  # Extract value from .env (handle comments, empty lines)
  value=$(grep "^${var}=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- | head -1 || true)

  if [ -z "$value" ]; then
    fail "$var is empty"
  elif [[ "$value" == *"<"* ]] || [[ "$value" == *">"* ]] || [[ "$value" == *"changeme"* ]] || [[ "$value" == *"YOUR_"* ]] || [[ "$value" == *"example.com"* ]] || [[ "$value" == *"set-your"* ]]; then
    fail "$var has placeholder value: $value"
  else
    # Mask secret values
    if [ "${#value}" -gt 8 ]; then
      masked="${value:0:4}...${value: -4}"
    else
      masked="$value"
    fi
    pass "$var set ($masked)"
  fi
done

# ADMIN_DIDS must be set for production (Ozone moderation won't work without it)
admin_dids=$(grep "^ADMIN_DIDS=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- | head -1 || true)
if [ -z "$admin_dids" ]; then
  fail "ADMIN_DIDS is empty — Ozone moderation requires at least one admin DID"
fi

ozone_admin_dids=$(grep "^OZONE_ADMIN_DIDS=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- | head -1 || true)
if [ -z "$ozone_admin_dids" ]; then
  warn "OZONE_ADMIN_DIDS is empty — will fallback to ADMIN_DIDS after first deploy"
fi

# =============================================================================
# 2b. GrowthBook feature flags (optional but recommended)
# =============================================================================
header "GrowthBook Configuration"

gb_api_host=$(grep "^BSKY_GROWTHBOOK_API_HOST=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- | head -1 || true)
gb_client_key=$(grep "^BSKY_GROWTHBOOK_CLIENT_KEY=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- | head -1 || true)

if [ -n "$gb_api_host" ] && [ -n "$gb_client_key" ]; then
  pass "GrowthBook backend configured"
elif [ -n "$gb_api_host" ] || [ -n "$gb_client_key" ]; then
  warn "GrowthBook partially configured (need both API_HOST and CLIENT_KEY)"
else
  warn "GrowthBook not configured — feature gates will use defaults"
fi

# =============================================================================
# 2c. Matrix / Bridge (optional stack)
# =============================================================================
header "Matrix Stack (Optional)"

MATRIX_COMPOSE_FILE="$BACKEND_DIR/docker-compose.matrix.yaml"
if [ -f "$MATRIX_COMPOSE_FILE" ]; then
  pass "docker-compose.matrix.yaml exists"
  matrix_vars=(
    "MATRIX_SERVER_NAME"
    "MATRIX_DOMAIN"
    "MATRIX_ADMIN_TOKEN"
  )
  matrix_ok=0
  for var in "${matrix_vars[@]}"; do
    value=$(grep "^${var}=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- | head -1 || true)
    if [ -n "$value" ] && [[ "$value" != *"<"* ]] && [[ "$value" != *">"* ]] && [[ "$value" != *"changeme"* ]]; then
      ((matrix_ok++)) || true
    fi
  done
  if [ "$matrix_ok" -eq 3 ]; then
    pass "Matrix variables configured ($matrix_ok/3)"
  else
    warn "Matrix variables incomplete ($matrix_ok/3) — skip Matrix or fix .env"
  fi
else
  warn "docker-compose.matrix.yaml not found — Matrix stack unavailable"
fi

# =============================================================================
# 3. Docker Compose syntax
# =============================================================================
header "Docker Compose"

if docker compose -f "$COMPOSE_FILE" config > /dev/null 2>&1; then
  pass "docker-compose.prod.yaml syntax is valid"
else
  fail "docker-compose.prod.yaml has syntax errors"
  docker compose -f "$COMPOSE_FILE" config 2>&1 | head -5 | sed 's/^/    /'
fi

# =============================================================================
# 4. Caddyfile syntax
# =============================================================================
header "Caddy Configuration"

if command -v caddy &> /dev/null; then
  if caddy validate --config "$CADDYFILE" > /dev/null 2>&1; then
    pass "Caddyfile is valid"
  else
    fail "Caddyfile has errors"
    caddy validate --config "$CADDYFILE" 2>&1 | head -5 | sed 's/^/    /'
  fi
else
  warn "caddy not installed locally — skipping Caddyfile validation"
fi

# =============================================================================
# 5. Docker images can build
# =============================================================================
header "Docker Build (quick check)"

pushd "$BACKEND_DIR" > /dev/null

# Check if Docker daemon is running
if ! docker info > /dev/null 2>&1; then
  warn "Docker daemon not running — skipping build check"
else
  # Check if previous build exists (cache hit)
  if docker images | grep -q "para-pds"; then
    pass "PDS image exists in local cache"
  else
    warn "PDS image not built yet — run 'docker compose build' before deploy"
  fi

  if docker images | grep -q "para-bsky"; then
    pass "AppView image exists in local cache"
  else
    warn "AppView image not built yet — run 'docker compose build' before deploy"
  fi
fi
popd > /dev/null

# =============================================================================
# 6. Secret entropy check
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
# 7. Domain configuration
# =============================================================================
header "Domain Configuration"

PDS_HOSTNAME=$(grep "^PDS_HOSTNAME=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- | head -1 || true)
if [ -n "$PDS_HOSTNAME" ] && [ "$PDS_HOSTNAME" != "localhost" ]; then
  pass "PDS_HOSTNAME set to $PDS_HOSTNAME"
else
  fail "PDS_HOSTNAME not set or is localhost"
fi

# =============================================================================
# 8. Database connectivity & migration status
# =============================================================================
header "Database Checks"

if docker info > /dev/null 2>&1; then
  # Check if postgres container is running locally
  if docker ps | grep -q "para-postgres"; then
    if docker exec para-postgres pg_isready -U "${POSTGRES_USER:-pg}" > /dev/null 2>&1; then
      pass "PostgreSQL is accepting connections"
    else
      fail "PostgreSQL is not responding"
    fi

    # Check migration status (best-effort: count applied migrations)
    pds_migration_count=$(docker exec para-postgres psql -U "${POSTGRES_USER:-pg}" -d "${POSTGRES_DB:-para}" -Atc "SELECT COUNT(*) FROM kysely_migration;" 2>/dev/null || echo "0")
    if [ "$pds_migration_count" -gt 0 ] 2>/dev/null; then
      pass "PDS migrations applied ($pds_migration_count tables tracked)"
    else
      warn "Could not verify PDS migration status — may need to run migrations"
    fi

    bsky_migration_count=$(docker exec para-postgres psql -U "${POSTGRES_USER:-pg}" -d "${POSTGRES_DB:-para}" -Atc "SELECT COUNT(*) FROM migration;" 2>/dev/null || echo "0")
    if [ "$bsky_migration_count" -gt 0 ] 2>/dev/null; then
      pass "AppView migrations applied ($bsky_migration_count migrations tracked)"
    else
      warn "Could not verify AppView migration status — may need to run migrations"
    fi
  else
    warn "para-postgres container not running locally — skipping DB connectivity check"
  fi

  # Check Redis
  if docker ps | grep -q "para-redis"; then
    if docker exec para-redis redis-cli ping | grep -q "PONG"; then
      pass "Redis is responding to PING"
    else
      fail "Redis is not responding"
    fi
  else
    warn "para-redis container not running locally — skipping Redis check"
  fi
else
  warn "Docker daemon not running — skipping DB connectivity checks"
fi

# =============================================================================
# Summary
# =============================================================================
header "Summary"

if [ "$ERRORS" -eq 0 ] && [ "$WARNINGS" -eq 0 ]; then
  echo -e "  ${GREEN}✅ READY TO DEPLOY${NC} — All checks passed"
  echo ""
  echo "  Next step:"
  echo "    ./infrascripts/deploy-production.sh root@your-server"
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
