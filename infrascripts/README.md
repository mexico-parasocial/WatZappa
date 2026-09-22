# infrascripts

Operational shell scripts. **`ansible/` is the maintained deployment path**;
what remains here is either a tool ansible does not replace, or part of the
separate bare-metal track.

## What was wrong with all of them

Every script defaulted `BACKEND_DIR` to `WatZappa`, i.e. it expected to be run
from a *parent* directory with `WatZappa/` inside it. They live *inside* that
repo, so every relative path missed by one level. Fourteen of them documented
their own usage as `./scripts/…`, which in this repo is a different directory
containing unrelated dev scripts.

Both are symptoms of the same thing: this directory, like `ansible/`, was
lifted from a `mvp/{scripts,ansible,WatZappa}` layout and never adapted.

Fixed across the board: the repo root now resolves from each script's own
location (works from any cwd), usage strings point at `./infrascripts/`, and
the dead `para-g0v.app` domain is replaced with `para.social`. All twenty
files parse under `bash -n`.

---

## Audit

### Keep — no ansible equivalent

| Script | Why it stays |
| --- | --- |
| `generate-secrets.sh` | Produces the stack `.env`. The ansible `app_stack` role points users at it by name and refuses to deploy without it. |
| `pre-deploy-check.sh` | 300 lines of env/secret/build validation. Complements ansible rather than duplicating it — run it before the first `site.yml`. |
| `create-admin-and-update-env.sh` | Breaks the first-admin chicken-and-egg (Ozone needs `ADMIN_DIDS`, DIDs only exist after account creation, and invites are required). Nothing in ansible does this. |
| `alpha-doctor.sh` | Reads the real `alpha_rollout` table — a live PDS feature (`packages/pds/src/account-manager/db/schema/alpha-rollout.ts`, `com.para.alpha.getRolloutStatus`), not leftovers. |
| `smoke-test-production.sh` | Public-URL verification from outside the host. Ansible's checks run on the box; this one proves the edge works. |
| `cloudflare-tunnel-local.sh` + `cloudflare-tunnel-config.yml` | Exposes a local stack over a real hostname with no VPS. The cheapest way to finish the browser-login verification the MAS repair sprint left open. |
| `pull-vps-backups.sh` | Pull-based off-site copy — production never holds credentials for the backup destination, which is the right direction. Now **requires** `VPS_SSH`; it used to default to the dead `74.50.126.41`. |
| `push-demo-repos.sh` | Pushes the demo remotes. Already resolved its own paths correctly. |

### Keep — bare-metal track

Tied to `docker-compose.local.yaml` and the 5950X box. SeaweedFS appears in
that compose file 37 times and **nowhere** in `docker-compose.prod.yaml`, so
these are not dead — they belong to a track whose fate is still an open
decision (`QUARTER_PLAN_2026Q4` S1 media decision #6: "SeaweedFS with
encryption, or amend the doc"). Resolve that decision before pruning them.

`deploy-local.sh` · `pre-deploy-local.sh` · `generate-local-env.sh` ·
`generate-seaweedfs-s3-config.sh` · `migrate-blobs-to-seaweedfs.sh` ·
`bare-metal/system-tune.sh`

### Keep — R2 blobstore

`PDS_BLOBSTORE_S3_*` in `.env.example` points at a real Cloudflare R2 endpoint,
so R2 is the production blobstore today.

`setup-r2.sh` (verification) · `migrate-blobs-to-r2.sh` (one-time; delete once
the migration is done and confirmed)

### Superseded — recommended for deletion, NOT deleted

Nothing here has been removed. Each is replaced by something in `ansible/`:

| Script | Replaced by | Delete when |
| --- | --- | --- |
| `deploy-production.sh` | `playbooks/site.yml`, `playbooks/deploy.yml` | Ansible has deployed to a real host **at least once**. It is still the only path that has ever produced a running deployment, so it stays until the replacement is proven — not before. |
| `setup-firewall.sh` | `roles/common` (UFW, fail2ban, sysctl) | Now. Ansible's version also opens port 80, which this one does not — and without 80 the ACME HTTP-01 challenge fails and every hostname serves a TLS error. |
| `backup-postgres.sh` | `roles/postgres` (systemd timer) | Now. It backs up one database of three — the Synapse and MAS databases are not covered — and connects over `localhost:5432`, which reaches nothing: no Postgres container publishes a port. |

---

## Two bugs fixed in passing

**`deploy-production.sh` could not have worked with `--with-matrix` on a fresh
host.** Both compose files declare `para-edge` as an external network, so
neither creates it; Docker fails with "network para-edge declared as external,
but could not be found". The script now creates it if absent. (Ansible's
`para_edge` role does the same.)

**`pull-vps-backups.sh` defaulted to a dead host.** Pointing at
`74.50.126.41` meant a silent no-op — the worst failure mode for a backup
tool, because it looks like it ran. `VPS_SSH` is now required.
