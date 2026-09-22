#!/bin/bash
set -euo pipefail

# PARA Production Secret Generator
# Usage: ./infrainfrascripts/generate-secrets.sh > .env
#
# Generates cryptographically secure secrets for all backend services.
# Pipe output to .env, then edit domain names and admin passwords.

if ! command -v openssl &> /dev/null; then
    echo "❌ openssl is required. Install it first."
    exit 1
fi

cat <<EOF
# PARA Production Environment
# GENERATED: $(date -u +%Y-%m-%dT%H:%M:%SZ)
# DO NOT COMMIT THIS FILE — it contains real secrets.

# =============================================================================
# INFRASTRUCTURE
# =============================================================================
POSTGRES_USER=pg
POSTGRES_PASSWORD=$(openssl rand -hex 32)
POSTGRES_DB=para

# =============================================================================
# PDS (Personal Data Server)
# =============================================================================
PDS_HOSTNAME=pds.para.social
PDS_PORT=2583
# Blob storage (Cloudflare R2)
PDS_BLOBSTORE_S3_BUCKET=para-production
PDS_BLOBSTORE_S3_REGION=auto
PDS_BLOBSTORE_S3_ENDPOINT=https://1602cb19f70d915d7bc4216d52a86cae.r2.cloudflarestorage.com
PDS_BLOBSTORE_S3_ACCESS_KEY_ID=<set-your-r2-access-key-id>
PDS_BLOBSTORE_S3_SECRET_ACCESS_KEY=<set-your-r2-secret-access-key>
PDS_BLOBSTORE_S3_FORCE_PATH_STYLE=true

# Signing keys — rotate these quarterly
PDS_REPO_SIGNING_KEY_K256_PRIVATE_KEY_HEX=$(openssl rand -hex 32)
PDS_PLC_ROTATION_KEY_K256_PRIVATE_KEY_HEX=$(openssl rand -hex 32)

# Secrets
PDS_DPOP_SECRET=$(openssl rand -hex 32)
PDS_JWT_SECRET=$(openssl rand -hex 32)
PDS_ADMIN_PASSWORD=$(openssl rand -hex 32)
PDS_RATE_LIMIT_BYPASS_KEY=$(openssl rand -hex 32)

# AppView signing key — required by bsky/api.js
BSKY_SERVICE_SIGNING_KEY=$(openssl rand -hex 32)

# External services
PDS_DID_PLC_URL=https://plc.directory
PDS_BSKY_APP_VIEW_URL=https://appview.para.social
PDS_BSKY_APP_VIEW_DID=did:web:appview.para.social
PDS_CRAWLERS=https://bsky.network

# OAuth branding
PDS_OAUTH_PROVIDER_NAME="PARA"
PDS_OAUTH_PROVIDER_PRIMARY_COLOR="#48267F"
PDS_OAUTH_PROVIDER_HOME_LINK=https://para.social
PDS_OAUTH_PROVIDER_TOS_LINK=https://para.social/tos
PDS_OAUTH_PROVIDER_POLICY_LINK=https://para.social/privacy

# Registration
PDS_INVITE_REQUIRED=1

# =============================================================================
# AppView (bsky)
# =============================================================================
BSKY_SERVER_DID=did:web:appview.para.social
BSKY_SERVICE_SIGNING_KEY=$BSKY_SERVICE_SIGNING_KEY
ADMIN_PASSWORDS=$(openssl rand -hex 32)
ADMIN_DIDS=<will-be-known-after-first-account-creation>

DATAPLANE_URLS=http://dataplane:2585
BSYNC_URL=http://bsync:2586

# =============================================================================
# Ozone (Moderation)
# =============================================================================
OZONE_SERVER_DID=did:web:ozone.para.social
OZONE_ADMIN_DIDS=<will-be-known-after-first-account-creation>

# =============================================================================
# bsync
# =============================================================================
BSYNC_SERVER_DID=did:web:bsync.para.social
BSYNC_DB_POOL_SIZE=10
BSYNC_DB_POOL_MAX_USES=100
BSYNC_DB_POOL_IDLE_TIMEOUT_MS=30000

# =============================================================================
# Ozone
# =============================================================================
OZONE_DB_POOL_SIZE=10
OZONE_DB_POOL_MAX_USES=100
OZONE_DB_POOL_IDLE_TIMEOUT_MS=30000

# =============================================================================
# R2 Blobstore
# =============================================================================
R2_ACCESS_KEY_ID=<set-your-r2-access-key-id>
R2_SECRET_ACCESS_KEY=<set-your-r2-secret-access-key>
R2_ENDPOINT=https://1602cb19f70d915d7bc4216d52a86cae.r2.cloudflarestorage.com
R2_BUCKET=para-production
EOF

echo >&2 ""
echo >&2 "✅ Secrets generated."
echo >&2 "   Next steps:"
echo >&2 "   1. Review the output above"
echo >&2 "   2. Replace <set-your-own-strong-password> with a real admin password"
echo >&2 "   3. Save to .env"
echo >&2 "   4. Run: ./infrascripts/deploy-production.sh user@your-server-ip"
