#!/bin/bash
set -euo pipefail

# =============================================================================
# PARA — Cloudflare Tunnel Local Setup
# =============================================================================
# Exposes your LOCAL dev stack to the internet without a public IP.
# Perfect for testing before buying a VPS.
#
# Prerequisites:
#   - Your local stack is running (docker compose up in dev or prod mode)
#   - You own para.social and manage DNS in Cloudflare
#
# What this does:
#   1. Checks if cloudflared is installed
#   2. Verifies your local services are reachable
#   3. Guides you to create a Cloudflare tunnel
#   4. Generates the config file
#   5. Starts the tunnel
# =============================================================================

TUNNEL_NAME="para-local"
CONFIG_DIR="$HOME/.cloudflared"
CONFIG_FILE="$CONFIG_DIR/config.yml"
DOMAIN="para.social"

echo "═══════════════════════════════════════════════════════════════"
echo "  PARA — Cloudflare Tunnel (Local Test)"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# ── Step 1: Check cloudflared ────────────────────────────────────────────────
if ! command -v cloudflared &>/dev/null; then
    echo "❌ cloudflared not found."
    echo ""
    echo "Install it:"
    echo "   macOS:    brew install cloudflared"
    echo "   Linux:    https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
    echo "   Windows:  winget install Cloudflare.cloudflared"
    echo ""
    exit 1
fi

echo "✅ cloudflared found: $(cloudflared --version | head -1)"

# ── Step 2: Check local services ─────────────────────────────────────────────
echo ""
echo "🔍 Checking local services..."

PDS_OK=false
APPVIEW_OK=false

if curl -sf http://localhost:2583/xrpc/_health &>/dev/null; then
    echo "   ✅ PDS        → http://localhost:2583"
    PDS_OK=true
else
    echo "   ❌ PDS        → http://localhost:2583 (not reachable)"
fi

if curl -sf http://localhost:2584/xrpc/_health &>/dev/null; then
    echo "   ✅ AppView    → http://localhost:2584"
    APPVIEW_OK=true
else
    echo "   ❌ AppView    → http://localhost:2584 (not reachable)"
fi

if [ "$PDS_OK" = false ] && [ "$APPVIEW_OK" = false ]; then
    echo ""
    echo "⚠️  Neither PDS nor AppView are reachable on localhost."
    echo "   Make sure your Docker stack is running with ports exposed."
    echo ""
    echo "   For dev stack, expose ports in docker-compose.yaml:"
    echo "     pds:"
    echo "       ports:"
    echo "         - '2583:2583'"
    echo "     bsky:"
    echo "       ports:"
    echo "         - '2584:2584'"
    echo ""
    read -p "Press Enter to continue anyway, or Ctrl-C to abort..."
fi

# ── Step 3: Check / create tunnel ────────────────────────────────────────────
echo ""
echo "🔑 Checking Cloudflare tunnel..."

mkdir -p "$CONFIG_DIR"

TUNNEL_LIST=$(cloudflared tunnel list 2>/dev/null || true)

if echo "$TUNNEL_LIST" | grep -q "$TUNNEL_NAME"; then
    echo "✅ Tunnel '$TUNNEL_NAME' already exists."
    TUNNEL_ID=$(echo "$TUNNEL_LIST" | grep "$TUNNEL_NAME" | awk '{print $1}')
else
    echo ""
    echo "🆕 Creating new tunnel: $TUNNEL_NAME"
    echo "   This will open a browser for Cloudflare authentication..."
    echo ""
    cloudflared tunnel login
    cloudflared tunnel create "$TUNNEL_NAME"
    TUNNEL_LIST=$(cloudflared tunnel list)
    TUNNEL_ID=$(echo "$TUNNEL_LIST" | grep "$TUNNEL_NAME" | awk '{print $1}')
fi

echo "   Tunnel ID: $TUNNEL_ID"

# ── Step 4: Generate config ──────────────────────────────────────────────────
if [ -f "$CONFIG_FILE" ]; then
    echo ""
    echo "⚠️  Config already exists: $CONFIG_FILE"
    read -p "   Overwrite? [y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "   Skipping config generation."
        SKIP_CONFIG=true
    else
        SKIP_CONFIG=false
    fi
else
    SKIP_CONFIG=false
fi

if [ "$SKIP_CONFIG" != true ]; then
    cat > "$CONFIG_FILE" <<EOF
# Cloudflare Tunnel — PARA Local Test
tunnel: $TUNNEL_ID
credentials-file: $CONFIG_DIR/$TUNNEL_ID.json

ingress:
  - hostname: pds.$DOMAIN
    service: http://localhost:2583

  - hostname: appview.$DOMAIN
    service: http://localhost:2584

  - hostname: ozone.$DOMAIN
    service: http://localhost:3000

  - hostname: $DOMAIN
    service: http://localhost:2583

  - service: http_status:404
EOF
    echo ""
    echo "✅ Config written to: $CONFIG_FILE"
fi

# ── Step 5: DNS routes (cloudflared does this automatically) ─────────────────
echo ""
echo "🌐 Setting up DNS routes..."

for SUBDOMAIN in pds appview ozone ""; do
    HOST="${SUBDOMAIN:+$SUBDOMAIN.}$DOMAIN"
    # Delete existing route first (ignore errors)
    cloudflared tunnel route dns "$TUNNEL_NAME" "$HOST" 2>/dev/null || true
done

echo "   ✅ Routes configured:"
echo "      https://pds.$DOMAIN"
echo "      https://appview.$DOMAIN"
echo "      https://ozone.$DOMAIN"
echo "      https://$DOMAIN"

# ── Step 6: Start tunnel ─────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  🚀 Starting tunnel..."
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "   Your local stack is now accessible from the internet!"
echo ""
echo "   PDS:      https://pds.$DOMAIN"
echo "   AppView:  https://appview.$DOMAIN"
echo "   Root:     https://$DOMAIN"
echo ""
echo "   Press Ctrl-C to stop the tunnel."
echo ""

cloudflared tunnel run "$TUNNEL_NAME"
