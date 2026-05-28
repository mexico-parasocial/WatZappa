# Indigo DevOps Guide

This document explains how to use `indigo` operationally with this repo, and what changes are recommended to make that integration production-ready.

## Indigo Docs Reviewed

Primary references used:

- Local copy in this repo:
  - `indigo-main/README.md`
  - `indigo-main/HACKING.md`
  - `indigo-main/cmd/relay/README.md`
  - `indigo-main/cmd/rainbow/README.md`
  - `indigo-main/cmd/tap/README.md`
  - `indigo-main/example.dev.env`
- Upstream references:
  - <https://github.com/bluesky-social/indigo>
  - <https://atproto.com/specs/sync>

## Repo Assessment (Current State)

- `indigo-main/` exists in this repo and includes relay/rainbow/tap code and Make targets.
- Main app stack here is TypeScript-first (`packages/pds`, `packages/bsky`, `packages/dev-env`).
- Local dev env for this repo uses fixed local ports:
  - PLC: `2582`
  - PDS: `2583`
  - AppView: `2584`
- There are no top-level Make targets or Compose profile in this repo that orchestrate Indigo services directly.
- CI/build pipelines here are focused on the TS workspace; Indigo Go build/test is not wired into root CI.

## Recommended Changes (Proposed)

Priority 1:

1. Add root Make wrappers for Indigo operations:
   - `run-indigo-relay`
   - `run-indigo-tap`
   - `run-indigo-rainbow`
   - `test-indigo` / `build-indigo`
2. Add `docker-compose.indigo.yml` (or Compose profile) for:
   - relay
   - tap/rainbow (optional)
   - persistent volumes for relay/tap data
3. Add `.env` templates for Indigo runtime variables and secrets:
   - `RELAY_ADMIN_PASSWORD`
   - `DATABASE_URL`
   - `RELAY_PERSIST_DIR`
   - `TAP_ADMIN_PASSWORD`

Priority 2:

1. Add CI jobs to validate Indigo changes:
   - `go test ./...` in `indigo-main`
   - `go build ./cmd/relay ./cmd/tap ./cmd/rainbow`
2. Add monitoring bootstrap:
   - scrape config for Prometheus endpoints
   - alert rules for relay lag/replay window issues
3. Add runbook docs for incidents:
   - stuck crawl
   - excessive replay window growth
   - relay restart/warmup behavior

## Local DevOps Runbook

### 1) Start this repo's local network

From repo root:

```bash
make run-dev-env
```

This brings up local PLC/PDS/AppView on `2582/2583/2584`.

For staging-like demos, set public identity URLs while still running locally:

```bash
DEV_ENV_PDS_HOSTNAME=pds-demo.example.com \
DEV_ENV_BSKY_PUBLIC_URL=https://appview-demo.example.com \
make run-dev-env
```

### 2) Start Indigo Relay

In another terminal:

```bash
cd indigo-main
cp -n example.dev.env .env
make run-dev-relay
```

Default local relay port is `2470`.

### 3) Register local PDS for crawl

Use relay admin API to request crawling from local PDS:

```bash
http --ignore-stdin POST :2470/admin/pds/requestCrawl -a admin:localdev hostname=pds-demo.example.com
```

Important: relay host checks reject localhost/private IP hosts by design. Use a publicly reachable hostname (TLS tunnel or staging domain) for requestCrawl.

### 4) Verify firehose output

```bash
websocat ws://localhost:2470/xrpc/com.atproto.sync.subscribeRepos
```

Or via health endpoint:

```bash
curl -s http://localhost:2470/xrpc/_health
```

### 5) Optional: Run Tap against Relay

```bash
cd indigo-main
TAP_RELAY_URL=http://localhost:2470 \
TAP_PLC_URL=http://localhost:2582 \
go run ./cmd/tap run --disable-acks=true
```

Then in another terminal:

```bash
websocat ws://localhost:2480/channel
```

Add a DID to track:

```bash
curl -X POST http://localhost:2480/repos/add \
  -H "Content-Type: application/json" \
  -d '{"dids":["did:plc:ewvi7nxzyoun6zhxrhs64oiz"]}'
```

## Production Notes

- Prefer PostgreSQL for relay/tap in production (not sqlite).
- Put relay behind a reverse proxy/load balancer with WebSocket support.
- Persist replay/backfill stores on fast disks (NVMe preferred).
- Set explicit admin credentials and keep them in secret storage.
- Monitor bandwidth/egress carefully; relay can be egress-heavy.

## Minimal Operational Checklist

Before launch:

1. PostgreSQL provisioned and reachable.
2. Relay and tap/rainbow env vars defined and secrets injected.
3. Prometheus scraping + basic alerts enabled.
4. Backup/restore process tested for operational DBs.
5. Restart procedure tested (cold start, crawl recovery, firehose reconnect).
