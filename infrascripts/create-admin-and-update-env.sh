#!/bin/bash
set -euo pipefail

# PARA Admin Bootstrap Script
# =============================================================================
# Solves the chicken-and-egg problem: Ozone needs ADMIN_DIDs, but DIDs are
# only known after account creation. And if PDS_INVITE_REQUIRED=1, no one
# can create the first account.
#
# This script:
#   1. Temporarily disables invite requirement
#   2. Creates the first admin account on the PDS
#   3. Captures the DID from the response
#   4. Updates .env with ADMIN_DIDS and OZONE_ADMIN_DIDS
#   5. Restores invite requirement
#   6. Restarts the stack so Ozone picks up the admin DID
#
# Usage:
#   ./infrascripts/create-admin-and-update-env.sh [handle] [email] [password]
#
# Example:
#   ./infrascripts/create-admin-and-update-env.sh admin.para.social admin@para.social "MyStrongP@ssw0rd"
#
# Prerequisites:
#   - The stack must be running (at least PDS + Postgres)
#   - jq must be installed
#   - curl must be installed
# =============================================================================

# These scripts live INSIDE the repo (infrascripts/), but were written for a
# layout where they sat beside it and `WatZappa` was a subdirectory. Resolve
# the repo root from the script's own location so they work from any cwd.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${BACKEND_DIR:-$REPO_ROOT}"
ENV_FILE="$BACKEND_DIR/.env"
PDS_URL="${PDS_URL:-http://localhost:2583}"

HANDLE="${1:-admin.para.social}"
EMAIL="${2:-admin@para.social}"
PASSWORD="${3:-}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

error() {
    echo -e "${RED}❌ $1${NC}" >&2
    exit 1
}

warn() {
    echo -e "${YELLOW}⚠️  $1${NC}" >&2
}

info() {
    echo -e "${GREEN}ℹ️  $1${NC}"
}

# Validate prerequisites
if ! command -v jq &> /dev/null; then
    error "jq is required. Install it: brew install jq (macOS) or apt-get install jq (Linux)"
fi

if ! command -v curl &> /dev/null; then
    error "curl is required."
fi

if [ ! -f "$ENV_FILE" ]; then
    error "$ENV_FILE not found. Run ./infrainfrascripts/generate-secrets.sh first."
fi

if [ -z "$PASSWORD" ]; then
    echo "No password provided. Generating a strong random password..."
    PASSWORD=$(openssl rand -base64 24)
    echo "Generated password: $PASSWORD"
    echo "SAVE THIS PASSWORD — it will not be shown again."
    read -p "Press Enter to continue..."
fi

# Check PDS health
info "Checking PDS health at $PDS_URL ..."
if ! curl -sf "$PDS_URL/xrpc/_health" > /dev/null; then
    error "PDS is not responding at $PDS_URL. Start the stack first: docker compose -f $BACKEND_DIR/docker-compose.prod.yaml up -d"
fi

# Read current invite setting
INVITE_REQUIRED=$(grep "^PDS_INVITE_REQUIRED=" "$ENV_FILE" | cut -d= -f2 || echo "1")

# Step 1: Temporarily disable invite requirement if needed
if [ "$INVITE_REQUIRED" = "1" ]; then
    warn "PDS_INVITE_REQUIRED is 1. Temporarily disabling to create first account..."
    sed -i.bak 's/^PDS_INVITE_REQUIRED=1/PDS_INVITE_REQUIRED=0/' "$ENV_FILE"
    
    # Restart only PDS to pick up the change
    info "Restarting PDS with invites disabled..."
    pushd "$BACKEND_DIR" > /dev/null
    docker compose -f docker-compose.prod.yaml up -d --no-deps pds
    popd > /dev/null
    
    # Wait for PDS to be ready
    info "Waiting for PDS to restart..."
    for i in {1..30}; do
        if curl -sf "$PDS_URL/xrpc/_health" > /dev/null; then
            break
        fi
        sleep 1
    done
    
    if ! curl -sf "$PDS_URL/xrpc/_health" > /dev/null; then
        error "PDS failed to restart. Check logs: docker logs -f para-pds"
    fi
fi

# Step 2: Create the admin account
info "Creating admin account: $HANDLE ..."
CREATE_RESPONSE=$(curl -sf -X POST "$PDS_URL/xrpc/com.atproto.server.createAccount" \
    -H "Content-Type: application/json" \
    -d "{\"handle\":\"$HANDLE\",\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" 2>/dev/null) || {
    error "Account creation failed. The handle may already exist or the PDS rejected the request.\nLogs: docker logs -f para-pds"
}

ADMIN_DID=$(echo "$CREATE_RESPONSE" | jq -r '.did')
ACCESS_JWT=$(echo "$CREATE_RESPONSE" | jq -r '.accessJwt')

if [ -z "$ADMIN_DID" ] || [ "$ADMIN_DID" = "null" ]; then
    error "Account creation succeeded but no DID was returned. Response: $CREATE_RESPONSE"
fi

info "Account created successfully!"
info "  Handle: $HANDLE"
info "  DID:    $ADMIN_DID"
info "  Email:  $EMAIL"

# Step 3: Verify the account by resolving the handle
info "Verifying handle resolution..."
RESOLVE_RESPONSE=$(curl -sf "$PDS_URL/xrpc/com.atproto.identity.resolveHandle?handle=$HANDLE")
RESOLVED_DID=$(echo "$RESOLVE_RESPONSE" | jq -r '.did')

if [ "$RESOLVED_DID" != "$ADMIN_DID" ]; then
    warn "Handle resolution mismatch. Expected $ADMIN_DID, got $RESOLVED_DID"
fi

# Step 4: Update .env with the DID
info "Updating $ENV_FILE with admin DID..."

# Backup .env
cp "$ENV_FILE" "$ENV_FILE.bak.$(date +%Y%m%d%H%M%S)"

append_did_env() {
    local var="$1"
    local did="$2"
    local current

    current=$(grep "^${var}=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- | head -1 || true)

    if [ -z "$current" ] || [[ "$current" == *"<"* ]] || [[ "$current" == *">"* ]]; then
        if grep -q "^${var}=" "$ENV_FILE"; then
            sed -i.bak "s|^${var}=.*|${var}=${did}|" "$ENV_FILE"
        else
            echo "${var}=${did}" >> "$ENV_FILE"
        fi
        return
    fi

    if echo "$current" | tr ',' '\n' | grep -qx "$did"; then
        info "$var already includes $did"
        return
    fi

    sed -i.bak "s|^${var}=.*|${var}=${current},${did}|" "$ENV_FILE"
}

append_did_env "ADMIN_DIDS" "$ADMIN_DID"
append_did_env "OZONE_ADMIN_DIDS" "$ADMIN_DID"

# Step 5: Restore invite requirement if it was disabled
if [ "$INVITE_REQUIRED" = "1" ]; then
    info "Restoring PDS_INVITE_REQUIRED=1..."
    sed -i.bak 's/^PDS_INVITE_REQUIRED=0/PDS_INVITE_REQUIRED=1/' "$ENV_FILE"
fi

# Clean up .bak files created by sed
rm -f "$ENV_FILE.bak"

# Step 6: Restart the full stack so Ozone picks up the admin DID
info "Restarting stack to apply admin DID to Ozone..."
pushd "$BACKEND_DIR" > /dev/null
docker compose -f docker-compose.prod.yaml up -d
popd > /dev/null

info "Waiting for services to restart..."
sleep 10

# Step 7: Final health check
PDS_HEALTH=$(curl -sf "$PDS_URL/xrpc/_health" && echo "OK" || echo "FAIL")
BSKY_HEALTH=$(curl -sf http://localhost:2584/xrpc/_health && echo "OK" || echo "FAIL")

info "Health checks:"
echo "  PDS:     $PDS_HEALTH"
echo "  AppView: $BSKY_HEALTH"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo -e "${GREEN}✅ Admin bootstrap complete!${NC}"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "  Handle:   $HANDLE"
echo "  DID:      $ADMIN_DID"
echo "  Email:    $EMAIL"
echo "  Password: $PASSWORD"
echo ""
echo "  .env updated with:"
echo "    ADMIN_DIDS=$ADMIN_DID"
echo "    OZONE_ADMIN_DIDS=$ADMIN_DID"
echo ""
echo "  Next steps:"
echo "    1. Save the password above in your password manager."
echo "    2. Log in to the app with handle $HANDLE"
echo "    3. Access Ozone moderation at https://ozone.para.social"
echo ""
echo "  To add more admins later, run this script again with a different handle."
echo ""
