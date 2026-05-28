# Pre-Launch Security & Operations Checklist

> Last updated: 2026-05-06
>
> This checklist covers hardening steps required before promoting the Para
> backend from shared-demo / local-dev to any internet-facing environment
> (staging, preview, or production).

---

## 1. Secrets & Cryptography

| #   | Item                                                                  | Status | Notes                                                       |
| --- | --------------------------------------------------------------------- | ------ | ----------------------------------------------------------- |
| 1.1 | Rotate `PDS_JWT_SECRET` to ≥32 random chars                           | ☐      | Code now enforces minimum length in production (`!devMode`) |
| 1.2 | Rotate `PDS_ADMIN_PASSWORD` to ≥12 random chars                       | ☐      | Code now enforces minimum length in production              |
| 1.3 | Set `PDS_DPOP_SECRET` to ≥32 random chars                             | ☐      | Code now enforces presence + length in production           |
| 1.4 | Rotate PLC rotation key (`PDS_PLC_ROTATION_KEY_K256_PRIVATE_KEY_HEX`) | ☐      | Use KMS (`PDS_PLC_ROTATION_KEY_KMS_KEY_ID`) for prod        |
| 1.5 | Rotate `RELAY_ADMIN_PASSWORD`                                         | ☐      | If running Indigo relay                                     |
| 1.6 | Rotate `TAP_ADMIN_PASSWORD`                                           | ☐      | If running Indigo tap                                       |
| 1.7 | Remove `MOCK_USER_PASSWORD` from env / codebase                       | ☐      | Only used in dev tests                                      |
| 1.8 | Verify no secrets committed to git                                    | ☐      | `git log --all --full-history -p -S "jwt-secret"`           |
| 1.9 | Inject secrets from vault (1Password, Doppler, HashiCorp, etc.)       | ☐      | Never commit `.env` files with real secrets                 |

**How to generate strong secrets:**

```bash
openssl rand -base64 48   # ~64 chars, good for JWT / DPoP
openssl rand -base64 24   # ~32 chars, good for admin password (or use passphrase)
```

---

## 2. Runtime Hardening

| #   | Item                                                             | Status | Notes                                      |
| --- | ---------------------------------------------------------------- | ------ | ------------------------------------------ |
| 2.1 | `PDS_DEV_MODE=false` (or unset)                                  | ☐      | Default is `false`, but verify explicitly  |
| 2.2 | Rate limiting enabled (`PDS_RATE_LIMITS_ENABLED=true`)           | ☐      | Defaults to `!devMode` — verify at runtime |
| 2.3 | SSRF protection ON (`PDS_DISABLE_SSRF_PROTECTION=false`)         | ☐      | Defaults to `!devMode` — verify at runtime |
| 2.4 | Proxy SSRF protection ON (`PDS_DISABLE_SSRF_PROTECTION=false`)   | ☐      | Shared flag with fetch SSRF                |
| 2.5 | `PDS_BLOB_UPLOAD_LIMIT` set appropriately                        | ☐      | Default 5 MB; raise if needed for media    |
| 2.6 | `PDS_MAX_IMPORT_SIZE` set appropriately                          | ☐      | Limit repo import abuse                    |
| 2.7 | Review `PDS_RATE_LIMIT_BYPASS_KEY` & `PDS_RATE_LIMIT_BYPASS_IPS` | ☐      | Remove dev/lab IPs before launch           |

---

## 3. Database & Storage Backends

| #    | Item                                          | Status | Notes                                                         |
| ---- | --------------------------------------------- | ------ | ------------------------------------------------------------- |
| 3.1  | AppView on PostgreSQL (not SQLite)            | ☐      | Already configured via `BSKY_DB_POSTGRES_URL`                 |
| 3.2  | AppView migrations applied                    | ☐      | `pnpm migrate up` in bsky package                             |
| 3.3  | Production indexes migration applied          | ☐      | `20260507T020432000Z-add-production-indexes`                  |
| 3.4  | PDS account DB on PostgreSQL (not SQLite)     | ☐      | Requires `PDS_ACCOUNT_DB_LOCATION` pointing to Postgres URI   |
| 3.5  | PDS sequencer DB on PostgreSQL                | ☐      | Requires `PDS_SEQUENCER_DB_LOCATION` pointing to Postgres URI |
| 3.6  | PDS DID cache DB on PostgreSQL                | ☐      | Requires `PDS_DID_CACHE_DB_LOCATION` pointing to Postgres URI |
| 3.7  | PLC server on PostgreSQL or S3-backed state   | ☐      | Currently `plc.json` flat file — not prod-ready               |
| 3.8  | Blobstore on S3 / R2 / MinIO (not local disk) | ☐      | Configure `PDS_BLOBSTORE_S3_*` vars                           |
| 3.9  | Redis for rate-limit counters (not in-memory) | ☐      | `PDS_REDIS_SCRATCH_ADDRESS`                                   |
| 3.10 | Postgres backups configured                   | ☐      | Point-in-time recovery recommended                            |
| 3.11 | Blobstore versioning / lifecycle rules        | ☐      | Prevent accidental permanent deletion                         |

### Postgres connection checklist

- [ ] TLS enabled on Postgres connections (`sslmode=require` or `sslmode=verify-full`)
- [ ] Connection pooling (PgBouncer or similar) if >100 concurrent clients
- [ ] Separate read replica for AppView queries if load is high

---

## 4. Networking & TLS

| #   | Item                                                         | Status | Notes                                                    |
| --- | ------------------------------------------------------------ | ------ | -------------------------------------------------------- |
| 4.1 | Public hostname with valid TLS certificate                   | ☐      | `PDS_HOSTNAME` and `BSKY_PUBLIC_URL` must use `https://` |
| 4.2 | TLS 1.2+ only (disable TLS 1.0/1.1)                          | ☐      | Load balancer / reverse proxy setting                    |
| 4.3 | HSTS headers enabled                                         | ☐      | Reverse proxy (nginx, Traefik, Cloudflare)               |
| 4.4 | `/.well-known/` endpoints reachable                          | ☐      | Required for AT Protocol DID resolution                  |
| 4.5 | No open admin ports exposed to internet                      | ☐      | Relay/Tap admin endpoints should be VPN/internal only    |
| 4.6 | Firewall rules: only 443 → app, block direct container ports | ☐      | Docker / k8s network policy                              |
| 4.7 | DDoS protection (Cloudflare, AWS Shield, etc.)               | ☐      | Optional but recommended                                 |

---

## 5. Identity & PLC

| #   | Item                                   | Status | Notes                                            |
| --- | -------------------------------------- | ------ | ------------------------------------------------ |
| 5.1 | PLC server reachable at stable domain  | ☐      | `PLC_SERVER_URL` must be public                  |
| 5.2 | PLC rotation key stored securely (KMS) | ☐      | See 1.4                                          |
| 5.3 | DID document served correctly          | ☐      | `curl https://<host>/.well-known/did.json`       |
| 5.4 | Service DID registered in PLC          | ☐      | Verify with `com.atproto.identity.resolveHandle` |

---

## 6. Observability & Alerting

| #   | Item                                                           | Status | Notes                                            |
| --- | -------------------------------------------------------------- | ------ | ------------------------------------------------ |
| 6.1 | Structured logging configured (`LOG_LEVEL`, `LOG_DESTINATION`) | ☐      | JSON output for ingestion                        |
| 6.2 | Error tracking (Sentry, Rollbar, etc.)                         | ☐      | Capture unhandled exceptions                     |
| 6.3 | Health endpoint monitoring                                     | ☐      | `/_health` on PDS, `/xrpc/_health` on AppView    |
| 6.4 | Database connection pool saturation alerts                     | ☐      | Postgres `max_connections` / active count        |
| 6.5 | Disk space alerts (blobstore, logs)                            | ☐      | Prevent outages from full disks                  |
| 6.6 | Rate-limit tripping alerts                                     | ☐      | Sudden spike = possible abuse                    |
| 6.7 | Audit log for admin actions                                    | ☐      | Admin password changes, PDS crawl requests, etc. |

---

## 7. Moderation & Abuse

| #   | Item                                                                  | Status | Notes                                   |
| --- | --------------------------------------------------------------------- | ------ | --------------------------------------- |
| 7.1 | Ozone/mod service configured (`OZONE_SERVER_URL`, `OZONE_SERVER_DID`) | ☐      | Required for content moderation         |
| 7.2 | Report service configured (`REPORT_SERVICE_URL`)                      | ☐      | Falls back to mod service if unset      |
| 7.3 | Labeler DID configured                                                | ☐      | `EXAMPLE_LABELER` must be real for prod |
| 7.4 | hCaptcha enabled (`PDS_HCAPTCHA_SITE_KEY`, `PDS_HCAPTCHA_SECRET_KEY`) | ☐      | Prevents signup abuse                   |
| 7.5 | Invite codes required (`PDS_INVITE_REQUIRED=true`)                    | ☐      | Gate initial user growth                |

---

## 8. Dependency & Supply Chain

| #   | Item                                         | Status | Notes                                            |
| --- | -------------------------------------------- | ------ | ------------------------------------------------ |
| 8.1 | `pnpm audit` clean (no critical/high vulns)  | ☐      | Run in CI before deploy                          |
| 8.2 | Pin Docker image digests (not just tags)     | ☐      | Prevent supply-chain drift                       |
| 8.3 | Base images scanned (Trivy, Snyk, etc.)      | ☐      | OS-level CVE check                               |
| 8.4 | Node.js LTS or latest stable                 | ☐      | Currently 24.x                                   |
| 8.5 | `better-sqlite3` rebuilt for target Node ABI | ☐      | `pnpm rebuild better-sqlite3` after Node upgrade |

---

## 9. Disaster Recovery

| #   | Item                                               | Status | Notes                                              |
| --- | -------------------------------------------------- | ------ | -------------------------------------------------- |
| 9.1 | Postgres backup tested (restore to fresh instance) | ☐      | Quarterly fire drill                               |
| 9.2 | Blobstore cross-region replication                 | ☐      | S3/R2 versioning + replication rules               |
| 9.3 | PLC state backup                                   | ☐      | If still on JSON file, copy to S3 nightly          |
| 9.4 | Runbook for PDS repo recovery                      | ☐      | How to replay from relay firehose                  |
| 9.5 | Documented RTO / RPO targets                       | ☐      | Recovery Time Objective / Recovery Point Objective |

---

## 10. Launch-Day Verification Commands

Run these after deploying to the production host:

```bash
# 1. Health checks
curl -sf https://<pds-host>/xrpc/_health
curl -sf https://<appview-host>/xrpc/_health

# 2. DID resolution
curl -sf https://<pds-host>/.well-known/did.json
curl -sf "https://<plc-host>/xrpc/com.atproto.identity.resolveHandle?handle=<test-handle>"

# 3. Feed generator list (requires auth)
curl -sf -H "Authorization: Bearer <token>" \
  "https://<pds-host>/xrpc/app.bsky.feed.getFeedGenerators?feeds=at://<did>/app.bsky.feed.generator/<rkey>"

# 4. Admin auth works
curl -sf -u "admin:<ADMIN_PASSWORD>" \
  "https://<pds-host>/xrpc/com.atproto.admin.getSubjectStatus?did=<did>"

# 5. Blob upload limit enforced
curl -sf -X POST -H "Content-Type: image/png" \
  --data-binary @/dev/zero \
  "https://<pds-host>/xrpc/com.atproto.repo.uploadBlob" | jq '.error'  # expect BlobTooLarge

# 6. Rate limits trip
curl -sf "https://<pds-host>/xrpc/com.atproto.identity.resolveHandle?handle=test" \
  -w "%{http_code}\n"  # repeat 100× rapidly, expect 429

# 7. SSRF blocked
curl -sf "https://<pds-host>/xrpc/com.atproto.sync.getRepo?did=did:web:169.254.169.254" \
  -w "%{http_code}\n"  # expect 400/403
```

---

## Appendix: Env-Var Quick Reference

### PDS (critical)

```
PDS_HOSTNAME              # public domain, no scheme
PDS_SERVICE_DID           # did:web:<hostname>
PDS_JWT_SECRET            # ≥32 random chars
PDS_ADMIN_PASSWORD        # ≥12 random chars
PDS_DPOP_SECRET           # ≥32 random chars
PDS_DEV_MODE              # MUST be false
PDS_RATE_LIMITS_ENABLED   # true
PDS_BLOBSTORE_S3_BUCKET
PDS_BLOBSTORE_S3_REGION
PDS_BLOBSTORE_S3_ACCESS_KEY_ID
PDS_BLOBSTORE_S3_SECRET_ACCESS_KEY
PDS_BLOBSTORE_S3_ENDPOINT # for R2/MinIO
PDS_ACCOUNT_DB_LOCATION   # postgres://...
PDS_SEQUENCER_DB_LOCATION # postgres://...
PDS_DID_CACHE_DB_LOCATION # postgres://...
PDS_REDIS_SCRATCH_ADDRESS # redis://...
```

### AppView (critical)

```
BSKY_DB_POSTGRES_URL      # postgres://...
BSKY_PUBLIC_URL           # https://...
```

### Relay / Tap (if used)

```
RELAY_ADMIN_PASSWORD
TAP_ADMIN_PASSWORD
DATABASE_URL              # relay/tap postgres
```

---

## Sign-Off

| Role             | Name | Date | Signature |
| ---------------- | ---- | ---- | --------- |
| Security Lead    |      |      |           |
| Infra Lead       |      |      |           |
| Backend Lead     |      |      |           |
| On-Call Engineer |      |      |           |
