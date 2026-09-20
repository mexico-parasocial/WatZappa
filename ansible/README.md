# PARA infrastructure as code

Provisions **one host** and runs the whole PARA backend on it: the AT Protocol
services and the Matrix stack, behind a single Caddy edge.

This tree previously described a three-node Docker Swarm. It had never been run
against this repository — it was copied from another project (its own README
pointed at `~/Desktop/MASTER/mvp/ansible`, and `para_repo_url` named an
unrelated GitHub repo). It has been retargeted at what this repo actually
deploys and what the pilot actually needs.

---

## What it deploys

| Stack | Compose file | Services |
| --- | --- | --- |
| App | `docker-compose.prod.yaml` | postgres · redis · pds · dataplane · bsky · bsync · ozone · **caddy** |
| Matrix | `docker-compose.matrix.yaml` | synapse · synapse-db · para-idp · mas · mas-db · element-web · matrix-bridge |

Caddy is the only service bound to a public port. Everything else is either
internal to its compose network or bound to `127.0.0.1`. The two stacks reach
each other over the external `para-edge` network, which the `para_edge` role
creates — **nothing created it before**, and both compose files declare it
`external: true`, so `--with-matrix` could not have worked on a fresh host.

The Matrix stack had no infrastructure-as-code at all until now.

---

## Running it

```bash
cd ansible
ansible-galaxy collection install -r requirements.yml   # once

# 1. Put the real host in inventory/production.yml (it ships with a
#    placeholder that deliberately fails to connect).
# 2. Point DNS at it. At minimum:
#      pds.para.social  appview.para.social  ozone.para.social
#      bridge.para.social  matrix.para.social  chat.para.social  para.social
# 3. Have a .env in the repo root (infrascripts/generate-secrets.sh).

ansible-playbook playbooks/site.yml
```

Afterwards, a code-only redeploy takes well under a minute:

```bash
ansible-playbook playbooks/deploy.yml                 # both stacks
ansible-playbook playbooks/deploy.yml --tags matrix   # Matrix only
ansible-playbook playbooks/deploy.yml -e compose_build_no_cache=true
```

### Secrets

Two separate things:

- **The stack's `.env`** — every application secret. Uploaded from the control
  machine (`app_stack_env_source`, default: the repo root) with `mode: 0600`
  and `no_log`. It is `copy`d, not `template`d: running a secrets file through
  Jinja means a `{{` inside a generated password gets evaluated.
- **Ansible's own secrets** — S3 credentials, the Postgres password. These go
  in a Vault file; see `group_vars/all/vault.yml.example`.

---

## Verification built into the deploy

The playbook fails rather than reporting a success it has not checked:

- Both stacks must reach `running`, and every container that defines a
  healthcheck must reach `healthy`.
- Each Matrix service answers on its loopback port.
- `mas-cli doctor` must pass its three delegation checks (homeserver
  reachable · invalid token correctly rejected · Synapse MAS API reachable
  with authentication).
- `https://matrix.<domain>/_matrix/client/v3/login` must answer. **This is the
  check the v1.161/MAS 1.24 repair sprint could not make.** Under delegation
  Synapse stops serving `/login` and the reverse proxy must route it to MAS;
  `mas-cli doctor` reports that 404 as an error because it probes Synapse
  directly with no proxy in front. The check only means anything through the
  public edge, which is why it lives here.
- A database backup runs during the deploy. A backup system that has never
  run is not a backup system.

---

## Things this does not do, and you should know

- **No off-site backups unless you configure them.** `s3_endpoint` is empty by
  default and the role says so loudly at the end of every run. Until it is
  set, a disk failure loses the databases and their backups together.
- **No point-in-time recovery.** The recovery point is the last nightly dump.
  The previous role advertised continuous WAL shipping and PITR; nothing in
  the running stack ever enabled `archive_mode`, so that was a promise with no
  configuration behind it. It has been removed rather than left to be believed.
- **No high availability.** One host. That is the deliberate trade for the
  single-community pilot (risk R10).
- **Synapse metrics are not scraped.** Prometheus now exists and scrapes
  node-exporter, cAdvisor and the matrix-bridge — closing the S1 gap where
  metrics were produced and discarded. Synapse needs two changes first: it
  must join `para-edge` (today only matrix-bridge does), and `enable_metrics`
  must be turned on. The scrape job is present, commented, with both steps.
- **Prometheus is on loopback** with no authentication of its own. Reach it
  with `ssh -L 9090:127.0.0.1:9090 <host>`.

---

## The parked multi-node path

`playbooks/swarm.yml` refuses to run, on purpose. Two blockers, both real:

1. **No image registry.** `docker-compose.swarm.yml` pairs
   `image: para-pds:latest` with a `build:` block. `docker stack deploy`
   ignores `build:` entirely and pulls from a registry; there is no registry
   in this repo, so worker nodes have nothing to pull.
2. **No Matrix.** The Swarm compose covers seven AT Protocol services and none
   of the eight Matrix ones — chat, the thing the pilot is for, would not
   deploy.

`roles/swarm` and `roles/traefik` belong to that path and are excluded from
linting: cleaning them would imply a review they have not had. Traefik's ACME
resolver was fixed anyway (it defined both `tlsChallenge` and `httpChallenge`,
which Traefik rejects — it would never have issued a certificate), because a
latent bug in parked code is still a bug. Do not run the traefik role beside
Caddy; both bind 80 and 443.

Revisit after the pilot proves F9 in production and multi-community is
actually unblocked.

---

## Changes outside this directory

Two files had to change for any of this to work:

- `services/caddy/Caddyfile.prod` — every site address was hardcoded to
  `para-g0v.app`, which no longer resolves. Caddy would have requested Let's
  Encrypt certificates for a domain with no DNS and served a TLS error on
  every hostname. Addresses now come from `{$PARA_DOMAIN}`. The bare-domain
  block's `redir https://para.social/app` became a 404: with `PARA_DOMAIN` set
  to `para.social`, that redirect points the domain at itself and loops.
- `docker-compose.prod.yaml` — passes `PARA_DOMAIN` to the Caddy container and
  fails fast if it is unset.

Still carrying the dead domain, and **not** changed here: `.env.example`
(including `MATRIX_SERVER_NAME=matrix.para-g0v.app`, which also disagrees with
the `matrix.para.social` the running Synapse was built with). The `app_stack`
role refuses to deploy a `.env` that mentions `para-g0v.app` rather than
quietly shipping it.

---

## Verified / not verified

Verified: `ansible-lint` passes at the **production** profile with zero
findings; `ansible-playbook --syntax-check` passes for all playbooks; the
edited `Caddyfile.prod` passes `caddy validate` with `PARA_DOMAIN` set;
`docker compose config` accepts the edited prod compose; the container health
gate was tested against real `docker compose ps` output and three synthetic
failure cases; the `mas-cli doctor` assertions match the live output of the
running local stack.

Not verified: **no playbook has been run against a real host**, because there
is no host. Everything above is static validation. The first real run should
be against a throwaway VPS, not the pilot box.
