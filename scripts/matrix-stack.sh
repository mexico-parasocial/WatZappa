#!/usr/bin/env bash
# matrix-stack.sh — bring the PARA Matrix stack up/down from anywhere.
#
# Why this exists: docker-compose.matrix.yaml mounts config in by relative
# path (./deploy/matrix/...). Run `docker compose` from the wrong directory and
# Docker does not fail — it silently creates empty directories at those paths
# and mounts them, so Synapse boots with no homeserver.yaml ("Must supply a
# config file") and MAS with no secrets ("missing field `secrets`"), both in a
# restart loop. That is exactly what happened on 2026-09-21 after the repos
# moved under ~/Desktop/Home/macserver: the stack was still being started from
# the old ~/Desktop/Home/WatZappa path.
#
# This script resolves the repo root from its own location, so where you invoke
# it from cannot matter, and refuses to start if a mount source is missing.
#
# Usage:
#   scripts/matrix-stack.sh up        [--with-bridge]
#   scripts/matrix-stack.sh down      [--volumes]
#   scripts/matrix-stack.sh restart   [--with-bridge]
#   scripts/matrix-stack.sh status
#   scripts/matrix-stack.sh logs      [service] [-f]
#   scripts/matrix-stack.sh doctor
#
# The bridge is NOT started by default: in local dev it runs on the host under
# scripts/with-matrix-bridge.sh (which owns :3001 and the on-disk bridge.db).
# Pass --with-bridge to run the containerized one instead — stop the host
# process first, they cannot share the port.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT/docker-compose.matrix.yaml"
# Explicit: the volumes are named watzappa_*, and the project name otherwise
# comes from the directory name, which the move under macserver/ nearly changed.
PROJECT=watzappa

# Everything except matrix-bridge. Order matters only for readability; compose
# resolves the real ordering from depends_on.
CORE_SERVICES=(synapse-db mas-db para-idp synapse mas element-web)

# Bind-mount sources that must exist as FILES or DIRECTORIES before `up`.
# Each entry is "path:kind".
declare -a MOUNTS=(
  "deploy/matrix/synapse:dir"
  "deploy/matrix/synapse/homeserver.yaml:file"
  "deploy/matrix/hardening.yaml:file"
  "deploy/matrix/mas:dir"
  "deploy/matrix/mas/config.yaml:file"
  "deploy/matrix/mas/para-idp.env:file"
  "deploy/matrix/element-config.json:file"
)

red()  { printf '\033[31m%s\033[0m\n' "$*"; }
grn()  { printf '\033[32m%s\033[0m\n' "$*"; }
ylw()  { printf '\033[33m%s\033[0m\n' "$*"; }

dc() { docker compose -p "$PROJECT" -f "$COMPOSE_FILE" "$@"; }

preflight() {
  local failed=0
  if [ ! -f "$ROOT/.env" ]; then
    red "✗ $ROOT/.env is missing — compose would fall back to POSTGRES_PASSWORD=changeme"
    red "  and Synapse would fail to authenticate against an existing database volume."
    failed=1
  fi
  local entry path kind
  for entry in "${MOUNTS[@]}"; do
    path="${entry%:*}"
    kind="${entry##*:}"
    if [ "$kind" = dir ] && [ ! -d "$ROOT/$path" ]; then
      red "✗ missing directory: $path"
      failed=1
    elif [ "$kind" = file ] && [ ! -f "$ROOT/$path" ]; then
      red "✗ missing file: $path"
      if [ -d "$ROOT/$path" ]; then
        red "  It exists as a DIRECTORY — that is Docker's empty-mount artifact."
        red "  Remove it and regenerate: rm -rf '$ROOT/$path'"
      fi
      failed=1
    fi
  done
  if [ "$failed" -ne 0 ]; then
    echo
    red "Refusing to start: Docker would create empty mounts for these and the"
    red "stack would come up misconfigured instead of failing loudly."
    echo
    ylw "Generated config comes from:"
    ylw "  deploy/matrix/setup.sh       (Synapse: homeserver.yaml, signing key)"
    ylw "  deploy/matrix/setup-mas.sh   (MAS + para-idp credentials)"
    exit 1
  fi
}

# Warn about settings that let the stack come up healthy but make the end-to-end
# chat path impossible. Cheaper to read here than to debug from an empty table.
warn_config() {
  local enc pub
  enc="$(sed -n 's/^MATRIX_ENABLE_ENCRYPTION=//p' "$ROOT/.env" | tail -n1)"
  pub="$(sed -n 's/^MATRIX_PUBLIC_HOMESERVER_URL=//p' "$ROOT/.env" | tail -n1)"
  if [ "$enc" != true ]; then
    ylw "⚠ MATRIX_ENABLE_ENCRYPTION is not true: rooms will be created without"
    ylw "  m.room.encryption, and the native PARA chat engine refuses those"
    ylw "  (ENCRYPTED_ROOM_REQUIRED). Rooms are not retro-encrypted."
  fi
  if [ -z "$pub" ]; then
    ylw "⚠ MATRIX_PUBLIC_HOMESERVER_URL is unset: /api/matrix-identity will hand"
    ylw "  clients https://matrix.para.social, which does not resolve."
  fi
  # The registration's url is where Synapse pushes transactions. Pointing at the
  # compose service name while the bridge runs on the host means every push
  # fails DNS and matrix_events stays empty.
  local reg="$ROOT/deploy/matrix/synapse/para-bridge-registration.yaml"
  if [ -f "$reg" ] && grep -q '^url: http://para-matrix-bridge:3001' "$reg"; then
    if ! docker ps --format '{{.Names}}' | grep -q '^para-matrix-bridge$'; then
      ylw "⚠ appservice registration points at http://para-matrix-bridge:3001 but"
      ylw "  no such container is running. If the bridge runs on the host, use"
      ylw "  http://host.docker.internal:3001 or Synapse cannot reach it."
    fi
  fi
}

cmd_up() {
  local with_bridge=0
  [ "${1:-}" = "--with-bridge" ] && with_bridge=1
  preflight
  warn_config
  echo "→ project=$PROJECT  root=$ROOT"
  if [ "$with_bridge" -eq 1 ]; then
    dc up -d "${CORE_SERVICES[@]}" matrix-bridge
  else
    dc up -d "${CORE_SERVICES[@]}"
  fi
  echo
  cmd_status
}

cmd_down() {
  if [ "${1:-}" = "--volumes" ]; then
    red "This destroys the Synapse database, the MAS database and all rooms."
    printf 'Type the project name (%s) to confirm: ' "$PROJECT"
    read -r reply
    [ "$reply" = "$PROJECT" ] || { echo "aborted"; exit 1; }
    dc down -v
  else
    dc down
  fi
}

cmd_status() {
  dc ps --format 'table {{.Name}}\t{{.Status}}\t{{.Ports}}'
  echo
  printf 'synapse  %s\n' "$(curl -fsS -m 3 http://127.0.0.1:8008/health 2>/dev/null || echo 'unreachable')"
  printf 'mas      %s\n' "$(docker exec para-matrix-mas mas-cli --version 2>/dev/null || echo 'unreachable')"
  printf 'idp      %s\n' "$(curl -fsS -m 3 -o /dev/null -w 'HTTP %{http_code}' http://127.0.0.1:8090/healthz 2>/dev/null || echo 'unreachable')"
  printf 'bridge   %s\n' "$(curl -fsS -m 3 -o /dev/null -w 'HTTP %{http_code}' http://127.0.0.1:3001/healthz 2>/dev/null || echo 'unreachable (host process? run make run-dev-env)')"
  printf 'element  %s\n' "$(curl -fsS -m 3 -o /dev/null -w 'HTTP %{http_code}' http://127.0.0.1:8082/ 2>/dev/null || echo 'unreachable')"
}

# Reports where the pipeline actually stands, which container health cannot.
cmd_doctor() {
  local db="${BRIDGE_DB_PATH:-$ROOT/data/bridge/bridge.db}"
  echo "bridge db: $db"
  if [ ! -f "$db" ]; then
    red "  not found — the bridge has never run against this path"
    return 0
  fi
  if ! command -v sqlite3 >/dev/null 2>&1; then
    ylw "  sqlite3 not installed; skipping table counts"
    return 0
  fi
  local t
  for t in community_membership_state community_space_map user_matrix_map matrix_events device_sessions; do
    printf '  %-28s %s\n' "$t" "$(sqlite3 "$db" "select count(*) from $t;" 2>/dev/null || echo '?')"
  done
  echo
  echo "Read it like this:"
  echo "  community_space_map = 0  → no community was ever projected into Matrix"
  echo "  user_matrix_map     = 0  → no DID has an MXID; /api/matrix-identity 404s"
  echo "  matrix_events       = 0  → no room event ever reached the bridge"
}

cmd_logs() {
  if [ $# -eq 0 ]; then
    dc logs --tail 80
  else
    dc logs --tail 80 "$@"
  fi
}

case "${1:-}" in
  up)      shift; cmd_up "$@" ;;
  down)    shift; cmd_down "$@" ;;
  restart) shift; cmd_down; cmd_up "$@" ;;
  status)  cmd_status ;;
  doctor)  cmd_doctor ;;
  logs)    shift; cmd_logs "$@" ;;
  *)
    sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'
    exit 64
    ;;
esac
