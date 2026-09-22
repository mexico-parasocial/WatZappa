#!/bin/bash
set -euo pipefail

# PARA Local Bare-Metal Environment Generator
# For AMD Ryzen 9 5950X + 128GB RAM — zero cloud, full privacy
# Usage: ./infrascripts/generate-local-env.sh > .env

if ! command -v openssl &> /dev/null; then
    echo "❌ openssl is required"
    exit 1
fi

cat <<EOF
# PARA Local Production Environment
# GENERATED: $(date -u +%Y-%m-%dT%H:%M:%SZ)
# RUNTIME: Bare metal — AMD Ryzen 9 5950X, 128GB RAM
# PRIVACY: Zero third-party services. All data stays local.

# =============================================================================
# INFRASTRUCTURE (local Docker Compose)
# =============================================================================
POSTGRES_USER=pg
POSTGRES_PASSWORD=$(openssl rand -hex 32)
POSTGRES_DB=para

# =============================================================================
# PDS (Personal Data Server)
# =============================================================================
PDS_HOSTNAME=localhost
PDS_PORT=2583

PDS_DB_POSTGRES_URL='postgres://pg:changeme@postgres:5432/para'

# Blob storage – local SeaweedFS S3 gateway (zero cloud)
PDS_BLOBSTORE_S3_BUCKET=blobs
PDS_BLOBSTORE_S3_REGION=us-east-1
PDS_BLOBSTORE_S3_ENDPOINT=http://seaweed-s3:8333
PDS_BLOBSTORE_S3_ACCESS_KEY_ID=weed
PDS_BLOBSTORE_S3_SECRET_ACCESS_KEY=weed_secret
PDS_BLOBSTORE_S3_FORCE_PATH_STYLE=true

# Signing keys
PDS_REPO_SIGNING_KEY_K256_PRIVATE_KEY_HEX=$(openssl rand -hex 32)
PDS_PLC_ROTATION_KEY_K256_PRIVATE_KEY_HEX=$(openssl rand -hex 32)

# Secrets
PDS_DPOP_SECRET=$(openssl rand -hex 32)
PDS_JWT_SECRET=$(openssl rand -hex 32)
PDS_ADMIN_PASSWORD=$(openssl rand -hex 16)
PDS_RATE_LIMIT_BYPASS_KEY=$(openssl rand -hex 32)

# Local mesh (no ngrok, no cloud)
PDS_DID_PLC_URL=https://plc.directory
PDS_BSKY_APP_VIEW_URL=http://localhost:2584
PDS_BSKY_APP_VIEW_DID=did:web:localhost
PDS_CRAWLERS=https://bsky.network

# OAuth branding
PDS_OAUTH_PROVIDER_NAME="PARA"
PDS_OAUTH_PROVIDER_PRIMARY_COLOR="#48267F"
PDS_OAUTH_PROVIDER_HOME_LINK=https://localhost
PDS_OAUTH_PROVIDER_TOS_LINK=https://localhost/tos
PDS_OAUTH_PROVIDER_POLICY_LINK=https://localhost/privacy

# Registration (open for launch — your associate's 1M subscribers)
PDS_INVITE_REQUIRED=0

# =============================================================================
# AppView (bsky)
# =============================================================================
BSKY_SERVER_DID=did:web:localhost
BSKY_SERVICE_SIGNING_KEY=$(openssl rand -hex 32)
ADMIN_PASSWORDS='<set-your-own>'
ADMIN_DIDS='<will-be-known-after-first-account>'

DATAPLANE_URLS=http://dataplane:2585
BSYNC_URL=http://bsync:2586

# Redis (local, no cloud)
BSKY_REDIS_HOST=redis
BSKY_REDIS_PASSWORD=$(openssl rand -hex 16)

# =============================================================================
# Ozone (Moderation)
# =============================================================================
OZONE_SERVER_DID=did:web:localhost
OZONE_ADMIN_DIDS='<will-be-known-after-first-account>'

# =============================================================================
# bsync
# =============================================================================
BSYNC_SERVER_DID=did:web:localhost

# =============================================================================
# PARA Frontend (local builds)
# =============================================================================
EXPO_PUBLIC_ENV=production
EXPO_PUBLIC_DEFAULT_SERVICE=http://localhost:2583
EXPO_PUBLIC_RELEASE_VERSION=1.0.0

# No Sentry. No Google Maps. No third-party analytics.
# Analytics = self-hosted Umami on same machine.
EOF

echo >&2 ""
echo >&2 "✅ Local secrets generated."
echo >&2 "   Next:"
echo >&2 "   1. Set ADMIN_PASSWORDS to something memorable"
echo >&2 "   2. Save to .env"
echo >&2 "   3. Run: ./infrascripts/deploy-local.sh"
