#!/usr/bin/env bash
# Move an existing MAS + para-idp configuration to new browser-facing URLs.
#
#   MATRIX_MAS_PUBLIC_URL=https://auth.example.org \
#   MATRIX_IDP_PUBLIC_URL=https://idp.example.org \
#   deploy/matrix/set-public-urls.sh [--apply]
#
# setup-mas.sh never rewrites an existing configuration (it holds the MAS
# encryption and signing keys), so a deployment generated for localhost, or
# moved to another domain, uses this instead. Without --apply it prints the
# planned change and exits. With --apply it keeps timestamped copies, rewrites
# only the URL lines setup-mas.sh generated, has MAS check the result, and
# restarts para-idp and MAS. Synapse is unaffected: it reaches MAS internally.
#
# Signed-in clients cached the old issuer's endpoints. Access tokens keep
# working (Synapse introspects them over the Compose network), but a client
# refreshes against the old auth host; keep it serving until clients have
# signed in again, or expect them to.
set -euo pipefail
umask 077
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
COMPOSE_FILE="${MATRIX_COMPOSE_FILE:-$REPO_ROOT/docker-compose.matrix.yaml}"
MAS_CONFIG="$SCRIPT_DIR/mas/config.yaml"
IDP_ENV="$SCRIPT_DIR/mas/para-idp.env"
MODE="${1:-}"
[[ -z "$MODE" || "$MODE" == --apply ]] || { echo 'Usage: set-public-urls.sh [--apply]' >&2; exit 2; }
[[ -f "$MAS_CONFIG" && -f "$IDP_ENV" ]] || { echo 'No generated MAS configuration; run setup-mas.sh instead' >&2; exit 2; }

MAS_URL="${MATRIX_MAS_PUBLIC_URL:?Set MATRIX_MAS_PUBLIC_URL}"
IDP_URL="${MATRIX_IDP_PUBLIC_URL:?Set MATRIX_IDP_PUBLIC_URL}"
MAS_URL="${MAS_URL%/}/"
IDP_URL="${IDP_URL%/}"
for url in "$MAS_URL" "$IDP_URL"; do
  case "$url" in
    https://*|http://localhost:*|http://127.0.0.1:*) ;;
    *) echo "${url} must be https:// (plain http is only accepted for localhost)" >&2; exit 2 ;;
  esac
done

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
python3 - "$MAS_CONFIG" "$IDP_ENV" "$MAS_URL" "$IDP_URL" "$WORK" <<'PY'
import json, re, sys
from pathlib import Path
mas_path, idp_path, mas_url, idp_url, work = sys.argv[1:]
mas = Path(mas_path).read_text()
idp = Path(idp_path).read_text()

def replace_once(text, pattern, repl, what):
    new, n = re.subn(pattern, repl, text, count=1, flags=re.M)
    if n != 1:
        raise SystemExit(f'Could not find the generated {what} line; edit it by hand')
    return new

old_mas = re.search(r'^  public_base: (\S+)$', mas, re.M)
old_idp = re.search(r'^      issuer: (\S+)$', mas, re.M)
if not old_mas or not old_idp:
    raise SystemExit('MAS configuration is not in the shape setup-mas.sh generates')
print(f'MAS issuer : {old_mas.group(1)} -> {mas_url}')
print(f'IdP issuer : {old_idp.group(1)} -> {idp_url}')

mas = replace_once(mas, r'^  public_base: \S+$', f'  public_base: {mas_url}', 'http.public_base')
mas = replace_once(mas, r'^  issuer: \S+$', f'  issuer: {mas_url}', 'http.issuer')
mas = replace_once(mas, r'^      issuer: \S+$', f'      issuer: {idp_url}', 'provider issuer')
mas = replace_once(mas, r'^      authorization_endpoint: \S+$',
                   f'      authorization_endpoint: {idp_url}/authorize', 'provider authorization_endpoint')
provider = re.search(r'^    - id: (\S+)$', mas, re.M)
if not provider:
    raise SystemExit('No upstream provider id in the MAS configuration')

out = []
seen = set()
for line in idp.splitlines():
    if line.startswith('PARA_IDP_ISSUER='):
        line = f'PARA_IDP_ISSUER={idp_url}'; seen.add('issuer')
    elif line.startswith('PARA_IDP_CLIENTS='):
        clients = json.loads(line.split('=', 1)[1])
        for client in clients:
            if client.get('clientId') == 'mas':
                client['redirectUris'] = [f'{mas_url}upstream/callback/{provider.group(1)}']
                seen.add('clients')
        line = 'PARA_IDP_CLIENTS=' + json.dumps(clients, separators=(',', ':'))
    out.append(line)
if seen != {'issuer', 'clients'}:
    raise SystemExit('para-idp.env is not in the shape setup-mas.sh generates')
Path(work, 'config.yaml').write_text(mas)
Path(work, 'para-idp.env').write_text('\n'.join(out) + '\n')
PY

if [[ "$MODE" != --apply ]]; then
  echo 'Dry run. Re-run with --apply to write the change and restart para-idp and MAS.'
  exit 0
fi

dc() { docker compose -f "$COMPOSE_FILE" "$@"; }
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
cp -p "$MAS_CONFIG" "$MAS_CONFIG.bak-$STAMP"
cp -p "$IDP_ENV" "$IDP_ENV.bak-$STAMP"
install -m 600 "$WORK/config.yaml" "$MAS_CONFIG"
install -m 600 "$WORK/para-idp.env" "$IDP_ENV"
if ! dc run --rm --no-deps mas config check -c /config/config.yaml; then
  cp -p "$MAS_CONFIG.bak-$STAMP" "$MAS_CONFIG"
  cp -p "$IDP_ENV.bak-$STAMP" "$IDP_ENV"
  echo 'MAS rejected the new configuration; the previous files are back in place.' >&2
  exit 1
fi
dc up -d --force-recreate para-idp mas
echo "Updated. Previous files: $MAS_CONFIG.bak-$STAMP, $IDP_ENV.bak-$STAMP"
echo 'Point the auth. and idp. edge hosts at the new names and check a fresh sign-in.'
