#!/bin/bash
# alpha-doctor.sh — Health checks for the 300-user alpha launch
# Run this on the production server every 6 hours or before expanding states

set -e

ACCOUNT_DB="${ACCOUNT_DB:-/data/account-manager.sqlite}"
PDS_HOST="${PDS_HOST:-https://localhost}"
REDIS_HOST="${REDIS_HOST:-localhost}"
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
# These scripts live INSIDE the repo (infrascripts/), but were written for a
# layout where they sat beside it and `WatZappa` was a subdirectory. Resolve
# the repo root from the script's own location so they work from any cwd.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${BACKEND_DIR:-$REPO_ROOT}"

echo "========================================"
echo "  PARA Alpha Doctor — $(date)"
echo "========================================"
echo

# 1. Alpha quotas
echo "📊 ALPHA QUOTAS"
echo "----------------"
if [ -f "$ACCOUNT_DB" ]; then
  sqlite3 "$ACCOUNT_DB" <<EOF
SELECT
  state,
  totalSlots,
  usedSlots,
  totalSlots - usedSlots AS remaining,
  CASE isOpen WHEN 1 THEN 'OPEN' ELSE 'CLOSED' END AS status
FROM alpha_rollout
WHERE state != 'FRIEND'
ORDER BY usedSlots DESC;
EOF
  echo
  echo "🎟️  FRIEND POOL:"
  sqlite3 "$ACCOUNT_DB" "SELECT totalSlots, usedSlots, totalSlots - usedSlots AS remaining FROM alpha_rollout WHERE state = 'FRIEND';"
else
  echo "⚠️  Account DB not found at $ACCOUNT_DB"
fi
echo

# 2. Waitlist
echo "⏳ WAITLIST (pending requests)"
echo "------------------------------"
if [ -f "$ACCOUNT_DB" ]; then
  sqlite3 "$ACCOUNT_DB" <<EOF
SELECT state, COUNT(*) AS waitlist_count
FROM alpha_access_request
WHERE status = 'pending'
GROUP BY state
ORDER BY waitlist_count DESC;
EOF
  TOTAL_WAITLIST=$(sqlite3 "$ACCOUNT_DB" "SELECT COUNT(*) FROM alpha_access_request WHERE status = 'pending';" 2>/dev/null || echo "0")
  echo "Total waitlisted: $TOTAL_WAITLIST"
else
  echo "N/A"
fi
echo

# 3. Invite codes
echo "🎟️  INVITE CODES"
echo "----------------"
if [ -f "$ACCOUNT_DB" ]; then
  sqlite3 "$ACCOUNT_DB" <<EOF
SELECT
  state,
  COUNT(*) FILTER (WHERE usedAt IS NULL) AS unused,
  COUNT(*) FILTER (WHERE usedAt IS NOT NULL) AS used
FROM alpha_invite
GROUP BY state
ORDER BY unused DESC;
EOF
else
  echo "N/A"
fi
echo

# 4. Disk usage
echo "💾 DISK USAGE"
echo "-------------"
df -h / | tail -1 | awk '{print "Root: " $5 " used (" $3 "/" $2 ")"}'
if [ -f "$ACCOUNT_DB" ]; then
  DB_SIZE=$(du -h "$ACCOUNT_DB" | cut -f1)
  echo "Account DB: $DB_SIZE"
fi
echo

# 5. Docker health
echo "🐳 DOCKER SERVICES"
echo "------------------"
docker compose -f "$BACKEND_DIR/docker-compose.prod.yaml" ps --format "table {{.Name}}\t{{.Status}}\t{{.State}}" 2>/dev/null || docker ps --format "table {{.Names}}\t{{.Status}}" | tail -n +2
echo

# 6. PDS health endpoint
echo "🏥 PDS HEALTH"
echo "-------------"
curl -sf "$PDS_HOST/xrpc/_health" 2>/dev/null | jq -c . 2>/dev/null || echo "⚠️  PDS health check failed"
echo

# 7. Postgres connections
echo "🐘 POSTGRES CONNECTIONS"
echo "-----------------------"
PG_ACTIVE=$(docker exec para-postgres psql -U para -t -c "SELECT count(*) FROM pg_stat_activity WHERE state = 'active';" 2>/dev/null | xargs || echo "?")
PG_TOTAL=$(docker exec para-postgres psql -U para -t -c "SELECT count(*) FROM pg_stat_activity;" 2>/dev/null | xargs || echo "?")
echo "Active: $PG_ACTIVE / Total: $PG_TOTAL / Max: 200"
if [ "$PG_TOTAL" -gt 150 ] 2>/dev/null; then
  echo "🔴 WARNING: Postgres connections > 150"
fi
echo

# 8. Redis memory
echo "🔴 REDIS MEMORY"
echo "---------------"
REDIS_USED=$(docker exec para-redis redis-cli INFO memory | grep used_memory_human | cut -d: -f2 | tr -d '\r' 2>/dev/null || echo "?")
REDIS_MAX=$(docker exec para-redis redis-cli INFO memory | grep maxmemory_human | cut -d: -f2 | tr -d '\r' 2>/dev/null || echo "?")
echo "Used: $REDIS_USED / Max: $REDIS_MAX"
echo

# 9. File descriptors (PDS SQLite warning)
echo "📁 PDS FILE DESCRIPTORS"
echo "-----------------------"
PDS_PID=$(pgrep -f "node.*pds" | head -1 || echo "")
if [ -n "$PDS_PID" ]; then
  FD_COUNT=$(ls /proc/$PDS_PID/fd 2>/dev/null | wc -l || echo "?")
  echo "PDS PID $PDS_PID open FDs: $FD_COUNT"
  if [ "$FD_COUNT" -gt 10000 ] 2>/dev/null; then
    echo "🔴 WARNING: File descriptors > 10,000"
  fi
else
  echo "PDS process not found"
fi
echo

# 10. Summary
echo "========================================"
echo "  Summary"
echo "========================================"
TOTAL_APPROVED=$(sqlite3 "$ACCOUNT_DB" "SELECT COUNT(*) FROM alpha_access_request WHERE status = 'approved';" 2>/dev/null || echo "0")
TOTAL_SLOTS=$(sqlite3 "$ACCOUNT_DB" "SELECT SUM(totalSlots) FROM alpha_rollout WHERE state != 'FRIEND';" 2>/dev/null || echo "0")
FRIEND_USED=$(sqlite3 "$ACCOUNT_DB" "SELECT usedSlots FROM alpha_rollout WHERE state = 'FRIEND';" 2>/dev/null || echo "0")
echo "Alpha users approved: $TOTAL_APPROVED / $TOTAL_SLOTS"
echo "Friend invites used: $FRIEND_USED / 400"
echo "Waitlist: $TOTAL_WAITLIST"
echo "Next review: $(date -d '+6 hours' 2>/dev/null || date)"
echo "========================================"
