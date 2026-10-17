#!/usr/bin/env bash
# Matrix restore unit: Synapse, MAS, IdP configuration, media and source-bound SQLite bridge.
set -euo pipefail
umask 077
export COPYFILE_DISABLE=1
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
COMPOSE_FILE="${MATRIX_COMPOSE_FILE:-$REPO_ROOT/docker-compose.matrix.yaml}"
[[ "$(cd "$(dirname "$COMPOSE_FILE")" && pwd)" == "$REPO_ROOT" ]] || { echo 'Run the backup script from the selected deployment checkout' >&2; exit 2; }
PROJECT="${MATRIX_COMPOSE_PROJECT:-watzappa}"
OUT_DIR="${1:-$REPO_ROOT/backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
dc() { docker compose -p "$PROJECT" -f "$COMPOSE_FILE" "$@"; }
if [[ -n "${BRIDGE_DATABASE_URL:-}" || -z "${BRIDGE_DB_PATH:-}" || ! -f "$BRIDGE_DB_PATH" ]]; then
  echo 'Set BRIDGE_DB_PATH to the selected live SQLite bridge database. PostgreSQL bridge backups require a separate restore unit.' >&2
  exit 2
fi
for file in "$REPO_ROOT/.env" "$SCRIPT_DIR/mas/config.yaml" "$SCRIPT_DIR/mas/para-idp.env"; do
  [[ -f "$file" ]] || { echo 'Required operator/MAS/IdP configuration is missing' >&2; exit 2; }
done
find "$SCRIPT_DIR/synapse" -name '*.signing.key' -type f | rg -q . || { echo 'Synapse signing key is missing' >&2; exit 2; }
echo 'Taking private Matrix database and configuration snapshots...'
dc exec -T synapse-db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$WORK/postgres.dump"
dc exec -T mas-db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$WORK/mas.dump"
tar -cf "$WORK/config.tar" -C "$SCRIPT_DIR" synapse mas hardening.yaml element-config.json
mkdir "$WORK/operator"
cp "$REPO_ROOT/.env" "$WORK/operator/.env"
cp "$COMPOSE_FILE" "$WORK/operator/docker-compose.matrix.yaml"
tar -cf "$WORK/operator.tar" -C "$WORK/operator" .
rm -rf "$WORK/operator"
SYNAPSE_CONTAINER="$(dc ps -q synapse)"
[[ -n "$SYNAPSE_CONTAINER" ]] || { echo 'Synapse container is required to identify its media volume' >&2; exit 2; }
SYNAPSE_VOL="$(docker inspect -f '{{range .Mounts}}{{if and (eq .Type "volume") (eq .Destination "/data")}}{{.Name}}{{end}}{{end}}' "$SYNAPSE_CONTAINER")"
[[ -n "$SYNAPSE_VOL" ]] || { echo 'Selected Synapse has no /data volume' >&2; exit 2; }
docker run --rm -v "$SYNAPSE_VOL:/data:ro" -v "$WORK:/backup" alpine:3 sh -c 'tar -cf /backup/media.tar -C /data media_store'
python3 - "$BRIDGE_DB_PATH" "$WORK" "$STAMP" <<'PYBACKUP'
import json,sqlite3,sys
from pathlib import Path
source,work,stamp=sys.argv[1:];work=Path(work)
src=sqlite3.connect('file:'+str(Path(source).resolve())+'?mode=ro',uri=True)
dst=sqlite3.connect(work/'bridge.sqlite');src.backup(dst)
source_id=dst.execute('SELECT source_id FROM sync_source WHERE id=1').fetchone()
if not source_id: raise SystemExit('Bridge has no PDS generation binding; refusing incomplete backup')
if dst.execute('PRAGMA integrity_check').fetchone()[0]!='ok': raise SystemExit('Bridge snapshot integrity failed')
src.close();dst.close()
(work/'manifest.json').write_text(json.dumps({'format':2,'created':stamp,'bridgeSource':source_id[0],
 'components':['synapse','mas','idp-config','media','operator-config','bridge-sqlite'],
 'consistency':'individual online snapshots; pause writes for a coordinated cutover',
 'externalDependencies':['matching PDS generation','M8 broker database and keys','edge TLS configuration']},indent=2))
PYBACKUP
(cd "$WORK" && shasum -a 256 postgres.dump mas.dump config.tar media.tar operator.tar bridge.sqlite manifest.json > SHA256SUMS)
mkdir -p "$OUT_DIR"
ARCHIVE="$OUT_DIR/para-matrix-$STAMP.tar.gz"
tar -czf "$ARCHIVE" -C "$WORK" .
chmod 600 "$ARCHIVE"
echo "Backup created: $ARCHIVE"
echo 'This private archive contains server keys, credentials and stored events. Encrypt before off-host transfer.'
echo 'Verify with restore.sh ARCHIVE --verify; restored data and client access still require an acceptance drill.'
