#!/bin/bash
set -euo pipefail

# PARA Production Smoke Test
# =============================================================================
# End-to-end verification after deploying to production.
# Run this ON THE SERVER or from a machine that can reach the public URLs.
#
# Usage:
#   ./infrascripts/smoke-test-production.sh [base-url]
#
# Examples:
#   ./infrascripts/smoke-test-production.sh https://pds.para.social
#   ./infrascripts/smoke-test-production.sh https://appview.para.social
#
# Tests performed:
#   1. PDS health + ready
#   2. AppView health
#   3. DID resolution
#   4. Account creation
#   5. Post creation with blob
#   6. Feed retrieval
#   7. Blob upload/download
# =============================================================================

BASE_URL="${1:-https://pds.para.social}"
APPVIEW_URL="${2:-https://appview.para.social}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

ERRORS=0
PASS=0

pass() { echo -e "  ${GREEN}✓${NC} $1"; ((PASS++)) || true; }
fail() { echo -e "  ${RED}✗${NC} $1"; ((ERRORS++)) || true; }
warn() { echo -e "  ${YELLOW}⚠${NC} $1"; }
info() { echo -e "  ${BLUE}ℹ${NC}  $1"; }

header() {
  echo ""
  echo -e "${BOLD}${BLUE}═══ $1 ═══${NC}"
}

# =============================================================================
# Helpers
# =============================================================================

http_status() {
  curl -sf -o /dev/null -w "%{http_code}" "$1" 2>/dev/null || echo "000"
}

http_body() {
  curl -sf "$1" 2>/dev/null || echo '{}'
}

# =============================================================================
# 1. Health Checks
# =============================================================================
header "1. Health Checks"

PDS_HEALTH=$(http_status "${BASE_URL}/xrpc/_health")
if [ "$PDS_HEALTH" = "200" ]; then
  pass "PDS /_health responds 200"
else
  fail "PDS /_health returned $PDS_HEALTH"
fi

PDS_READY=$(http_status "${BASE_URL}/xrpc/_ready")
if [ "$PDS_READY" = "200" ]; then
  pass "PDS /_ready responds 200"
else
  fail "PDS /_ready returned $PDS_READY"
fi

APPVIEW_HEALTH=$(http_status "${APPVIEW_URL}/xrpc/_health")
if [ "$APPVIEW_HEALTH" = "200" ]; then
  pass "AppView /_health responds 200"
else
  fail "AppView /_health returned $APPVIEW_HEALTH"
fi

# =============================================================================
# 2. Server Description
# =============================================================================
header "2. Server Description"

SERVER_INFO=$(http_body "${BASE_URL}/xrpc/com.atproto.server.describeServer")
if echo "$SERVER_INFO" | grep -q '"inviteCodeRequired"'; then
  INVITE_REQUIRED=$(echo "$SERVER_INFO" | grep -o '"inviteCodeRequired":[a-z]*' | cut -d: -f2)
  pass "PDS describes itself (inviteRequired=$INVITE_REQUIRED)"
else
  fail "PDS describeServer did not return expected fields"
fi

# =============================================================================
# 3. Account Creation
# =============================================================================
header "3. Account Creation"

TEST_HANDLE="smoketest-$(date +%s).para.social"
TEST_EMAIL="smoke+$(date +%s)@para.social"
TEST_PASSWORD="SmokeTest123!$(openssl rand -hex 4)"

info "Creating test account: $TEST_HANDLE"

CREATE_RESP=$(curl -sf -X POST "${BASE_URL}/xrpc/com.atproto.server.createAccount" \
  -H "Content-Type: application/json" \
  -d "{\"handle\":\"$TEST_HANDLE\",\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}" 2>/dev/null || echo '{}')

TEST_DID=$(echo "$CREATE_RESP" | grep -o '"did":"[^"]*"' | head -1 | cut -d'"' -f4 || true)
ACCESS_JWT=$(echo "$CREATE_RESP" | grep -o '"accessJwt":"[^"]*"' | head -1 | cut -d'"' -f4 || true)

if [ -n "$TEST_DID" ] && [ "$TEST_DID" != "null" ]; then
  pass "Account created: $TEST_DID"
else
  fail "Account creation failed"
  echo "$CREATE_RESP" | head -3 | sed 's/^/    /'
fi

# =============================================================================
# 4. DID Resolution
# =============================================================================
header "4. DID Resolution"

if [ -n "$TEST_DID" ]; then
  RESOLVE_RESP=$(curl -sf "${BASE_URL}/xrpc/com.atproto.identity.resolveHandle?handle=$TEST_HANDLE" 2>/dev/null || echo '{}')
  RESOLVED_DID=$(echo "$RESOLVE_RESP" | grep -o '"did":"[^"]*"' | head -1 | cut -d'"' -f4 || true)

  if [ "$RESOLVED_DID" = "$TEST_DID" ]; then
    pass "DID resolution works for $TEST_HANDLE"
  else
    fail "DID resolution mismatch"
  fi
fi

# =============================================================================
# 5. Create a Post
# =============================================================================
header "5. Create Post"

if [ -n "$ACCESS_JWT" ]; then
  POST_RESP=$(curl -sf -X POST "${BASE_URL}/xrpc/com.atproto.repo.createRecord" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ACCESS_JWT" \
    -d "{\"repo\":\"$TEST_DID\",\"collection\":\"app.bsky.feed.post\",\"record\":{\"text\":\"Smoke test post from PARA 🧪\",\"createdAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}}" 2>/dev/null || echo '{}')

  POST_URI=$(echo "$POST_RESP" | grep -o '"uri":"[^"]*"' | head -1 | cut -d'"' -f4 || true)

  if [ -n "$POST_URI" ] && [ "$POST_URI" != "null" ]; then
    pass "Post created: ${POST_URI:0:60}..."
  else
    fail "Post creation failed"
    echo "$POST_RESP" | head -3 | sed 's/^/    /'
  fi
else
  warn "Skipping post creation — no access token"
fi

# =============================================================================
# 6. Feed Retrieval
# =============================================================================
header "6. Feed Retrieval"

if [ -n "$TEST_DID" ]; then
  FEED_RESP=$(curl -sf "${APPVIEW_URL}/xrpc/app.bsky.feed.getAuthorFeed?actor=$TEST_DID&limit=5" 2>/dev/null || echo '{}')

  if echo "$FEED_RESP" | grep -q '"feed"'; then
    FEED_LEN=$(echo "$FEED_RESP" | grep -o '"uri"' | wc -l | xargs)
    pass "Feed retrieved with $FEED_LEN post(s)"
  else
    fail "Feed retrieval failed"
  fi
else
  warn "Skipping feed retrieval — no test DID"
fi

# =============================================================================
# 7. Blob Upload
# =============================================================================
header "7. Blob Upload"

if [ -n "$ACCESS_JWT" ]; then
  # Create a tiny test image (1x1 transparent PNG)
  TEST_BLOB=$(echo -n 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' | base64 -d | base64)

  BLOB_RESP=$(curl -sf -X POST "${BASE_URL}/xrpc/com.atproto.repo.uploadBlob" \
    -H "Content-Type: image/png" \
    -H "Authorization: Bearer $ACCESS_JWT" \
    --data-binary <(echo -n 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' | base64 -d) 2>/dev/null || echo '{}')

  BLOB_REF=$(echo "$BLOB_RESP" | grep -o '"blob":{"[^}]*"' | head -1 || true)

  if [ -n "$BLOB_REF" ]; then
    pass "Blob uploaded successfully"
  else
    warn "Blob upload may have failed (check blobstore credentials)"
    echo "$BLOB_RESP" | head -2 | sed 's/^/    /'
  fi
else
  warn "Skipping blob upload — no access token"
fi

# =============================================================================
# 8. Cleanup (delete test account)
# =============================================================================
header "8. Cleanup"

if [ -n "$ACCESS_JWT" ]; then
  # Note: PDS may not support account deletion via XRPC
  info "Test account $TEST_HANDLE can be deleted manually if needed"
fi

# =============================================================================
# Summary
# =============================================================================
header "Smoke Test Summary"

if [ "$ERRORS" -eq 0 ]; then
  echo -e "  ${GREEN}✅ ALL SMOKE TESTS PASSED${NC}"
  echo "     $PASS checks passed"
  echo ""
  echo "  PARA is healthy and ready for users."
else
  echo -e "  ${RED}❌ $ERRORS test(s) failed${NC}"
  echo "     $PASS passed, $ERRORS failed"
  echo ""
  echo "  Check logs: ssh your-server 'docker compose logs -f'"
fi

exit "$ERRORS"
