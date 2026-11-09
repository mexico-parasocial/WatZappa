#!/usr/bin/env bash
# Nightly Matrix restore unit: backup.sh, age encryption, S3 upload, freshness
# metric. Scheduled by ansible/roles/matrix_stack (para-matrix-backup.timer).
#
# Environment (from /etc/para/matrix-backup.env when run by systemd):
#   MATRIX_BACKUP_DIR              local directory for encrypted archives
#   MATRIX_BACKUP_AGE_RECIPIENTS   file of age public keys (one per line)
#   MATRIX_BACKUP_S3_ENDPOINT      S3-compatible endpoint URL
#   MATRIX_BACKUP_S3_BUCKET        bucket; objects go under matrix/
#   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_DEFAULT_REGION
#   MATRIX_BACKUP_RETENTION_DAYS   local encrypted copies kept (default 7)
#   MATRIX_BACKUP_TEXTFILE_DIR     node-exporter textfile directory (optional)
#
# The plaintext archive (server keys, MAS secrets, .env) exists only until it
# is encrypted; nothing unencrypted leaves the host. Success, and the freshness
# metric, mean the encrypted object is in the bucket at the expected size.
set -euo pipefail
umask 077
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/docker-compose.matrix.yaml"
BACKUP_DIR="${MATRIX_BACKUP_DIR:?Set MATRIX_BACKUP_DIR}"
RECIPIENTS="${MATRIX_BACKUP_AGE_RECIPIENTS:?Set MATRIX_BACKUP_AGE_RECIPIENTS}"
S3_ENDPOINT="${MATRIX_BACKUP_S3_ENDPOINT:?Set MATRIX_BACKUP_S3_ENDPOINT}"
S3_BUCKET="${MATRIX_BACKUP_S3_BUCKET:?Set MATRIX_BACKUP_S3_BUCKET}"
RETENTION_DAYS="${MATRIX_BACKUP_RETENTION_DAYS:-7}"

log() { echo "[$(date -Is)] $*"; }
command -v age >/dev/null || { log 'age is not installed'; exit 2; }
command -v aws >/dev/null || { log 'aws CLI is not installed'; exit 2; }
grep -q '^age1' "$RECIPIENTS" || { log "No age recipient in $RECIPIENTS"; exit 2; }

# The compose project and the bridge's database come from the running
# containers, so the job follows whatever this checkout actually deployed.
SYNAPSE_ID="$(docker compose -f "$COMPOSE_FILE" ps -q synapse)"
BRIDGE_ID="$(docker compose -f "$COMPOSE_FILE" ps -q matrix-bridge)"
[[ -n "$SYNAPSE_ID" && -n "$BRIDGE_ID" ]] || { log 'Synapse and matrix-bridge must be running'; exit 2; }
PROJECT="$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$SYNAPSE_ID")"
BRIDGE_DATA="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/app/data"}}{{.Source}}{{end}}{{end}}' "$BRIDGE_ID")"
[[ -n "$BRIDGE_DATA" && -f "$BRIDGE_DATA/bridge.db" ]] || { log 'Bridge database not found in its /app/data mount'; exit 2; }

mkdir -p "$BACKUP_DIR"
OUT="$(BRIDGE_DB_PATH="$BRIDGE_DATA/bridge.db" MATRIX_COMPOSE_PROJECT="$PROJECT" \
  bash "$SCRIPT_DIR/backup.sh" "$BACKUP_DIR")"
echo "$OUT"
ARCHIVE="$(sed -n 's/^Backup created: //p' <<<"$OUT")"
[[ -f "$ARCHIVE" ]] || { log 'backup.sh did not report an archive'; exit 1; }

ENCRYPTED="$ARCHIVE.age"
trap 'rm -f "$ARCHIVE" "$ENCRYPTED.partial"' EXIT
age -R "$RECIPIENTS" -o "$ENCRYPTED.partial" "$ARCHIVE"
[[ "$(head -c 21 "$ENCRYPTED.partial")" == 'age-encryption.org/v1' ]] || { log 'Encryption output is not an age file'; exit 1; }
mv "$ENCRYPTED.partial" "$ENCRYPTED"
rm -f "$ARCHIVE"
log "Encrypted: $ENCRYPTED"

KEY="matrix/$(basename "$ENCRYPTED")"
aws s3 cp "$ENCRYPTED" "s3://$S3_BUCKET/$KEY" --endpoint-url "$S3_ENDPOINT" --only-show-errors
REMOTE_SIZE="$(aws s3api head-object --bucket "$S3_BUCKET" --key "$KEY" \
  --endpoint-url "$S3_ENDPOINT" --query ContentLength --output text)"
LOCAL_SIZE="$(wc -c <"$ENCRYPTED" | tr -d ' ')"
[[ "$REMOTE_SIZE" == "$LOCAL_SIZE" ]] || { log "Uploaded size $REMOTE_SIZE != local $LOCAL_SIZE"; exit 1; }
log "Uploaded: s3://$S3_BUCKET/$KEY ($LOCAL_SIZE bytes)"

if [[ -n "${MATRIX_BACKUP_TEXTFILE_DIR:-}" ]]; then
  mkdir -p "$MATRIX_BACKUP_TEXTFILE_DIR"
  PROM="$MATRIX_BACKUP_TEXTFILE_DIR/para_matrix_backup.prom"
  {
    echo '# HELP para_matrix_backup_last_success_timestamp_seconds Last encrypted Matrix backup confirmed in off-host storage.'
    echo '# TYPE para_matrix_backup_last_success_timestamp_seconds gauge'
    echo "para_matrix_backup_last_success_timestamp_seconds $(date +%s)"
    echo '# TYPE para_matrix_backup_last_size_bytes gauge'
    echo "para_matrix_backup_last_size_bytes $LOCAL_SIZE"
  } >"$PROM.tmp"
  chmod 644 "$PROM.tmp"
  mv "$PROM.tmp" "$PROM"
fi

# Local retention only; bucket lifecycle rules govern the off-host copies.
find "$BACKUP_DIR" -maxdepth 1 -name 'para-matrix-*.tar.gz.age' -mtime "+$RETENTION_DAYS" -delete
log 'Matrix backup complete'
