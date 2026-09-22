#!/bin/bash
set -euo pipefail

# PARA PostgreSQL Backup Script
# =============================================================================
# Creates compressed, timestamped backups of the Postgres database.
# Designed to run via cron daily.
#
# Usage:
#   ./infrascripts/backup-postgres.sh [backup-dir]
#
# Example cron (daily at 3am):
#   0 3 * * * cd /opt/para && ./infrascripts/backup-postgres.sh /backups/para >> /var/log/para-backup.log 2>&1
#
# Retention: Keeps 7 daily backups by default. Adjust RETENTION_DAYS below.
# =============================================================================

BACKUP_DIR="${1:-/backups/para}"
CONTAINER_NAME="${CONTAINER_NAME:-para-postgres}"
DB_NAME="${DB_NAME:-para}"
DB_USER="${DB_USER:-pg}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"

TIMESTAMP=$(date -u +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/para_${TIMESTAMP}.sql.gz"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

error() {
    echo -e "${RED}❌ $1${NC}" >&2
    exit 1
}

info() {
    echo -e "${GREEN}ℹ️  $1${NC}"
}

warn() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Check if container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    error "Postgres container '$CONTAINER_NAME' is not running."
fi

# Check disk space (warn if < 10GB free)
FREE_GB=$(df -BG "$BACKUP_DIR" | awk 'NR==2 {print $4}' | sed 's/G//')
if [ "$FREE_GB" -lt 10 ]; then
    warn "Low disk space: ${FREE_GB}GB free on backup volume."
fi

# Run backup
info "Starting backup: $BACKUP_FILE"
START_TIME=$(date +%s)

docker exec "$CONTAINER_NAME" pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner --no-acl | gzip > "$BACKUP_FILE"

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
FILE_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)

info "Backup complete in ${DURATION}s — Size: $FILE_SIZE"

# Verify backup integrity (decompress header and check for "PostgreSQL")
if ! zcat "$BACKUP_FILE" | head -1 | grep -q "PostgreSQL"; then
    error "Backup file appears corrupted (no PostgreSQL header detected)."
fi

# Clean up old backups
info "Cleaning up backups older than $RETENTION_DAYS days..."
DELETED=$(find "$BACKUP_DIR" -name "para_*.sql.gz" -mtime +$RETENTION_DAYS -delete -print | wc -l)
info "Deleted $DELETED old backup(s)."

# List remaining backups
echo ""
echo "Current backups in $BACKUP_DIR:"
ls -lh "$BACKUP_DIR"/para_*.sql.gz 2>/dev/null || echo "  (none)"
echo ""
info "Backup finished successfully."
