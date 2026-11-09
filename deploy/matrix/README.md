# PARA Matrix Homeserver

Self-hosted, non-federated Matrix for community chat: Synapse, the Matrix
Authentication Service (MAS), para-idp, Element Web and the PARA bridge, all in
[`docker-compose.matrix.yaml`](../../docker-compose.matrix.yaml).

```
phone / browser ──► auth.<domain>  MAS ──► idp.<domain>/authorize  para-idp (proves the PARA key)
                ──► matrix.<domain> Synapse (client API only; auth delegated to MAS)
                ──► bridge.<domain> matrix-bridge (verified joins, roles, moderation)
moderators      ──► chat.<domain>   Element Web
```

Synapse is the homeserver. Alternative homeservers are outside pilot scope
(`docs/QUARTER_PLAN_2026Q4.md`).

## Deploy

1. In the repo-root `.env`:

   ```bash
   MATRIX_SERVER_NAME=matrix.para.social      # immutable: baked into every MXID
   MATRIX_MAS_PUBLIC_URL=https://auth.para.social
   MATRIX_IDP_PUBLIC_URL=https://idp.para.social
   MATRIX_MAS_CLIENT_SECRET=<openssl rand -hex 32>
   POSTGRES_PASSWORD=<strong secret>          # required; there is no default
   PDS_FIREHOSE_URL=wss://pds.para.social
   BRIDGE_AUTHORITY_APPVIEW_URL=https://appview.para.social
   PARA_AUTHORITY_SERVICE_TOKEN=<same value as the AppView>
   ```

2. Run `deploy/matrix/deploy-prod.sh` on the server. It generates the Synapse
   and MAS configuration (once; never regenerate against a live server — the
   signing and encryption keys live there), migrates MAS, starts the stack and
   stops to tell you how to issue the bridge's admin token from MAS. Re-run it
   after putting `MATRIX_ADMIN_TOKEN` in `.env`. On an Ansible-managed host,
   `ansible/roles/matrix_stack` does the same.

3. Edge routes are in [`services/caddy/Caddyfile.prod`](../../services/caddy/Caddyfile.prod)
   (containerised Caddy on the `para-edge` network). For a host-run Caddy use
   [`Caddyfile.matrix`](./Caddyfile.matrix). Both refuse `/_synapse/admin`,
   `/_synapse/mas`, `/_synapse/metrics`, federation and key paths, and the
   bridge's `/metrics`.

## Security model

- Federation is closed: empty `federation_domain_whitelist`, and Synapse's
  only HTTP listener serves the `client` resource ([`hardening.yaml`](./hardening.yaml)).
- No password login anywhere: MAS owns authentication and para-idp proves
  possession of the PARA identity key. Account names are derived from that key.
- The bridge never creates accounts or maps DIDs to MXIDs; joins are pull-based
  and proof-bearing. See [`services/matrix-bridge/AGENTS.md`](../../services/matrix-bridge/AGENTS.md).

## Monitoring

Prometheus (`ansible/roles/monitoring`) scrapes the bridge and Synapse's
metrics listener over `para-edge`, probes MAS, para-idp, Element and the public
routes through a blackbox exporter, checks that the edge still answers 404 for
admin, federation and metrics paths, and loads [`alerts.yml`](./alerts.yml).
Alertmanager delivers to the receivers set in `group_vars` (`alertmanager_*`:
email, Telegram or Slack); with none set, the role warns and nobody is paged.

## Backups

`para-matrix-backup.timer` (scheduled by `ansible/roles/matrix_stack` once
`matrix_backup_age_recipients` and `s3_endpoint` are set) runs
[`nightly-backup.sh`](./nightly-backup.sh): [`backup.sh`](./backup.sh), age
encryption to public keys whose identities stay off the host, upload to S3 and
a freshness metric that `ParaMatrixBackupStale` watches. Restore with
[`restore.sh`](./restore.sh); see [`docs/MATRIX_BACKUP.md`](../../docs/MATRIX_BACKUP.md).
`scripts/matrix-restore-drill.sh` rehearses the whole path on a disposable copy.

## Changing the public URLs

[`set-public-urls.sh`](./set-public-urls.sh) moves an existing MAS + para-idp
configuration to new auth./idp. hosts (dry run first, then `--apply`).

## Local development and smoke

`make matrix-up` starts the stack locally (`scripts/matrix-stack.sh`; never a
bare `docker compose` from another directory). `make matrix-smoke` proves the
appservice registration, transaction push/dedup, SSE delivery and device
session minting against a real Synapse.

## Guides

- 🇪🇸 Guía de Usuario: [`GUIA_USUARIO_ES.md`](./GUIA_USUARIO_ES.md)
- 🇪🇸 Guía de Administración: [`GUIA_ADMIN_ES.md`](./GUIA_ADMIN_ES.md)
- 🇪🇸 Runbook de seguridad: [`RUNBOOK_SECURITY_ES.md`](./RUNBOOK_SECURITY_ES.md)
