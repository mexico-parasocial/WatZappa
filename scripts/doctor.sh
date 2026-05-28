#!/bin/bash
set -euo pipefail

# PARA Service Doctor
# =============================================================================
# Diagnostic tool for the AT Protocol backend stack.
# Works with both Docker Compose (production) and localhost (dev) setups.
#
# Usage:
#   ./scripts/doctor.sh [pds|bsky|dataplane|bsync|ozone|postgres|redis|caddy|all]
#
#   make pds-doctor       # Check PDS health
#   make bsky-doctor      # Check AppView health
#   make ozone-doctor     # Check moderation service
#   make postgres-doctor  # Check database health
#   make redis-doctor     # Check cache health
#   make doctor           # Run ALL checks
#
# Exit codes:
#   0 = all healthy
#   1 = one or more services unhealthy
# =============================================================================

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

PASS="${GREEN}✓${NC}"
FAIL="${RED}✗${NC}"
WARN="${YELLOW}⚠${NC}"

# Global state
ERRORS=0
WARNINGS=0

# =============================================================================
# Environment Detection
# =============================================================================

# Detect if we're running in Docker Compose or localhost dev mode
DETECTED_MODE=""
detect_mode() {
  if [ -n "${DETECTED_MODE:-}" ]; then
    echo "$DETECTED_MODE"
    return
  fi

  # Check if docker compose is available and services are running
  if command -v docker &> /dev/null && docker compose ps 2>/dev/null | grep -q "para-"; then
    DETECTED_MODE="docker"
  else
    DETECTED_MODE="localhost"
  fi
  echo "$DETECTED_MODE"
}

# Get base URL for a service
service_url() {
  local service="$1"
  local default_port="$2"
  local mode
  mode=$(detect_mode)

  if [ "$mode" = "docker" ]; then
    # In Docker, services talk via internal network or Caddy
    case "$service" in
      pds)     echo "http://para-pds:2583" ;;
      bsky)    echo "http://para-bsky:2584" ;;
      ozone)   echo "http://para-ozone:3000" ;;
      dataplane) echo "http://para-dataplane:2585" ;;
      bsync)   echo "http://para-bsync:2586" ;;
      *)       echo "http://localhost:${default_port}" ;;
    esac
  else
    echo "http://localhost:${default_port}"
  fi
}

# Execute command in container or locally
run_in_service() {
  local service="$1"
  shift
  local mode
  mode=$(detect_mode)

  if [ "$mode" = "docker" ]; then
    local container="para-${service}"
    if docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
      docker exec "$container" "$@"
    else
      echo "Container ${container} not running"
      return 1
    fi
  else
    "$@"
  fi
}

# =============================================================================
# Output Helpers
# =============================================================================

header() {
  echo ""
  echo -e "${BOLD}${BLUE}═══ $1 ═══${NC}"
}

ok() {
  echo -e "  ${PASS} $1"
}

err() {
  echo -e "  ${FAIL} $1"
  ((ERRORS++)) || true
}

warn() {
  echo -e "  ${WARN} $1"
  ((WARNINGS++)) || true
}

info() {
  echo -e "  ${BLUE}ℹ${NC}  $1"
}

# =============================================================================
# HTTP Health Check
# =============================================================================

check_http() {
  local name="$1"
  local url="$2"
  local path="${3:-/xrpc/_health}"
  local full_url="${url}${path}"

  local status
  status=$(curl -sf -o /dev/null -w "%{http_code}" "$full_url" 2>/dev/null || echo "000")

  if [ "$status" = "200" ]; then
    ok "${name} responds 200 on ${path}"
    return 0
  elif [ "$status" = "000" ]; then
    err "${name} unreachable at ${full_url}"
    return 1
  else
    err "${name} returned HTTP ${status} on ${path}"
    return 1
  fi
}

# =============================================================================
# PDS Doctor
# =============================================================================

doctor_pds() {
  header "PDS (Personal Data Server)"
  local url
  url=$(service_url "pds" 2583)

  # Basic health
  check_http "PDS" "$url" "/xrpc/_health" || return 1

  # Ready check
  local ready_status
  ready_status=$(curl -sf -o /dev/null -w "%{http_code}" "${url}/xrpc/_ready" 2>/dev/null || echo "000")
  if [ "$ready_status" = "200" ]; then
    ok "PDS is ready"
  else
    warn "PDS /_ready returned ${ready_status} (may still be starting)"
  fi

  # DID resolution test
  local did_res
  did_res=$(curl -sf "${url}/xrpc/com.atproto.identity.resolveHandle?handle=admin.para.social" 2>/dev/null || echo '{"did":null}')
  if echo "$did_res" | grep -q '"did"'; then
    local did
    did=$(echo "$did_res" | grep -o '"did":"[^"]*"' | head -1 | cut -d'"' -f4)
    if [ -n "$did" ] && [ "$did" != "null" ]; then
      ok "DID resolution works (admin DID: ${did:0:30}...)"
    else
      warn "Handle admin.para.social not found (expected on fresh deploy)"
    fi
  fi

  # Describe server
  local server_info
  server_info=$(curl -sf "${url}/xrpc/com.atproto.server.describeServer" 2>/dev/null || echo '{}')
  local invite_required
  invite_required=$(echo "$server_info" | grep -o '"inviteCodeRequired":[^,}]*' | cut -d: -f2 || echo "unknown")
  info "Invite required: ${invite_required}"

  # Blobstore disk usage
  local mode
  mode=$(detect_mode)
  if [ "$mode" = "docker" ]; then
    local blob_usage
    blob_usage=$(docker exec para-pds df -h /data/blobs 2>/dev/null | tail -1 | awk '{print $5}' || echo "unknown")
    if [ "$blob_usage" != "unknown" ]; then
      info "Blobstore disk usage: ${blob_usage}"
      local usage_num
      usage_num=${blob_usage%\%}
      if [ "${usage_num:-0}" -gt 90 ] 2>/dev/null; then
        warn "Blobstore disk is ${blob_usage} full"
      fi
    fi
  fi
}

# =============================================================================
# AppView (bsky) Doctor
# =============================================================================

doctor_bsky() {
  header "AppView (bsky)"
  local url
  url=$(service_url "bsky" 2584)

  check_http "AppView" "$url" "/xrpc/_health" || return 1

  # Check if signing key is configured (via a simple admin endpoint or env)
  local mode
  mode=$(detect_mode)
  if [ "$mode" = "docker" ]; then
    local has_key
    has_key=$(docker exec para-bsky printenv BSKY_SERVICE_SIGNING_KEY 2>/dev/null || echo "")
    if [ -n "$has_key" ]; then
      ok "BSKY_SERVICE_SIGNING_KEY is set"
    else
      err "BSKY_SERVICE_SIGNING_KEY is NOT set — AppView will crash on start"
    fi
  else
    if [ -n "${BSKY_SERVICE_SIGNING_KEY:-}" ]; then
      ok "BSKY_SERVICE_SIGNING_KEY is set"
    else
      warn "Cannot verify BSKY_SERVICE_SIGNING_KEY outside Docker"
    fi
  fi

  # Dataplane connectivity (indirect — if AppView is healthy, dataplane is reachable)
  info "Dataplane connectivity verified via AppView health"
}

# =============================================================================
# Dataplane Doctor
# =============================================================================

doctor_dataplane() {
  header "Dataplane"
  local mode
  mode=$(detect_mode)

  if [ "$mode" = "docker" ]; then
    if docker ps --format '{{.Names}}' | grep -q "^para-dataplane$"; then
      ok "Dataplane container is running"
    else
      err "Dataplane container is NOT running"
      return 1
    fi

    # Check database connectivity via a simple query
    local db_test
    db_test=$(docker exec para-dataplane sh -c '
      export PGPASSWORD=${POSTGRES_PASSWORD:-changeme}
      psql -h postgres -U ${POSTGRES_USER:-pg} -d ${POSTGRES_DB:-para} -c "SELECT 1" 2>/dev/null | grep -q "1 row" && echo OK || echo FAIL
    ' 2>/dev/null || echo "FAIL")

    if [ "$db_test" = "OK" ]; then
      ok "Database connectivity from dataplane"
    else
      err "Dataplane cannot reach Postgres"
    fi
  else
    warn "Dataplane health checks are Docker-only in this version"
  fi
}

# =============================================================================
# Bsync Doctor
# =============================================================================

doctor_bsync() {
  header "Bsync"
  local mode
  mode=$(detect_mode)

  if [ "$mode" = "docker" ]; then
    if docker ps --format '{{.Names}}' | grep -q "^para-bsync$"; then
      ok "Bsync container is running"
    else
      err "Bsync container is NOT running"
      return 1
    fi

    # Check DB connectivity
    local db_test
    db_test=$(docker exec para-bsync sh -c '
      export PGPASSWORD=${POSTGRES_PASSWORD:-changeme}
      psql -h postgres -U ${POSTGRES_USER:-pg} -d ${POSTGRES_DB:-para} -c "SELECT 1" 2>/dev/null | grep -q "1 row" && echo OK || echo FAIL
    ' 2>/dev/null || echo "FAIL")

    if [ "$db_test" = "OK" ]; then
      ok "Database connectivity from bsync"
    else
      err "Bsync cannot reach Postgres"
    fi

    # Check pool config
    local pool_size
    pool_size=$(docker exec para-bsync printenv BSYNC_DB_POOL_SIZE 2>/dev/null || echo "10")
    info "BSYNC_DB_POOL_SIZE=${pool_size}"
  else
    warn "Bsync health checks are Docker-only in this version"
  fi
}

# =============================================================================
# Ozone Doctor
# =============================================================================

doctor_ozone() {
  header "Ozone (Moderation)"
  local url
  url=$(service_url "ozone" 3000)
  local mode
  mode=$(detect_mode)

  # Ozone doesn't have a standard _health endpoint, but we can check if it's listening
  local status
  status=$(curl -sf -o /dev/null -w "%{http_code}" "${url}/xrpc/_health" 2>/dev/null || echo "000")
  if [ "$status" = "200" ]; then
    ok "Ozone responds on /xrpc/_health"
  elif [ "$status" = "404" ]; then
    ok "Ozone is listening (404 on /_health is expected — no health endpoint exposed)"
  elif [ "$status" = "000" ]; then
    err "Ozone is unreachable at ${url}"
    return 1
  else
    warn "Ozone returned HTTP ${status}"
  fi

  # Check admin DIDs
  if [ "$mode" = "docker" ]; then
    local admin_dids
    admin_dids=$(docker exec para-ozone printenv OZONE_ADMIN_DIDS 2>/dev/null || echo "")
    if [ -n "$admin_dids" ] && [ "$admin_dids" != "<will-be-known-after-first-account-creation>" ]; then
      ok "OZONE_ADMIN_DIDS is configured (${#admin_dids} chars)"
    else
      err "OZONE_ADMIN_DIDS is NOT configured — run create-admin-and-update-env.sh"
    fi

    # Check DB connectivity
    local db_test
    db_test=$(docker exec para-ozone sh -c '
      export PGPASSWORD=${POSTGRES_PASSWORD:-changeme}
      psql -h postgres -U ${POSTGRES_USER:-pg} -d ${POSTGRES_DB:-para} -c "SELECT 1" 2>/dev/null | grep -q "1 row" && echo OK || echo FAIL
    ' 2>/dev/null || echo "FAIL")

    if [ "$db_test" = "OK" ]; then
      ok "Database connectivity from ozone"
    else
      err "Ozone cannot reach Postgres"
    fi
  fi
}

# =============================================================================
# Postgres Doctor
# =============================================================================

doctor_postgres() {
  header "PostgreSQL"
  local mode
  mode=$(detect_mode)

  local pg_cmd
  if [ "$mode" = "docker" ]; then
    if docker ps --format '{{.Names}}' | grep -q "^para-postgres$"; then
      ok "Postgres container is running"
    else
      err "Postgres container is NOT running"
      return 1
    fi
    pg_cmd="docker exec -i para-postgres psql -U pg -d para"
  else
    pg_cmd="psql -U postgres -d postgres"
    if ! command -v psql &> /dev/null; then
      warn "psql not installed — skipping Postgres checks"
      return 0
    fi
  fi

  # Connection count
  local connections
  connections=$($pg_cmd -t -c "SELECT count(*) FROM pg_stat_activity;" 2>/dev/null | xargs || echo "?")
  info "Active connections: ${connections}"

  local max_conn
  max_conn=$($pg_cmd -t -c "SHOW max_connections;" 2>/dev/null | xargs || echo "?")
  info "Max connections: ${max_conn}"

  # Database size
  local db_size
  db_size=$($pg_cmd -t -c "SELECT pg_size_pretty(pg_database_size(current_database()));" 2>/dev/null | xargs || echo "?")
  info "Database size: ${db_size}"

  # Disk usage (Docker only)
  if [ "$mode" = "docker" ]; then
    local disk_usage
    disk_usage=$(docker exec para-postgres df -h /var/lib/postgresql/data 2>/dev/null | tail -1 | awk '{print $5}' || echo "unknown")
    info "Data volume usage: ${disk_usage}"
    local usage_num
    usage_num=${disk_usage%\%}
    if [ "${usage_num:-0}" -gt 85 ] 2>/dev/null; then
      warn "Postgres data volume is ${disk_usage} full"
    fi
  fi

  # Slow queries
  local slow_queries
  slow_queries=$($pg_cmd -t -c "SELECT count(*) FROM pg_stat_activity WHERE state = 'active' AND now() - query_start > interval '1 second';" 2>/dev/null | xargs || echo "0")
  if [ "$slow_queries" != "0" ]; then
    warn "${slow_queries} query(s) running longer than 1 second"
  else
    ok "No slow queries detected"
  fi

  # Missing indexes warning (tables with sequential scans)
  local seq_scans
  seq_scans=$($pg_cmd -t -c "SELECT count(*) FROM pg_stat_user_tables WHERE seq_scan > 100 AND seq_tup_read > 1000;" 2>/dev/null | xargs || echo "0")
  if [ "$seq_scans" != "0" ]; then
    warn "${seq_scans} table(s) with high sequential scans — consider adding indexes"
  fi
}

# =============================================================================
# Redis Doctor
# =============================================================================

doctor_redis() {
  header "Redis"
  local mode
  mode=$(detect_mode)

  local redis_cmd
  if [ "$mode" = "docker" ]; then
    if docker ps --format '{{.Names}}' | grep -q "^para-redis$"; then
      ok "Redis container is running"
    else
      err "Redis container is NOT running"
      return 1
    fi
    redis_cmd="docker exec -i para-redis redis-cli"
  else
    if command -v redis-cli &> /dev/null; then
      redis_cmd="redis-cli"
    else
      warn "redis-cli not installed — skipping Redis checks"
      return 0
    fi
  fi

  # Ping
  local ping
  ping=$($redis_cmd PING 2>/dev/null || echo "FAIL")
  if [ "$ping" = "PONG" ]; then
    ok "Redis responds to PING"
  else
    err "Redis is not responding"
    return 1
  fi

  # Memory
  local memory
  memory=$($redis_cmd INFO memory 2>/dev/null | grep "^used_memory_human:" | cut -d: -f2 | tr -d '\r' || echo "?")
  info "Memory used: ${memory}"

  # Connected clients
  local clients
  clients=$($redis_cmd INFO clients 2>/dev/null | grep "^connected_clients:" | cut -d: -f2 | tr -d '\r' || echo "?")
  info "Connected clients: ${clients}"

  # Hit rate
  local keyspace_hits keyspace_misses hit_rate
  keyspace_hits=$($redis_cmd INFO stats 2>/dev/null | grep "^keyspace_hits:" | cut -d: -f2 | tr -d '\r' || echo "0")
  keyspace_misses=$($redis_cmd INFO stats 2>/dev/null | grep "^keyspace_misses:" | cut -d: -f2 | tr -d '\r' || echo "0")
  if [ "$keyspace_hits" -gt 0 ] 2>/dev/null || [ "$keyspace_misses" -gt 0 ] 2>/dev/null; then
    hit_rate=$(awk "BEGIN {printf \"%.1f\", ${keyspace_hits:-0} / (${keyspace_hits:-0} + ${keyspace_misses:-0} + 1) * 100}")
    info "Keyspace hit rate: ${hit_rate}%"
  fi
}

# =============================================================================
# Caddy Doctor
# =============================================================================

doctor_caddy() {
  header "Caddy (Reverse Proxy)"
  local mode
  mode=$(detect_mode)

  if [ "$mode" = "docker" ]; then
    if docker ps --format '{{.Names}}' | grep -q "^para-caddy$"; then
      ok "Caddy container is running"
    else
      err "Caddy container is NOT running"
      return 1
    fi

    # Check config validity
    local config_valid
    config_valid=$(docker exec para-caddy caddy validate --config /etc/caddy/Caddyfile 2>&1 || echo "FAIL")
    if echo "$config_valid" | grep -q "Valid configuration"; then
      ok "Caddyfile is valid"
    else
      err "Caddyfile has errors"
      echo "$config_valid" | head -5 | sed 's/^/    /'
    fi

    # Check SSL certificate expiry for main domains
    local domains=("pds.para.social" "appview.para.social" "ozone.para.social")
    for domain in "${domains[@]}"; do
      local expiry
      expiry=$(docker exec para-caddy sh -c "cat /data/caddy/certificates/local/local/${domain}/${domain}.crt 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2" || echo "")
      if [ -n "$expiry" ]; then
        info "${domain} SSL cert expires: ${expiry}"
      fi
    done
  else
    # Localhost mode — check if Caddy is running locally
    if command -v caddy &> /dev/null; then
      local config_valid
      config_valid=$(caddy validate --config ./services/caddy/Caddyfile.prod 2>&1 || echo "FAIL")
      if echo "$config_valid" | grep -q "Valid configuration"; then
        ok "Caddyfile is valid"
      else
        warn "Caddyfile validation failed (expected in dev mode)"
      fi
    else
      info "Caddy not installed locally — skipping"
    fi
  fi
}

# =============================================================================
# Index Doctor — Verify production indexes exist in Postgres
# =============================================================================

doctor_indexes() {
  header "Database Indexes"
  local mode
  mode=$(detect_mode)

  local pg_cmd
  if [ "$mode" = "docker" ]; then
    if ! docker ps --format '{{.Names}}' | grep -q "^para-postgres$"; then
      err "Postgres container not running"
      return 1
    fi
    pg_cmd="docker exec -i para-postgres psql -U pg -d para -t"
  else
    pg_cmd="psql -U postgres -d postgres -t"
    if ! command -v psql &> /dev/null; then
      warn "psql not installed — skipping index checks"
      return 0
    fi
  fi

  local indexes=(
    "para_post_creator_sortat_idx"
    "para_post_replyroot_idx"
    "para_post_replyparent_idx"
    "collection_creator_updatedat_idx"
    "cabildeo_position_cabildeo_stance_sortat_idx"
    "cabildeo_live_session_cabildeo_idx"
    "cabildeo_live_presence_cabildeo_actordid_idx"
  )

  local all_present=true
  for idx in "${indexes[@]}"; do
    local exists
    exists=$($pg_cmd -c "SELECT 1 FROM pg_indexes WHERE indexname = '${idx}';" 2>/dev/null | xargs || echo "")
    if [ "$exists" = "1" ]; then
      ok "Index ${idx} exists"
    else
      err "Index ${idx} MISSING — run migrations"
      all_present=false
    fi
  done

  # Show total index count
  local total_indexes
  total_indexes=$($pg_cmd -c "SELECT count(*) FROM pg_indexes WHERE schemaname = 'public';" 2>/dev/null | xargs || echo "?")
  info "Total indexes in public schema: ${total_indexes}"
}

# =============================================================================
# Full Doctor (all services)
# =============================================================================

doctor_all() {
  doctor_pds
  doctor_bsky
  doctor_dataplane
  doctor_bsync
  doctor_ozone
  doctor_postgres
  doctor_redis
  doctor_caddy

  header "Summary"
  if [ "$ERRORS" -eq 0 ] && [ "$WARNINGS" -eq 0 ]; then
    echo -e "  ${PASS} ${GREEN}All systems healthy${NC}"
  elif [ "$ERRORS" -eq 0 ]; then
    echo -e "  ${WARN} ${YELLOW}All critical checks passed, ${WARNINGS} warning(s)${NC}"
  else
    echo -e "  ${FAIL} ${RED}${ERRORS} error(s), ${WARNINGS} warning(s)${NC}"
  fi
  return "$ERRORS"
}

# =============================================================================
# Main
# =============================================================================

SERVICE="${1:-all}"

mode=$(detect_mode)
header "PARA Doctor"
info "Detected mode: ${mode}"

case "$SERVICE" in
  pds)       doctor_pds ;;
  bsky|appview) doctor_bsky ;;
  dataplane) doctor_dataplane ;;
  bsync)     doctor_bsync ;;
  ozone)     doctor_ozone ;;
  postgres|db) doctor_postgres ;;
  redis)     doctor_redis ;;
  caddy)     doctor_caddy ;;
  indexes|index) doctor_indexes ;;
  all|doctor|*) doctor_all ;;
esac

exit "$ERRORS"
