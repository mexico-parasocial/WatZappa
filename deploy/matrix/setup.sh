#!/bin/bash
set -euo pipefail

# PARA Matrix Homeserver Setup
# Run once to generate Synapse config and prepare the stack.
#
# Usage:
#   ./WhatZatppa/deploy/matrix/setup.sh
#
# Prerequisites:
#   - Docker and docker compose installed
#   - .env file created from .env.example with MATRIX_* vars filled
#   - DNS A record pointing MATRIX_DOMAIN to this server

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MATRIX_COMPOSE="${SCRIPT_DIR}/../../docker-compose.matrix.yaml"
ENV_FILE="${SCRIPT_DIR}/../../.env"

echo "═══════════════════════════════════════════════════════════════"
echo "  PARA Matrix Homeserver Setup"
echo "═══════════════════════════════════════════════════════════════"

# Validate env file
if [ ! -f "$ENV_FILE" ]; then
    echo "❌ $ENV_FILE not found. Create it from .env.example first."
    exit 1
fi

# Load only MATRIX_* vars
export $(grep -E '^MATRIX_' "$ENV_FILE" | xargs) || true
export $(grep -E '^POSTGRES_' "$ENV_FILE" | xargs) || true

MATRIX_SERVER_NAME="${MATRIX_SERVER_NAME:-matrix.para.social}"
MATRIX_DOMAIN="${MATRIX_DOMAIN:-chat.para.social}"
POSTGRES_USER="${POSTGRES_USER:-pg}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-changeme}"

echo ""
echo "📋 Configuration:"
echo "   Server Name:  $MATRIX_SERVER_NAME"
echo "   Element URL:  https://$MATRIX_DOMAIN"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# 1. Generate Synapse config (one-time)
# ─────────────────────────────────────────────────────────────────────────────
if [ ! -d "${SCRIPT_DIR}/synapse" ]; then
    echo "🔧 Generating Synapse configuration..."
    mkdir -p "${SCRIPT_DIR}/synapse"

    docker run --rm \
        -e SYNAPSE_SERVER_NAME="$MATRIX_SERVER_NAME" \
        -e SYNAPSE_REPORT_STATS=no \
        -e SYNAPSE_CONFIG_DIR=/data \
        -e SYNAPSE_DATA_DIR=/data \
        -v "${SCRIPT_DIR}/synapse:/data" \
        matrixdotorg/synapse:v1.127.1 generate

    # Tune the generated config for PARA's bare-metal setup
    SYNAPSE_CFG="${SCRIPT_DIR}/synapse/homeserver.yaml"

    # Disable open registration (invite-only via bridge admin API)
    sed -i 's/enable_registration: true/enable_registration: false/' "$SYNAPSE_CFG" || true

    # Disable federation — PARA-only mode for security
    if ! grep -q "federation_domain_whitelist:" "$SYNAPSE_CFG"; then
        echo "" >> "$SYNAPSE_CFG"
        echo "# PARA security: disable federation entirely" >> "$SYNAPSE_CFG"
        echo "federation_domain_whitelist: []" >> "$SYNAPSE_CFG"
    fi

    # Disable public room directory publishing
    if ! grep -q "allow_public_rooms_over_federation:" "$SYNAPSE_CFG"; then
        echo "allow_public_rooms_over_federation: false" >> "$SYNAPSE_CFG"
    fi
    if ! grep -q "allow_public_rooms_without_auth:" "$SYNAPSE_CFG"; then
        echo "allow_public_rooms_without_auth: false" >> "$SYNAPSE_CFG"
    fi

    # Bind to all interfaces inside the container
    sed -i 's/bind_addresses: \['"'"'::1'"'"', \['"'"'127.0.0.1'"'"'\]/bind_addresses: ['"'"'0.0.0.0'"'"']/' "$SYNAPSE_CFG" || true

    # Use existing Redis if available (optional perf boost)
    if grep -q "REDIS_HOST" "$ENV_FILE" 2>/dev/null; then
        REDIS_HOST=$(grep REDIS_HOST "$ENV_FILE" | cut -d= -f2 | cut -d: -f1)
        echo "redis:" >> "$SYNAPSE_CFG"
        echo "  enabled: true" >> "$SYNAPSE_CFG"
        echo "  host: $REDIS_HOST" >> "$SYNAPSE_CFG"
        echo "  port: 6379" >> "$SYNAPSE_CFG"
    fi

    echo "✅ Synapse config generated at ${SCRIPT_DIR}/synapse/"
else
    echo "⚠️  Synapse config already exists. Skipping generation."
    echo "   Delete ${SCRIPT_DIR}/synapse/ to regenerate."
fi

# ─────────────────────────────────────────────────────────────────────────────
# 2. Generate Element Web config
# ─────────────────────────────────────────────────────────────────────────────
ELEMENT_CFG="${SCRIPT_DIR}/element-config.json"

cat > "$ELEMENT_CFG" <<EOF
{
    "default_server_config": {
        "m.homeserver": {
            "base_url": "https://${MATRIX_SERVER_NAME}",
            "server_name": "${MATRIX_SERVER_NAME}"
        }
    },
    "brand": "PARA Chat",
    "room_directory": {
        "servers": ["${MATRIX_SERVER_NAME}"]
    },
    "disable_custom_urls": true,
    "disable_guests": true,
    "disable_login_language_selector": false,
    "disable_3pid_login": true,
    "features": {
        "feature_threadenabled": true,
        "feature_roomlist_video_layout": false
    },
    "setting_defaults": {
        "breadcrumbs": true,
        "show_labs_settings": false
    },
    "integrations_ui_url": "",
    "integrations_rest_url": "",
    "integrations_widgets_urls": [],
    "embedded_pages": {
        "home_url": ""
    },
    "terms_and_conditions_links": [
        {
            "url": "https://para.social/tos",
            "text": "Terms of Service"
        },
        {
            "url": "https://para.social/privacy",
            "text": "Privacy Policy"
        }
    ]
}
EOF

echo "✅ Element config generated at $ELEMENT_CFG"

# ─────────────────────────────────────────────────────────────────────────────
# 3. Print federation well-known snippets
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "📡 Federation Setup Required"
echo "───────────────────────────────────────────────────────────────"
echo ""
echo "Create these files on your web server at the DOMAIN root"
echo "(e.g., served by Caddy/nginx at https://$MATRIX_SERVER_NAME):"
echo ""
echo "--- .well-known/matrix/server ---"
cat <<FED
{ "m.server": "${MATRIX_SERVER_NAME}:443" }
FED
echo ""
echo "--- .well-known/matrix/client ---"
cat <<FED
{ "m.homeserver": { "base_url": "https://${MATRIX_SERVER_NAME}" } }
FED
echo ""
echo "If $MATRIX_SERVER_NAME is the SAME host as the Synapse container,"
echo "Caddy/nginx can serve these as static files."
echo "See deploy/matrix/Caddyfile.matrix for the reverse-proxy block."
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# 4. Print next steps
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "🚀 Next steps:"
echo ""
echo "   1. Add Caddy/nginx config from deploy/matrix/Caddyfile.matrix"
echo "   2. Start the stack:"
echo "      docker compose -f WhatZatppa/docker-compose.matrix.yaml up -d"
echo "   3. Create an admin user:"
echo "      docker exec -it para-matrix-synapse register_new_matrix_user"
echo "         -c /data/homeserver.yaml http://localhost:8008"
echo "   4. Open https://$MATRIX_DOMAIN in a browser"
echo ""
echo "✅ Setup complete."
