#!/usr/bin/env bash

# Keeps the dev stack's machine-specific env values current so the app works
# unchanged as the Mac moves between networks (school ↔ home). Invoked
# automatically by PARA's `pnpm start` / `pnpm ios` / `pnpm android` / `pnpm web`
# (PARA/scripts/sync-local-dev-env.js) and safe to run standalone.
#
# Strategy:
# - Prefer the Mac's Bonjour name (`<LocalHostName>.local`): it resolves on any
#   network the Mac joins, so nothing drifts when DHCP hands out a new IP. The
#   LAN IP is still written as a fallback for networks that block mDNS.
# - Read the AppView and chat DIDs (PARA's atproto-proxy targets) live from the
#   dev-env introspection server, and verify each against the PLC before
#   writing it. A DID the PLC does not know breaks every proxied call, sign-in
#   included, with "could not resolve proxy did".
# - Only PARA/.env (not .env.local) is written: Expo gives .env.local priority,
#   so any key pinned there silently overrides this sync.
#
# Overrides (mainly for testing): DEV_ENV_INTROSPECT_URL, DEV_ENV_PLC_URL,
# PARA_ENV and WATX_ENV_LOCAL (the files written).

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PARA_DIR="$(cd "$ROOT_DIR/../PARA" && pwd)"

WATX_ENV_LOCAL="${WATX_ENV_LOCAL:-$ROOT_DIR/.env.local}"
PARA_ENV="${PARA_ENV:-$PARA_DIR/.env}"

INTROSPECT_URL="${DEV_ENV_INTROSPECT_URL:-http://127.0.0.1:2581}"

detect_local_ip() {
  if [[ -n "${LOCAL_DEV_IP_OVERRIDE:-}" ]]; then
    printf '%s\n' "$LOCAL_DEV_IP_OVERRIDE"
    return 0
  fi

  local iface ip
  iface="$(route -n get default 2>/dev/null | awk '/interface:/{print $2; exit}')"
  if [[ -n "${iface:-}" ]]; then
    ip="$(ipconfig getifaddr "$iface" 2>/dev/null || true)"
    if [[ -n "${ip:-}" ]]; then
      printf '%s\n' "$ip"
      return 0
    fi
  fi

  ip="$(
    ifconfig 2>/dev/null |
      awk '/inet / {print $2}' |
      grep -E '^(10|172\.(1[6-9]|2[0-9]|3[0-1])|192\.168)\.' |
      head -n 1 || true
  )"
  if [[ -n "${ip:-}" ]]; then
    printf '%s\n' "$ip"
    return 0
  fi

  echo "Failed to detect a private LAN IPv4 address." >&2
  return 1
}

# The Bonjour name macOS already advertises (e.g. "Mikes-Mac-mini" →
# "Mikes-Mac-mini.local"). Stable across networks, resolvable by iOS devices
# via mDNS. Override with LOCAL_DEV_HOST_OVERRIDE.
detect_local_host() {
  if [[ -n "${LOCAL_DEV_HOST_OVERRIDE:-}" ]]; then
    printf '%s\n' "$LOCAL_DEV_HOST_OVERRIDE"
    return 0
  fi

  local name
  name="$(scutil --get LocalHostName 2>/dev/null || true)"
  if [[ -n "${name:-}" ]]; then
    printf '%s.local\n' "$name"
    return 0
  fi

  name="$(hostname -s 2>/dev/null || true)"
  if [[ -n "${name:-}" ]]; then
    printf '%s.local\n' "$name"
    return 0
  fi

  return 1
}

upsert_env_var() {
  local file="$1"
  local key="$2"
  local value="$3"

  touch "$file"

  if grep -qE "^${key}=" "$file"; then
    perl -0pi -e "s#^${key}=.*#${key}=${value}#mg" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >>"$file"
  fi
}

warn() { printf 'WARNING: %s\n' "$*" >&2; }

# Fallbacks, used only when the introspection server is unreachable or does
# not report a service (a dev-env build that predates the `chat` field).
# Current dev-env builds derive these DIDs from fixed dev keys (DEV_BSKY_HEX
# and DEV_CHAT_HEX in packages/dev-env/src/identity.ts) plus their localhost
# endpoints, so every machine gets the same values. Older builds minted random
# DIDs, which is why the live value always wins when it is available.
STABLE_APPVIEW_DID="did:plc:6gcjjmsoeyaq4xgvkofdklqc"
STABLE_CHAT_DID="did:plc:ztgydimgwegx72nfqbfgurrb"

INTROSPECTION="$(curl -sf -m 2 "$INTROSPECT_URL/" 2>/dev/null || true)"
if [[ -n "$INTROSPECTION" ]] && ! command -v node >/dev/null 2>&1; then
  warn "node is not on PATH, so the introspection payload cannot be parsed."
  INTROSPECTION=""
fi

# Prints a string field of the introspection payload (e.g. `bsky.did`), or
# nothing if the payload or the field is missing.
introspection_field() {
  [[ -n "$INTROSPECTION" ]] || return 0
  node -e '
    try {
      const v = process.argv[2]
        .split(".")
        .reduce((o, k) => (o == null ? o : o[k]), JSON.parse(process.argv[1]))
      if (typeof v === "string") console.log(v)
    } catch {}
  ' "$INTROSPECTION" "$1" 2>/dev/null || true
}

PLC_URL="${DEV_ENV_PLC_URL:-$(introspection_field plc.url)}"
PLC_URL="${PLC_URL:-http://localhost:2582}"

# registered | missing | unreachable
plc_status() {
  local code
  code="$(curl -s -m 2 -o /dev/null -w '%{http_code}' "$PLC_URL/$1" 2>/dev/null || true)"
  case "$code" in
    200) echo registered ;;
    400 | 404 | 410) echo missing ;;
    *) echo unreachable ;;
  esac
}

# Prints the DID to write for one proxy target, or nothing when the only
# candidate is known to be absent from the PLC (writing it would break
# sign-in, so PARA's current value is left alone).
resolve_service_did() {
  local label="$1" field="$2" stable="$3" did source="introspection"
  did="$(introspection_field "$field")"
  if [[ -z "$did" ]]; then
    if [[ -z "$INTROSPECTION" ]]; then
      warn "$label: dev-env introspection unreachable at $INTROSPECT_URL; falling back to $stable."
    else
      warn "$label: introspection does not report $field (dev-env build predates it); falling back to $stable."
    fi
    did="$stable"
    source="fallback"
  fi

  case "$(plc_status "$did")" in
    registered) ;;
    missing)
      warn "$label: $did ($source) is not registered on the PLC at $PLC_URL; leaving PARA's value unchanged."
      warn "$label: sign-in fails with 'could not resolve proxy did' until PARA and the PLC agree."
      return 0
      ;;
    unreachable)
      warn "$label: PLC at $PLC_URL is unreachable, so $did ($source) is written unverified."
      ;;
  esac
  printf '%s\n' "$did"
}

LOCAL_IP="$(detect_local_ip)"
LOCAL_HOST="$(detect_local_host || true)"
PDS_URL="http://${LOCAL_HOST:-${LOCAL_IP}}:2583"
APPVIEW_URL="http://${LOCAL_HOST:-${LOCAL_IP}}:2584"

LOCAL_APPVIEW_DID="$(resolve_service_did "AppView DID" bsky.did "$STABLE_APPVIEW_DID")"
LOCAL_CHAT_DID="$(resolve_service_did "Chat DID" chat.did "$STABLE_CHAT_DID")"

# Backend side: advertise the Bonjour name so DID documents minted from now on
# carry network-independent endpoints. (Existing accounts keep whatever
# endpoint their DID document was created with; did:plc DIDs are not re-minted
# for endpoint updates.)
upsert_env_var "$WATX_ENV_LOCAL" "DEV_ENV_PDS_HOSTNAME" "${LOCAL_HOST:-${LOCAL_IP}}"
upsert_env_var "$WATX_ENV_LOCAL" "DEV_ENV_BSKY_PUBLIC_URL" "$APPVIEW_URL"

# App side. Keep in sync with the fallbacks in PARA src/lib/constants.ts.
upsert_env_var "$PARA_ENV" "EXPO_PUBLIC_USE_LOCAL_DEV_SERVICE" "1"
if [[ -n "${LOCAL_HOST:-}" ]]; then
  upsert_env_var "$PARA_ENV" "EXPO_PUBLIC_LOCAL_DEV_HOST" "$LOCAL_HOST"
fi
upsert_env_var "$PARA_ENV" "EXPO_PUBLIC_LOCAL_DEV_IP" "$LOCAL_IP"
upsert_env_var "$PARA_ENV" "EXPO_PUBLIC_LOCAL_DEV_SERVICE" "$PDS_URL"
upsert_env_var "$PARA_ENV" "EXPO_PUBLIC_DEFAULT_SERVICE" "$PDS_URL"
upsert_env_var "$PARA_ENV" "EXPO_PUBLIC_M8_BROKER_URL" "http://${LOCAL_HOST:-${LOCAL_IP}}:8787"
upsert_env_var "$PARA_ENV" "EXPO_PUBLIC_MATRIX_BRIDGE_URL" "http://${LOCAL_HOST:-${LOCAL_IP}}:3001"
if [[ -n "${LOCAL_APPVIEW_DID:-}" ]]; then
  upsert_env_var "$PARA_ENV" "EXPO_PUBLIC_LOCAL_BSKY_PROXY_DID" "$LOCAL_APPVIEW_DID"
fi
if [[ -n "${LOCAL_CHAT_DID:-}" ]]; then
  upsert_env_var "$PARA_ENV" "EXPO_PUBLIC_LOCAL_CHAT_PROXY_DID" "$LOCAL_CHAT_DID"
fi

if [[ -n "${LOCAL_HOST:-}" ]]; then
  printf 'Synced local dev service host: %s (IP fallback %s)\n' "$LOCAL_HOST" "$LOCAL_IP"
else
  printf 'Synced local dev service IP: %s\n' "$LOCAL_IP"
fi
printf 'AppView proxy DID: %s\n' "${LOCAL_APPVIEW_DID:-(unchanged)}"
printf 'Chat proxy DID: %s\n' "${LOCAL_CHAT_DID:-(unchanged)}"
