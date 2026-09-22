#!/bin/bash
set -euo pipefail

# =============================================================================
# Generate SeaweedFS S3 Gateway Config from .env
# =============================================================================
# Reads PDS_BLOBSTORE_S3_* variables from the backend .env and writes an
# s3-config.json file that the SeaweedFS S3 gateway can consume.
#
# Usage:
#   ./infrascripts/generate-seaweedfs-s3-config.sh [output-path]
#
# Default output:
#   WatZappa/.seaweedfs/s3-config.json
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# These scripts live INSIDE the repo (infrascripts/), but were written for a
# layout where they sat beside it and `WatZappa` was a subdirectory. Resolve
# the repo root from the script's own location so they work from any cwd.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${BACKEND_DIR:-$REPO_ROOT}"
ENV_FILE="$BACKEND_DIR/.env"
OUTPUT_PATH="${1:-${BACKEND_DIR}/.seaweedfs/s3-config.json}"

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ .env file not found at $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a

BUCKET="${PDS_BLOBSTORE_S3_BUCKET:-blobs}"
ACCESS_KEY="${PDS_BLOBSTORE_S3_ACCESS_KEY_ID:-}"
SECRET_KEY="${PDS_BLOBSTORE_S3_SECRET_ACCESS_KEY:-}"

if [ -z "$ACCESS_KEY" ]; then
  echo "❌ PDS_BLOBSTORE_S3_ACCESS_KEY_ID is not set in $ENV_FILE" >&2
  exit 1
fi

if [ -z "$SECRET_KEY" ]; then
  echo "❌ PDS_BLOBSTORE_S3_SECRET_ACCESS_KEY is not set in $ENV_FILE" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUTPUT_PATH")"

cat > "$OUTPUT_PATH" <<EOF
{
  "identities": [
    {
      "name": "para-baremetal",
      "credentials": [
        {
          "accessKey": "${ACCESS_KEY}",
          "secretKey": "${SECRET_KEY}"
        }
      ],
      "actions": [
        "Read",
        "Write",
        "List",
        "Tagging",
        "Admin"
      ]
    }
  ],
  "buckets": [
    {
      "name": "${BUCKET}",
      "identity": "para-baremetal",
      "read": true,
      "write": true
    }
  ]
}
EOF

echo "✅ SeaweedFS S3 config written to $OUTPUT_PATH"
echo "   Bucket: $BUCKET"
