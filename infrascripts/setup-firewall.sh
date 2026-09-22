#!/bin/bash
set -euo pipefail

# PARA Server Firewall Setup
# =============================================================================
# Configures UFW (Uncomplicated Firewall) for a PARA production server.
# Blocks everything except SSH, HTTP, and HTTPS.
#
# WARNING: Run this script AFTER you have verified SSH access works.
# If you block SSH by mistake, you'll lock yourself out of the server.
#
# Usage:
#   sudo ./infrascripts/setup-firewall.sh
#
# For the 2-computer split, run this on BOTH Computer A and Computer B.
# Computer A (Edge) allows 80/443.
# Computer B (Compute) allows ONLY traffic from Computer A's IP.
# =============================================================================

echo "═══════════════════════════════════════════════════════════════"
echo "  PARA Firewall Setup (UFW)"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "❌ This script must be run as root or with sudo."
    echo "   Run: sudo $0"
    exit 1
fi

# Check if UFW is installed
if ! command -v ufw &> /dev/null; then
    echo "UFW not found. Installing..."
    apt-get update && apt-get install -y ufw
fi

# Show current status before changes
echo "Current UFW status:"
ufw status verbose || true
echo ""

# Ask for confirmation
echo "This will:"
echo "  - Deny ALL incoming traffic by default"
echo "  - Allow ALL outgoing traffic by default"
echo "  - Allow SSH (port 22)"
echo "  - Allow HTTP (port 80)"
echo "  - Allow HTTPS (port 443)"
echo ""
echo "Backend ports (2583, 2584, 3000, 5432, 6379) will be BLOCKED from the internet."
echo "They should only be accessible via the Docker internal network or VPN."
echo ""
read -p "Are you sure? Type 'yes' to continue: " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Aborted."
    exit 0
fi

# Reset to known state
echo "Resetting UFW to default state..."
ufw --force reset

# Default policies
ufw default deny incoming
ufw default allow outgoing

# Allow SSH (critical — don't lock yourself out!)
echo "Allowing SSH (port 22)..."
ufw allow 22/tcp comment 'SSH access'

# Allow HTTP and HTTPS (Caddy handles these)
echo "Allowing HTTP (port 80) and HTTPS (port 443)..."
ufw allow 80/tcp comment 'HTTP redirect to HTTPS'
ufw allow 443/tcp comment 'HTTPS via Caddy'

# If this is Computer B (Compute layer), optionally restrict to Computer A's IP
read -p "Is this Computer B (Compute/Storage layer)? If yes, enter Computer A's IP to whitelist: [no] " COMP_A_IP

if [ -n "$COMP_A_IP" ] && [ "$COMP_A_IP" != "no" ]; then
    echo "Restricting backend ports to Computer A ($COMP_A_IP)..."
    # Only Computer A can reach these ports
    ufw allow from "$COMP_A_IP" to any port 2583 proto tcp comment 'PDS from Computer A'
    ufw allow from "$COMP_A_IP" to any port 2584 proto tcp comment 'AppView from Computer A'
    ufw allow from "$COMP_A_IP" to any port 3000 proto tcp comment 'Ozone from Computer A'
    
    # Block these ports from everyone else (explicit deny for clarity)
    ufw deny 2583/tcp comment 'PDS — blocked from public'
    ufw deny 2584/tcp comment 'AppView — blocked from public'
    ufw deny 3000/tcp comment 'Ozone — blocked from public'
    ufw deny 5432/tcp comment 'Postgres — blocked from public'
    ufw deny 6379/tcp comment 'Redis — blocked from public'
else
    echo "This is Computer A (Edge layer). Backend ports are handled by Docker networking."
    # On Computer A, backend services run in Docker with no host port exposure.
    # The only exposed ports are 80 and 443 (Caddy).
fi

# Enable UFW
echo ""
echo "Enabling UFW..."
ufw --force enable

# Show final status
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Firewall configuration complete!"
echo "═══════════════════════════════════════════════════════════════"
echo ""
ufw status verbose

echo ""
echo "Next steps:"
echo "  1. Verify you can still SSH into this server."
echo "  2. Verify Caddy responds on port 443."
echo "  3. If using Computer B, verify WireGuard/Tailscale tunnel works."
echo ""
echo "To check blocked connection attempts:"
echo "  sudo tail -f /var/log/ufw.log"
echo ""
