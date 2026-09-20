#!/usr/bin/env bash
set -euo pipefail

# Pulls VPS Postgres backups to the Mac mini. This is intentionally pull-based:
# production does not need Mac mini credentials.

# 74.50.126.41 was the old VPS. It is unreachable and that deployment is gone,
# so there is no sensible default any more — require the host explicitly.
VPS_SSH="${VPS_SSH:?Set VPS_SSH=user@host for the server to pull backups from}"
REMOTE_BACKUP_DIR="${REMOTE_BACKUP_DIR:-/backups/para}"
LOCAL_BACKUP_DIR="${LOCAL_BACKUP_DIR:-/Users/mlv/Backups/para/vps-postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
MODE="pull"

usage() {
  cat <<EOF
Usage: $0 [--dry-run|--list]

Environment overrides:
  VPS_SSH=$VPS_SSH
  REMOTE_BACKUP_DIR=$REMOTE_BACKUP_DIR
  LOCAL_BACKUP_DIR=$LOCAL_BACKUP_DIR
  RETENTION_DAYS=$RETENTION_DAYS
EOF
}

for arg in "$@"; do
  case "$arg" in
    --dry-run)
      MODE="dry-run"
      ;;
    --list)
      MODE="list"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      usage >&2
      exit 1
      ;;
  esac
done

echo "═══════════════════════════════════════════════════════════════"
echo "  PARA VPS Backup Pull"
echo "═══════════════════════════════════════════════════════════════"
echo "VPS:       $VPS_SSH"
echo "Remote:    $REMOTE_BACKUP_DIR"
echo "Local:     $LOCAL_BACKUP_DIR"
echo "Retention: $RETENTION_DAYS days"
echo "Mode:      $MODE"
echo ""

if [ "$MODE" = "list" ]; then
  ssh "$VPS_SSH" "ls -lh ${REMOTE_BACKUP_DIR}/para_*.sql.gz 2>/dev/null || true"
  exit 0
fi

mkdir -p "$LOCAL_BACKUP_DIR"

RSYNC_ARGS=(-avz --partial --include='para_*.sql.gz' --exclude='*')
if [ "$MODE" = "dry-run" ]; then
  RSYNC_ARGS+=(--dry-run)
fi

rsync "${RSYNC_ARGS[@]}" "${VPS_SSH}:${REMOTE_BACKUP_DIR}/" "${LOCAL_BACKUP_DIR}/"

if [ "$MODE" = "dry-run" ]; then
  echo ""
  echo "Dry run complete. No local files were changed."
  exit 0
fi

echo ""
echo "Verifying pulled backups ..."
if ! find "$LOCAL_BACKUP_DIR" -maxdepth 1 -name 'para_*.sql.gz' -type f | grep -q .; then
  echo "No backups found in $LOCAL_BACKUP_DIR after pull." >&2
  exit 1
fi

latest="$(find "$LOCAL_BACKUP_DIR" -maxdepth 1 -name 'para_*.sql.gz' -type f | sort | tail -1)"
if ! gzip -t "$latest"; then
  echo "Latest backup failed gzip integrity check: $latest" >&2
  exit 1
fi

echo "Latest backup OK: $latest"

echo ""
echo "Pruning local backups older than $RETENTION_DAYS days ..."
find "$LOCAL_BACKUP_DIR" -maxdepth 1 -name 'para_*.sql.gz' -type f -mtime +"$RETENTION_DAYS" -print -delete

echo ""
echo "Local backup inventory:"
ls -lh "$LOCAL_BACKUP_DIR"/para_*.sql.gz
