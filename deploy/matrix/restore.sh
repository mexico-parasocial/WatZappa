#!/usr/bin/env bash
# Verify first; restoration changes only the explicitly selected Matrix deployment.
set -euo pipefail
umask 077
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ARCHIVE="${1:?Usage: restore.sh ARCHIVE [--verify|--yes]}"
MODE="${2:-}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
python3 - "$ARCHIVE" "$WORK" <<'PYVERIFY'
import hashlib,json,sqlite3,sys,tarfile
from pathlib import Path,PurePosixPath
archive,work=sys.argv[1:];work=Path(work)
required={'postgres.dump','mas.dump','config.tar','media.tar','operator.tar','bridge.sqlite','manifest.json','SHA256SUMS'}
def validate(tar):
 for m in tar.getmembers():
  p=PurePosixPath(m.name)
  if p.is_absolute() or '..' in p.parts or not (m.isfile() or m.isdir()):raise SystemExit('Unsafe archive member')
with tarfile.open(archive) as tar:
 validate(tar)
 names=[str(PurePosixPath(m.name)) for m in tar.getmembers() if m.isfile()]
 if set(names)!=required or len(names)!=len(required):raise SystemExit('Incomplete or unsupported Matrix backup')
 tar.extractall(work,filter='data')
manifest=json.loads((work/'manifest.json').read_text())
if manifest.get('format')!=2 or not manifest.get('bridgeSource'):raise SystemExit('Invalid restore manifest')
checked=set()
for line in (work/'SHA256SUMS').read_text().splitlines():
 digest,name=line.split(None,1);name=str(PurePosixPath(name.strip().removeprefix('*')))
 if name not in required-{'SHA256SUMS'} or name in checked:raise SystemExit('Invalid checksum manifest')
 if hashlib.sha256((work/name).read_bytes()).hexdigest()!=digest:raise SystemExit('Backup checksum mismatch')
 checked.add(name)
if checked!=required-{'SHA256SUMS'}:raise SystemExit('Missing backup checksums')
allowed={'config.tar':{'synapse','mas','hardening.yaml','element-config.json'},
 'media.tar':{'media_store'},'operator.tar':{'.env','docker-compose.matrix.yaml'}}
for name,roots in allowed.items():
 with tarfile.open(work/name) as tar:
  validate(tar)
  files={str(PurePosixPath(m.name)) for m in tar.getmembers() if m.isfile()}
  if name=='operator.tar' and files!={'.env','docker-compose.matrix.yaml'}:raise SystemExit('Missing operator restore configuration')
  if name=='config.tar':
   required_config={'mas/config.yaml','mas/para-idp.env','hardening.yaml','element-config.json'}
   if not required_config<=files or not any(f.startswith('synapse/') and f.endswith('.signing.key') for f in files):raise SystemExit('Incomplete Matrix configuration')
  for member in tar.getmembers():
   parts=PurePosixPath(member.name).parts
   if parts and parts[0] not in roots:raise SystemExit('Unexpected nested archive member')
db=sqlite3.connect('file:'+str(work/'bridge.sqlite')+'?mode=ro',uri=True)
if db.execute('PRAGMA integrity_check').fetchone()[0]!='ok':raise SystemExit('Bridge snapshot integrity failed')
source=db.execute('SELECT source_id FROM sync_source WHERE id=1').fetchone()
if not source or source[0]!=manifest['bridgeSource']:raise SystemExit('Bridge source manifest mismatch')
db.close()
print('Matrix restore unit and checksums verified')
PYVERIFY
[[ "$MODE" != --verify ]] || exit 0
[[ -z "$MODE" || "$MODE" == --yes ]] || { echo 'Unknown restore mode' >&2; exit 2; }
[[ -n "${BRIDGE_DB_PATH:-}" && -n "${BRIDGE_PDS_SOURCE_ID:-}" ]] || { echo 'Set the target BRIDGE_DB_PATH and matching BRIDGE_PDS_SOURCE_ID' >&2; exit 2; }
python3 - "$WORK/manifest.json" "$BRIDGE_PDS_SOURCE_ID" <<'PYSOURCE'
import json,sys
if json.load(open(sys.argv[1]))['bridgeSource']!=sys.argv[2]:raise SystemExit('Backup belongs to a different PDS generation')
PYSOURCE
if lsof -nP -tiTCP:"${BRIDGE_PORT:-3001}" -sTCP:LISTEN >/dev/null 2>&1; then
 echo 'Stop the target host bridge before restoring its database' >&2; exit 2
fi
if [[ "$MODE" != --yes ]]; then
 read -r -p 'This replaces the selected Matrix databases, config and media. Type restore: ' answer
 [[ "$answer" == restore ]] || exit 1
fi
COMPOSE_FILE="${MATRIX_COMPOSE_FILE:-$REPO_ROOT/docker-compose.matrix.yaml}"
[[ "$(cd "$(dirname "$COMPOSE_FILE")" && pwd)" == "$REPO_ROOT" ]] || { echo 'Run the restore script from the selected deployment checkout' >&2; exit 2; }
PROJECT="${MATRIX_COMPOSE_PROJECT:-watzappa}"
dc() { docker compose -p "$PROJECT" -f "$COMPOSE_FILE" "$@"; }
# Do not install credentials against a different deployment definition implicitly.
mkdir "$WORK/operator"
tar -xf "$WORK/operator.tar" -C "$WORK/operator"
cmp -s "$COMPOSE_FILE" "$WORK/operator/docker-compose.matrix.yaml" || { echo 'Target compose definition differs from the backup; review and install the captured definition first' >&2; exit 2; }
dc up -d --wait synapse-db mas-db
COLLATION="$(dc exec -T synapse-db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT datcollate FROM pg_database WHERE datname=current_database()"')"
[[ "$COLLATION" == C ]] || { echo 'Target Synapse database requires C collation; prepare a separate correctly initialized restore target' >&2; exit 2; }
dc stop synapse mas para-idp element-web
ROLLBACK="$REPO_ROOT/backups/pre-restore-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$ROLLBACK"
tar -cf "$ROLLBACK/config.tar" -C "$SCRIPT_DIR" synapse mas hardening.yaml element-config.json
cp "$REPO_ROOT/.env" "$ROLLBACK/operator.env"
rm -rf "$SCRIPT_DIR/synapse" "$SCRIPT_DIR/mas"
tar -xf "$WORK/config.tar" -C "$SCRIPT_DIR"
cp "$WORK/operator/.env" "$REPO_ROOT/.env"
chmod 600 "$REPO_ROOT/.env"
dc up -d --wait synapse-db mas-db
dc exec -T synapse-db sh -c 'pg_restore --exit-on-error --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$WORK/postgres.dump"
dc exec -T mas-db sh -c 'pg_restore --exit-on-error --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$WORK/mas.dump"
SYNAPSE_CONTAINER="$(dc ps -a -q synapse)"
SYNAPSE_VOL="$(docker inspect -f '{{range .Mounts}}{{if and (eq .Type "volume") (eq .Destination "/data")}}{{.Name}}{{end}}{{end}}' "$SYNAPSE_CONTAINER")"
[[ -n "$SYNAPSE_VOL" ]] || { echo 'Selected Synapse has no /data volume' >&2; exit 2; }
docker run --rm -v "$SYNAPSE_VOL:/data" -v "$WORK:/backup:ro" alpine:3 sh -c 'rm -rf /data/media_store; tar -xf /backup/media.tar -C /data; chown -R 991:991 /data/media_store'
mkdir -p "$(dirname "$BRIDGE_DB_PATH")"
rm -f "$BRIDGE_DB_PATH-wal" "$BRIDGE_DB_PATH-shm"
cp "$WORK/bridge.sqlite" "$BRIDGE_DB_PATH"
chmod 600 "$BRIDGE_DB_PATH"
dc up -d --wait synapse mas para-idp element-web
echo 'Matrix restore completed. Start the matching source-bound bridge and verify login, history, media and devices before reopening service.'
