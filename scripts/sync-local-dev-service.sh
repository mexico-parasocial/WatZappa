#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PARA_DIR="$(cd "$ROOT_DIR/../PARA" && pwd)"

WATX_ENV_LOCAL="$ROOT_DIR/.env.local"
PARA_ENV="$PARA_DIR/.env"

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

LOCAL_IP="$(detect_local_ip)"
PDS_URL="http://${LOCAL_IP}:2583"
APPVIEW_URL="http://${LOCAL_IP}:2584"
LOCAL_APPVIEW_DID="did:plc:dw4kbjf5mn7nhenabiqpkyh3"
LOCAL_CHAT_DID="did:plc:ztgydimgwegx72nfqbfgurrb"

upsert_env_var "$WATX_ENV_LOCAL" "DEV_ENV_PDS_HOSTNAME" "$LOCAL_IP"
upsert_env_var "$WATX_ENV_LOCAL" "DEV_ENV_BSKY_PUBLIC_URL" "$APPVIEW_URL"

upsert_env_var "$PARA_ENV" "EXPO_PUBLIC_USE_LOCAL_DEV_SERVICE" "1"
upsert_env_var "$PARA_ENV" "EXPO_PUBLIC_LOCAL_DEV_IP" "$LOCAL_IP"
upsert_env_var "$PARA_ENV" "EXPO_PUBLIC_LOCAL_DEV_SERVICE" "$PDS_URL"
upsert_env_var "$PARA_ENV" "EXPO_PUBLIC_DEFAULT_SERVICE" "$PDS_URL"
upsert_env_var "$PARA_ENV" "EXPO_PUBLIC_LOCAL_BSKY_PROXY_DID" "$LOCAL_APPVIEW_DID"
upsert_env_var "$PARA_ENV" "EXPO_PUBLIC_LOCAL_CHAT_PROXY_DID" "$LOCAL_CHAT_DID"

printf 'Synced local dev service IP: %s\n' "$LOCAL_IP"
