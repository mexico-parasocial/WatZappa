# Matrix operations and recovery

**Scope: WatZappa's standalone `docker-compose.matrix.yaml` and shared local
acceptance evidence.** Reviewed 2026-10-14 against the scripts. VLPDS deployments
must use their [platform backup guide](../../vlpds/para/docs/RESPALDOS.md) and
[Matrix setup guide](../../vlpds/para/docs/MATRIX.md), since their topology differs.
Architecture and stable decisions are in [MATRIX_V2.md](MATRIX_V2.md).

## Local stack

From WatZappa, after generating the required configuration:

```sh
scripts/matrix-stack.sh doctor
scripts/matrix-stack.sh up
scripts/matrix-stack.sh element-local
scripts/matrix-stack.sh status
```

The wrapper resolves the repo root and Compose project `watzappa`, validates
mount sources and starts Synapse, its database, MAS, its database, IdP and
Element. It does not start the container bridge by default: local development
runs the host bridge through `make run-dev-env`. `--with-bridge` selects the
container bridge; release port 3001 before switching. Use `deploy/matrix/setup.sh`
and `setup-mas.sh` only for initial/reviewed configuration; do not regenerate
live credentials as a repair step. See the [security runbook](../deploy/matrix/RUNBOOK_SECURITY_ES.md).

`element-local` applies a local proxy override for Element at
`http://localhost:8082`; apply it again after a normal stack `up`. The proxy
routes auth endpoints to MAS and the remaining Matrix API to Synapse. Local
IdP browser URLs must use a browser-reachable origin, while internal token/JWKS
URLs may use Docker hostnames. `localhost` works on this Mac/simulators, not a
phone on a different host. Verify PKCE and the actual public URLs after changes.

Health, an IdP approval page and an `m.room.encryption` event do not prove an
authorized device joined or can decrypt. With delegated auth the supported
client path is OIDC → actual-device attestation → verified community join;
`/api/matrix-token` may return `503 MATRIX_CLIENT_LOGIN_REQUIRED`. Never replace
that path with an appservice/admin token. Follow the
[client contract](../services/matrix-bridge/docs/CLIENT_INTEGRATION.md).

## What the legacy archive covers

[backup.sh](../deploy/matrix/backup.sh) creates a mode-0600
`backups/para-matrix-<UTC-stamp>.tar.gz` with checksums and a manifest:

| Archive member  | Captured state                                    | Limit                                                                                   |
| --------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `postgres.dump` | Synapse database, using the container's `pg_dump` | Transactionally consistent for that database only.                                      |
| `config.tar`    | Generated Synapse config and signing key          | Does not include MAS or IdP config/secrets.                                             |
| `media.tar`     | Synapse `media_store`                             | Volume selection is by name match; verify the correct Compose project.                  |
| `bridge.tar`    | Optional bridge volume when present               | A live volume tar is not a coherent SQLite backup; PostgreSQL bridge state is excluded. |

**This is a partial Synapse archive, not a complete backup of today's MAS
stack.** Missing obligations include MAS database/config, IdP keys/config,
`.env`/other operator credentials, a coherent bridge backup, M8/PDS state and
client crypto stores/recovery keys. The script does not stop writers or create
one coordinated snapshot across these components. Keep the Synapse signing key
with encrypted, off-host recovery material; do not regenerate the server's
identity after data loss.

For a reviewed standalone Synapse backup:

```sh
./deploy/matrix/backup.sh
age -r <recipient> -o para-matrix-<stamp>.tar.gz.age para-matrix-<stamp>.tar.gz
```

The archive contains secrets and message data. Encrypt it before shipping and
verify the copied archive. Nightly shipping and quarterly isolated restore
exercises are the pilot baseline; the script performs neither scheduling,
off-host shipping nor pruning. Retention is an operator decision. Local media
is not encrypted by this archive procedure, and there is no point-in-time
recovery configured by these scripts.

## Restore limitations and acceptance

[restore.sh](../deploy/matrix/restore.sh) invokes Compose `down -v`, replaces
Synapse config and recreates its database with `C` collation (F11). In today's
Compose topology, **`down -v` also removes MAS volumes which this archive does
not restore**. Do not use this script as a complete MAS/IdP/bridge recovery
procedure. Its restore path also suppresses some `pg_restore` errors and may
miss a bridge volume after removal. A healthy Synapse endpoint cannot establish
successful recovery.

The 2026-08-20 destroy/rebuild drill recovered the then-tested signing key,
login and a prior message. That dated single-node result does not certify the
current delegated-auth stack, production-sized data, bridge restoration or
client keys. Expand/review the recovery procedure for the chosen topology
before its next release; for VLPDS use its platform procedure.

Run the drill on an isolated target after recording revisions, volume identities,
backup timestamps and expected counts. Acceptance requires:

1. Identical Synapse signing-key checksum and expected user/room/event/media
   data. Confirm `C` collation and actual restore errors, not only service health.
2. Restored MAS/IdP/bridge credentials and data, then a known user's real OIDC
   login, correct device attestation and room membership.
3. A pre-backup message/media item readable using a valid client session; for
   encrypted rooms, separately restore/verify client keys on another device.
4. Current authorization, role removal and federation hardening survive;
   unauthenticated `publicRooms` is refused.
5. Consumer checkpoints and retained event history agree with restored data.
   A new firehose source requires reviewed checkpoint migration, not cursor zero.

## Local acceptance evidence — 2026-09-26

The local run reached healthy Synapse/MAS/IdP/PDS/bridge, successful `whoami`
and room listing, Nginx configuration checks and Element's **Waiting for
approval** page. It did not authorize a Matrix device or establish multi-device
recovery. Three synthetic governance memberships existed; joins were deferred.

Corrections established during that run:

- Local Element proxy and browser-reachable IdP issuer replaced production and
  Docker-only browser URLs, preserving PKCE and generated credentials.
- The bridge's SQLite/PostgreSQL sync-log queries now return camelCase fields,
  allowing the retry worker to dispatch failed role/revocation records; a
  database-backed regression covered retries and successful removal.
- A stale advertised homeserver was replaced with the local origin; port 3001
  needed exclusive host-bridge ownership. Use the normal launcher on restart,
  not the old process IDs from that session.
- A `FutureCursor` on the disposable TypeScript fixture was handled by a private
  backup and an explicitly reviewed local reset. This is not a production
  repair strategy, and does not apply to rsky/Indigo cursor conversion.

Fixture identifiers retained for the linked device ledger:
`at://did:plc:ojdr3xwwixadijm4rqt72cvd/com.para.community.board/3mwfrslsoxq2i`,
room `!wLxCNKMEDPDIjavmsa:matrix.para.social`, encryption state
`m.megolm.v1.aes-sha2`. Their continued availability is unverified. An earlier
room-creation fixture hit rate limits; failed space creation was not
established as automatically recovered. The owner fixture cannot substitute
for a moderator-only demotion test.

Private artifacts were placed under `/tmp/para-chat-acceptance` with directory
mode 0700/files 0600. They are ephemeral and must not be copied into reports.
The [client device acceptance ledger](../../PARA/docs/MATRIX-CHAT-DEVICE-ACCEPTANCE-2026-09-26.md)
retains the incomplete login, recovery, decryption and moderator-role scenarios.
No services or destructive restore commands were run during this docs cleanup.
