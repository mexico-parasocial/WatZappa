#!/usr/bin/env bash
set -euo pipefail

PDS_PUBLIC_URL="${PDS_PUBLIC_URL:-https://pds.example.com}"
APPVIEW_PUBLIC_URL="${APPVIEW_PUBLIC_URL:-https://appview.example.com}"

check() {
  local name="$1"
  local url="$2"
  printf '%-18s %s\n' "${name}" "${url}"
  curl -fsS "${url}" >/dev/null
}

check "local pds" "http://127.0.0.1:2583/xrpc/_health"
check "local appview" "http://127.0.0.1:2584/xrpc/_health"
check "public pds" "${PDS_PUBLIC_URL}/xrpc/_health"
check "public appview" "${APPVIEW_PUBLIC_URL}/xrpc/_health"

echo "All health checks passed."
