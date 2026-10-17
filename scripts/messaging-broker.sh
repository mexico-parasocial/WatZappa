#!/usr/bin/env bash
# Separate acceptance broker: never reads or modifies the default broker database or env.
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA="${PARA_MESSAGING_DATA:-$ROOT/.messaging-dev-data}/m8"
BROKER="${MUBEZ_DIR:-$ROOT/../mubEZ}"
if lsof -nP -tiTCP:8788 -sTCP:LISTEN >/dev/null 2>&1; then
  echo 'Port 8788 is occupied; refusing to replace its process' >&2; exit 2
fi
mkdir -p "$DATA"
python3 - "$DATA" <<'PYENV'
from pathlib import Path
import secrets,sys
data=Path(sys.argv[1]).resolve()
env=data/'.env'
if not env.exists():
 values={'NODE_ENV':'development','HOST':'127.0.0.1','PORT':'8788',
 'SERVICE_URL':'http://localhost:8788','DATABASE_PATH':str(data/'broker.sqlite'),
 'PLC_URL':'http://localhost:3582','PDS_URL':'http://localhost:3583',
 'DATABASE_AUTOMIGRATE':'true','LOG_LEVEL':'info'}
 for key in ['JWT_SECRET','APP_KEY','COOKIE_SECRET','CURP_PEPPER',
             'CIVIC_VOTE_PROOF_SECRET','CIVIC_DELEGATION_RESOLVER_SECRET']:
  values[key]=secrets.token_hex(32)
 env.write_text('\n'.join(f'{key}={value}' for key,value in values.items())+'\n')
 env.chmod(0o600)
PYENV
export ENV_PATH="$DATA"
cd "$BROKER"
exec pnpm --config.verify-deps-before-run=false exec tsx bin/server.ts
