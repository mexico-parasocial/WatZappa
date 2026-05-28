# Para Backend + DevOps Guide

This runbook explains how the Para backend is wired in this repository and how to operate it locally with Indigo.

## 1) Architecture Overview

Para is implemented across two core services in this monorepo:

- `packages/pds` (PDS): auth boundary, repo writes, proxied reads, read-after-write splice-in.
- `packages/bsky` (AppView): indexing and query serving for Para feed/thread/meta/profile stats.

Optional downstream infra:

- `indigo-main/cmd/relay`: firehose aggregation.
- `indigo-main/cmd/tap`: filtered sync fanout for Para collections.

### Request path

1. Client writes Para records via `com.atproto.repo.createRecord` to PDS.
2. PDS stores records in repo storage and enforces Para-specific invariants on constrained collections.
3. Read queries to `com.para.*` hit PDS handlers.
4. PDS proxies to AppView and applies read-after-write munging for Para feed/thread/posts when needed.
5. AppView serves indexed Para views from data-plane tables.

## 2) What Was Added for Indigo Compatibility

These repo changes were made so Indigo can work with Para lexicons and operations:

- Added `com.para` package entry in `indigo-main/cmd/lexgen/bsky.json`.
- Added root Make target to sync Para lexicons into Indigo tree:
  - `make sync-indigo-para-lexicons`
- Added root Make target for lexgen with Para included:
  - `make lexgen-indigo`
- Added Indigo helper targets:
  - `make build-indigo`
  - `make test-indigo`
  - `make run-indigo-relay`
  - `make run-indigo-tap-para`

`run-indigo-tap-para` uses:

- `TAP_SIGNAL_COLLECTION=com.para.post`
- `TAP_COLLECTION_FILTERS=com.para.post,com.para.status,com.para.social.postMeta`

So Tap discovers repos via Para post activity and emits only Para-relevant records.

## 3) Local Development Workflow

### Prerequisites

- `nvm` installed and Node 22 available.
- `pnpm` available through `corepack`.
- Docker running.
- Go toolchain installed (for Indigo commands).

### Bootstrap workspace

```bash
make nvm-setup
make deps
make build
```

### Start local PDS + AppView network

```bash
make run-dev-env
```

Expected local endpoints:

- PLC: `http://localhost:2582`
- PDS: `http://localhost:2583`
- AppView: `http://localhost:2584`

### Start dev-env with production-like public hostnames

`packages/dev-env` now supports env overrides so you can keep local wiring but advertise public HTTPS identities for relay/tunnel demos.

Example:

```bash
DEV_ENV_PDS_HOSTNAME=pds-demo.example.com \
DEV_ENV_BSKY_PUBLIC_URL=https://appview-demo.example.com \
make run-dev-env
```

Useful knobs:

- `DEV_ENV_PDS_HOSTNAME` (default `localhost`)
- `DEV_ENV_BSKY_PUBLIC_URL` (default `http://localhost:2584`)
- `DEV_ENV_ENABLE_DID_DOC_WITH_SESSION` (default `true`; set `false` if dev-env bootstrap errors while using public tunnel hostnames)
- `DEV_ENV_PLC_PORT`, `DEV_ENV_PDS_PORT`, `DEV_ENV_BSKY_PORT`, `DEV_ENV_OZONE_PORT`, `DEV_ENV_CHAT_PORT`, `DEV_ENV_INTROSPECT_PORT`

### Start a persistent shared demo

For a stable demo host with persistent PLC/PDS/Postgres/Redis storage, use:

```bash
cp -n .env.shared-demo.example .env.shared-demo
make run-dev-env-persistent
```

This path is documented in [`PARAMX_SHARED_DEMO.md`](./PARAMX_SHARED_DEMO.md).

### Start Indigo relay

In another terminal:

```bash
make run-indigo-relay
```

Relay endpoint:

- `http://localhost:2470`

### Ask relay to crawl local PDS

```bash
http --ignore-stdin POST :2470/admin/pds/requestCrawl -a admin:localdev hostname=pds-demo.example.com
```

Note: modern relay host checks reject localhost/private addresses for crawl validation. Use a publicly reachable hostname (usually a TLS tunnel or staging domain).

### Start Tap for Para collections

In another terminal:

```bash
make run-indigo-tap-para
```

Tap endpoint:

- `http://localhost:2480`

### Subscribe to Tap output

```bash
websocat ws://localhost:2480/channel
```

You should receive JSON events scoped to Para collections after adding tracked repos or after signal discovery.

## 4) Lexicon + Codegen Workflow

When Para lexicons change:

1. Update source lexicons under `lexicons/com/para/`.
2. Regenerate TypeScript SDK/server types:

```bash
make codegen
```

3. Regenerate Indigo Go lexicon bindings:

```bash
make lexgen-indigo
```

This keeps TS and Go stacks aligned with the same Para NSID surface.

## 5) Testing Matrix

### Full project tests

```bash
make test
```

### Para-focused tests

```bash
pnpm --filter @atproto/pds test -- tests/proxied/para-read-after-write.test.ts
pnpm --filter @atproto/pds test -- tests/crud.test.ts
pnpm --filter @atproto/bsky test -- tests/views/para-feed.test.ts tests/data-plane/para-queries.test.ts
```

## 6) Operations and Observability

### Health endpoints

- PDS/AppView local env: managed by `packages/dev-env` test stack.
- Relay health: `GET /xrpc/_health` on `:2470`.
- Tap health: `GET /health` on `:2480`.

### Common runtime issues

### Node ABI mismatch (e.g. `better-sqlite3`)

If Node major changed, rebuild deps under the repo Node version from `.nvmrc`:

```bash
nvm use
pnpm install --frozen-lockfile
pnpm --filter @atproto/pds rebuild better-sqlite3
```

### `nvm` not found inside make

If `make nvm-setup` fails, ensure `$HOME/.nvm/nvm.sh` exists and shell init installed NVM correctly.

## 7) Production Guidance for Para + Indigo

- Relay is app-agnostic; it does not validate records against lexicons.
- Treat PDS/AppView as source of Para business invariants.
- Use Postgres for Relay/Tap in production.
- Set explicit admin credentials:
  - `RELAY_ADMIN_PASSWORD`
  - `TAP_ADMIN_PASSWORD`
- Monitor replay/backfill lag and websocket delivery behavior.
- If you need Para-specific search/ranking in Indigo `palomar`, add Para schemas/transform paths; current search code is bsky-centric.

## 8) Minimal Day-2 Checklist

1. Validate migrations applied for Para tables in AppView.
2. Verify PDS read-after-write headers appear on Para feed/thread/posts reads.
3. Verify Tap emits Para collection events only.
4. Verify recompute of `para_profile_stats` after post/meta/like activity.
5. Exercise rollback path for malformed `com.para.social.postMeta` writes.
