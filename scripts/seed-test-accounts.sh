#!/usr/bin/env bash
set -euo pipefail

# ═════════════════════════════════════════════════════════════════════════════
# Seed persistent test accounts on the local dev-env PDS.
#
# Idempotent: an account whose handle already resolves is left alone, so this
# is safe to re-run after every restart of scripts/dev-env-persistent.sh.
#
# Accounts are created on the LOCAL PDS against the LOCAL PLC — the DIDs are
# not on plc.directory, nothing is public, and deleting .dev-env-data removes
# them. dev-env installs a mock mailer, so no mail is sent to any address here.
#
# Credentials land in test-accounts.json (gitignored) so the app, the e2e
# suite and a human can all use the same fixtures.
#
#   ./scripts/seed-test-accounts.sh
#   PDS_URL=http://localhost:2583 ./scripts/seed-test-accounts.sh
# ═════════════════════════════════════════════════════════════════════════════

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PDS_URL="${PDS_URL:-http://localhost:2583}"
OUT="${TEST_ACCOUNTS_FILE:-$REPO_ROOT/test-accounts.json}"

command -v jq >/dev/null || { echo "❌ jq is required"; exit 1; }

if ! curl -sf "$PDS_URL/xrpc/_health" >/dev/null; then
  echo "❌ No PDS at $PDS_URL — start ./scripts/dev-env-persistent.sh first."
  exit 1
fi

# handle|email|password
#
# Passwords are fixed rather than random ON PURPOSE: these are local
# throwaway fixtures whose whole point is being reproducible across machines
# and reruns. Nothing here may ever be reused on a real account.
ACCOUNTS=(
  "a331206.test|a331206@uach.mx|para-test-pw"
  "alice.test|alice@para.test|para-test-pw"
  "bob.test|bob@para.test|para-test-pw"
  "moderator.test|moderator@para.test|para-test-pw"
)

echo "═══════════════════════════════════════════════"
echo "  Seeding test accounts on $PDS_URL"
echo "═══════════════════════════════════════════════"

results='[]'

for entry in "${ACCOUNTS[@]}"; do
  IFS='|' read -r handle email password <<< "$entry"

  did=$(curl -sf "$PDS_URL/xrpc/com.atproto.identity.resolveHandle?handle=$handle" \
        2>/dev/null | jq -r '.did // empty' || true)

  if [ -n "$did" ]; then
    echo "✅ $handle already exists ($did)"
  else
    body=$(jq -nc --arg h "$handle" --arg e "$email" --arg p "$password" \
      '{handle:$h, email:$e, password:$p}')
    resp=$(curl -sS -X POST "$PDS_URL/xrpc/com.atproto.server.createAccount" \
      -H 'Content-Type: application/json' -d "$body")
    did=$(echo "$resp" | jq -r '.did // empty')
    if [ -z "$did" ]; then
      echo "❌ $handle failed: $(echo "$resp" | jq -rc '.message // .error // .')"
      exit 1
    fi
    echo "🆕 $handle created ($did)"
  fi

  results=$(echo "$results" | jq --arg h "$handle" --arg e "$email" \
    --arg p "$password" --arg d "$did" --arg u "$PDS_URL" \
    '. += [{handle:$h, email:$e, password:$p, did:$d, pdsUrl:$u}]')
done

echo "$results" | jq . > "$OUT"
chmod 600 "$OUT"

echo ""
echo "📋 Wrote $(echo "$results" | jq 'length') accounts to $OUT (gitignored, 0600)"
echo "   These DIDs are on the LOCAL PLC. They are not public and not permanent."
