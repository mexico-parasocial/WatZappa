#!/usr/bin/env bash
set -euo pipefail
container="para-bridge-test-pg-$(date +%s)-$$"
cleanup() { docker stop "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT
# Disposable database bound only to loopback; never use the deployed database.
docker run --rm -d --name "$container" -e POSTGRES_PASSWORD=bridge-test-only -e POSTGRES_DB=bridge_test -p 127.0.0.1::5432 postgres:16-alpine >/dev/null
ready=false
for attempt in {1..100}; do
  if docker exec "$container" pg_isready -U postgres -d bridge_test >/dev/null 2>&1; then ready=true; break; fi
  sleep 0.2
done
if [ "$ready" != true ]; then exit 1; fi
port="$(docker port "$container" 5432 | head -1 | sed 's/.*://')"
export MATRIX_TEST_DATABASE_URL="postgresql://postgres:bridge-test-only@127.0.0.1:${port}/bridge_test"
pnpm --config.verify-deps-before-run=false test
