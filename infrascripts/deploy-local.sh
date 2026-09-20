#!/bin/bash
set -euo pipefail

# PARA Bare-Metal Deploy Script
# For the 5950X + 128GB machine. Zero cloud. Full privacy.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REMOTE_DIR="/opt/para"
# These scripts live INSIDE the repo (infrascripts/), but were written for a
# layout where they sat beside it and `WatZappa` was a subdirectory. Resolve
# the repo root from the script's own location so they work from any cwd.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${BACKEND_DIR:-$REPO_ROOT}"
COMPOSE_FILE="$BACKEND_DIR/docker-compose.local.yaml"
ENV_FILE="$BACKEND_DIR/.env"
NGINX_CONF="$BACKEND_DIR/services/nginx/nginx.local.conf"

echo "═══════════════════════════════════════════════════════════════"
echo "  PARA Bare-Metal Deploy"
echo "  Target: localhost (5950X + 128GB)"
echo "═══════════════════════════════════════════════════════════════"

# Validate
if [ ! -f "$ENV_FILE" ]; then
    echo "❌ $ENV_FILE not found. Run ./infrascripts/generate-local-env.sh first."
    exit 1
fi

if grep -q "changeme\|YOUR_API_KEY\|example.com\|<set-your-own>" "$ENV_FILE"; then
    echo "⚠️  WARNING: $ENV_FILE still contains placeholder values."
    read -p "   Press Enter to continue anyway, or Ctrl-C to abort..."
fi

# System tune check
if [ ! -f "/etc/security/limits.d/para.conf" ]; then
    echo "⚠️  System not tuned yet. Run ./infrascripts/bare-metal/system-tune.sh first."
    echo "   Or continue at your own risk..."
    read -p "   Press Enter to continue..."
fi

# Generate SeaweedFS S3 config from .env credentials
echo ""
echo "🔐 Generating SeaweedFS S3 gateway config..."
"${SCRIPT_DIR}/generate-seaweedfs-s3-config.sh"

# Source .env so init-bucket.sh can use the same credentials
set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a

# Build
echo ""
echo "🔨 Building Docker images..."
pushd "$BACKEND_DIR" > /dev/null
docker compose -f docker-compose.local.yaml build
popd > /dev/null

# Deploy
echo ""
echo "🚀 Starting stack..."
docker compose -f "$COMPOSE_FILE" up -d --remove-orphans

# Scale replicas
echo ""
echo "📈 Scaling replicas..."
docker compose -f "$COMPOSE_FILE" up -d --scale pds=4 --scale bsky=4

# Initialize SeaweedFS S3 bucket
echo ""
echo "🪣 Initializing SeaweedFS S3 bucket..."
SEAWEEDFS_ACCESS_KEY="${PDS_BLOBSTORE_S3_ACCESS_KEY_ID:-weed}" \
SEAWEEDFS_SECRET_KEY="${PDS_BLOBSTORE_S3_SECRET_ACCESS_KEY:-weed_secret}" \
SEAWEEDFS_BUCKET="${PDS_BLOBSTORE_S3_BUCKET:-blobs}" \
SEAWEEDFS_REGION="${PDS_BLOBSTORE_S3_REGION:-us-east-1}" \
SEAWEEDFS_S3_ENDPOINT="http://localhost:8333" \
  "${SCRIPT_DIR}/../PARA/dev-env/seaweedfs/init-bucket.sh"

# Health checks
echo ""
echo "🏥 Health checks (waiting 10s for services to warm up)..."
sleep 10

HEALTH_PDS=$(curl -sf http://localhost:2583/xrpc/_health && echo OK || echo FAIL)
HEALTH_BSKY=$(curl -sf http://localhost:2584/xrpc/_health && echo OK || echo FAIL)
HEALTH_READY=$(curl -sf http://localhost:2583/xrpc/_ready && echo OK || echo FAIL)
HEALTH_SEAWEED_S3=$(curl -sf http://localhost:8333/ > /dev/null && echo OK || echo FAIL)

echo "   PDS health:      $HEALTH_PDS"
echo "   AppView health:  $HEALTH_BSKY"
echo "   PDS ready:       $HEALTH_READY"
echo "   SeaweedFS S3:    $HEALTH_SEAWEED_S3"

if [ "$HEALTH_PDS" = "OK" ] && [ "$HEALTH_BSKY" = "OK" ] && [ "$HEALTH_SEAWEED_S3" = "OK" ]; then
    echo ""
    echo "✅ Deploy successful!"
    echo ""
    echo "   PDS:       http://localhost:2583"
    echo "   AppView:   http://localhost:2584"
    echo "   Analytics: http://localhost:3001 (Umami)"
    echo "   Ozone:     http://localhost:3000"
    echo "   SeaweedFS: http://localhost:9333 (master)"
    echo "              http://localhost:8888 (filer)"
    echo "              http://localhost:8333 (S3 gateway)"
    echo ""
    echo "   Logs: docker compose -f $COMPOSE_FILE logs -f"
    echo "   Scale: docker compose -f $COMPOSE_FILE up -d --scale pds=8 --scale bsky=8"
    exit 0
else
    echo ""
    echo "❌ Health checks failed."
    echo "   Logs: docker compose -f $COMPOSE_FILE logs"
    exit 1
fi
