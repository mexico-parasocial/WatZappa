# Paramx Shared Demo Runbook

This runbook sets up a persistent shared demo for `paramx.social` using the local atproto stack in this repo.

## Goal

Run a demo where:

- PDS identity is `pds.paramx.social`
- AppView identity is `appview.paramx.social`
- PLC, PDS data, Postgres, and Redis survive normal process restarts
- the civic seed can be applied against a stable public PDS URL

## What this repo now supports

- Persistent local Postgres + Redis via `packages/dev-infra/with-redis-and-db.sh`
- Persistent `dev-env` launch via `make run-dev-env-persistent`
- Optional PLC Postgres backing via `DEV_ENV_PLC_DB_POSTGRES_URL`
- Fixed PDS data/blob directories via:
  - `DEV_ENV_PDS_DATA_DIRECTORY`
  - `DEV_ENV_PDS_BLOBSTORE_DIRECTORY`

## Recommended host split

- Backend host: PDS, AppView, PLC, Postgres, Redis
- Model host: local inference only

This keeps civic demo traffic and model experimentation isolated.

## 1) DNS and tunnel plan

Use subdomains, not the root domain:

- `pds.paramx.social`
- `appview.paramx.social`

If you are using ngrok custom domains:

1. Reserve both domains in ngrok.
2. Add the `CNAME` records ngrok gives you in the DNS zone for `paramx.social`.
3. Keep the tunnel config on the backend host.

Example ngrok config shape:

```yaml
version: 3
agent:
  authtoken: <your-token>
endpoints:
  pds:
    url: https://pds.paramx.social
    upstream:
      url: http://localhost:2583
  appview:
    url: https://appview.paramx.social
    upstream:
      url: http://localhost:2584
```

## 2) Prepare shared-demo env

From the `watx/` repo root:

```bash
cp -n .env.shared-demo.example .env.shared-demo
```

Adjust paths if this host should store data somewhere else.

Recommended storage root on the backend machine:

- `~/.paramx-demo/pds`
- `~/.paramx-demo/blobstore`

## 3) Start the public tunnels first

If `DEV_ENV_PDS_HOSTNAME` and `DEV_ENV_BSKY_PUBLIC_URL` point at ngrok domains,
those tunnels must already be up before you start the persistent backend.

Reserved-domain example:

```bash
ngrok http --url=https://pds.paramx.social.ngrok.pro 2583
ngrok http --url=https://appview.paramx.social.ngrok.pro 2584
```

If you use random tunnel URLs instead:

```bash
ngrok http 2583
ngrok http 2584
```

Then update `.env.shared-demo` so:

- `DEV_ENV_PDS_HOSTNAME` matches the PDS tunnel hostname only
- `DEV_ENV_BSKY_PUBLIC_URL` matches the full AppView tunnel URL

If you skip this step, `make run-dev-env-persistent` can fail during bootstrap
with `XRPCError: fetch failed` / `UND_ERR_CONNECT_TIMEOUT` while creating the
service identities.

## 4) Start the persistent backend stack

```bash
make run-dev-env-persistent
```

This does three important things:

1. uses persistent Docker services `db` and `redis`
2. stores PDS repo/blob data in fixed host paths
3. stores PLC operations in Postgres instead of the in-memory mock DB
4. skips the generic dev-env mock dataset so the civic seed is the primary demo data

Useful variant with logs:

```bash
make run-dev-env-persistent-logged
```

## 5) Verify health

Local:

```bash
curl http://localhost:2583/xrpc/_health
curl http://localhost:2584/xrpc/_health
```

Public:

```bash
curl https://pds.paramx.social/xrpc/_health
curl https://appview.paramx.social/xrpc/_health
```

## 6) Seed the civic demo

From the `PARA/` app root:

```bash
node ./scripts/civic-seed/index.mjs apply \
  --service https://pds.paramx.social \
  --credentials <credentials.json>
```

To inspect without writing:

```bash
node ./scripts/civic-seed/index.mjs apply \
  --service https://pds.paramx.social \
  --credentials <credentials.json> \
  --dry-run
```

To clear only the managed demo records:

```bash
node ./scripts/civic-seed/index.mjs reset \
  --service https://pds.paramx.social \
  --credentials <credentials.json>
```

## 7) Expected persistence behavior

Persists across normal restarts:

- Postgres-backed PLC state
- AppView/Ozone schemas in Postgres
- Redis cache state
- PDS repo data
- PDS blobs

Will be lost if you remove the persistent Docker volumes or delete the PDS storage directories.

## 8) Reset points

To clear civic demo content only:

- run the seed `reset`

To fully reset appview/ozone/plc database state:

- stop the demo
- remove the persistent Docker volumes from `packages/dev-infra/docker-compose.yaml`

To fully reset PDS repo/blob state:

- delete the directories under `DEV_ENV_STORAGE_ROOT`

## 9) Notes

- This is a shared demo/staging path, not full production hardening.
- For a real public deployment, move tunnels to a dedicated host or reverse proxy and add monitoring/backups.
- Storage is persistent, but the `dev-env` bootstrap still creates some service identities during startup. If you later hit restart collisions, keep the same demo process running and treat full restart-hardening as the next infra task.
