# Bare-Metal Deploy Runbook

This folder contains a first-pass bare-metal deployment shape for the PARA backend.
It targets one Linux host running Caddy, systemd, Postgres, Redis, and the Node
backend processes directly on the host.

## Target Shape

```text
Internet
  -> Caddy :80/:443
    -> pds.example.com     -> 127.0.0.1:2583
    -> appview.example.com -> 127.0.0.1:2584
    -> web.example.com     -> 127.0.0.1:8100

systemd
  -> para-dev-env.service

system packages
  -> postgresql
  -> redis-server

persistent disk
  -> /srv/para/pds
  -> /srv/para/blobstore
```

## Assumptions

- Ubuntu/Debian-style host.
- DNS records already point to the server:
  - `pds.example.com`
  - `appview.example.com`
  - `web.example.com`
- Node 22 and pnpm are available to the deploy user.
- Postgres and Redis are system services, not app containers.
- The repo is checked out at `/opt/para/final`.
- The backend package root is `/opt/para/final/WhatZatppa`.

## One-Time Server Setup

Run as root:

```bash
cd /opt/para/final/WhatZatppa
sudo deploy/bare-metal/scripts/bootstrap-server.sh
```

Then copy and edit the environment file:

```bash
sudo cp deploy/bare-metal/env.production.example /etc/para/para-backend.env
sudo editor /etc/para/para-backend.env
```

Install Caddy config:

```bash
sudo cp deploy/bare-metal/Caddyfile /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Install systemd service:

```bash
sudo cp deploy/bare-metal/systemd/para-dev-env.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now para-dev-env
```

## Build And Restart

Run as the deploy user:

```bash
cd /opt/para/final/WhatZatppa
pnpm install --frozen-lockfile
pnpm build
sudo systemctl restart para-dev-env
```

## Health Checks

```bash
deploy/bare-metal/scripts/healthcheck.sh
```

Or manually:

```bash
curl -fsS http://127.0.0.1:2583/xrpc/_health
curl -fsS http://127.0.0.1:2584/xrpc/_health
curl -fsS https://pds.example.com/xrpc/_health
curl -fsS https://appview.example.com/xrpc/_health
```

## Persistence

The backend should survive normal service restarts because:

- Postgres stores AppView/Ozone service state.
- Redis is a system service with append-only or snapshot persistence as configured by the host.
- PDS data and blobs live under `/srv/para`.

Do not delete these paths unless intentionally resetting the environment:

```text
/srv/para/pds
/srv/para/blobstore
```

## Backups

At minimum, back up:

- Postgres database referenced by `DB_POSTGRES_URL`
- `/srv/para/pds`
- `/srv/para/blobstore`
- `/etc/para/para-backend.env`
- `/etc/caddy/Caddyfile`

This folder intentionally does not include an automated backup job yet. Add one
after the first successful host deploy, once database name, backup destination,
and retention policy are final.

## Known Follow-Ups

- Split the monolithic dev-env launcher into dedicated production services when
  the service boundaries are stable.
- Add CI checks for `@atproto/dev-env` plumbing tests.
- Fix the broader repo build/codegen issue around missing generated
  `com.atproto.temp/*` API type files.
- Add backup and restore scripts.
