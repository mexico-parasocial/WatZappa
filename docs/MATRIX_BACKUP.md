# Matrix backup and restore

`deploy/matrix/backup.sh` · `deploy/matrix/restore.sh`

Verified end to end on 2026-08-20: a full stack was destroyed (`down -v`, config
directory deleted) and rebuilt from an archive alone. The signing key came back
byte-identical, the user logged in, and a message sent before the backup was
readable after the restore. The drill is in §4 — run it, don't trust this
paragraph.

---

## 1. What is protected, and what losing it costs

| Item | Where | If you lose it |
|---|---|---|
| **Signing key** | `deploy/matrix/synapse/<server>.signing.key` | **Terminal.** This is the server's identity. Every account, room and event signature becomes unverifiable. There is no recovery — only a new server name and starting over. |
| Postgres | `synapse-db` volume | Every user, room and message. |
| Media | `synapse_data` volume, `/data/media_store` | Every uploaded file. Messages referencing them survive as broken links. |
| Bridge database | `bridge_data` volume | Community↔space mappings, moderation history, deliberation cards. Rebuildable from the firehose with effort. |

Everything on this list except the signing key is painful. The signing key is
unrecoverable, and it currently exists on exactly one machine — which is the
reason this procedure exists.

**Not covered here:** the M8 identity service and its encrypted key backups
(`RUNBOOK_SECURITY_ES.md`), the PDS, and anything outside the Matrix stack.

## 2. Taking a backup

```bash
./deploy/matrix/backup.sh
```

Writes `backups/para-matrix-<UTC-stamp>.tar.gz`, mode 600, containing
`postgres.dump`, `config.tar`, `media.tar`, `bridge.tar`, a `manifest.txt` and
`SHA256SUMS`.

No downtime. `pg_dump` is transactionally consistent, media files are
effectively immutable once written, and the config is static — the stack keeps
serving throughout.

The dump runs *inside* the container so the `pg_dump` version always matches the
server; a host `pg_dump` older than the server refuses to run.

### The archive is as sensitive as the server

It holds the signing key and every message in plaintext. Mode 600 is only as
good as the host it sits on. **Encrypt before it goes anywhere else** — object
storage, a laptop, a managed backup service:

```bash
age -r <recipient> -o para-matrix-<stamp>.tar.gz.age para-matrix-<stamp>.tar.gz
```

`backups/` and `*.tar.gz.age` are gitignored. An unencrypted backup in cloud
storage would hand over everything this project's threat model is built to
protect, so treat "copied it somewhere convenient" as an incident.

### Schedule

Nightly is the right default for a pilot, with the archive encrypted and shipped
off-host immediately. A backup that only ever lives on the machine it backs up
protects against corruption but not against losing the machine.

```
0 3 * * *  cd /srv/watzappa && ./deploy/matrix/backup.sh >> /var/log/para-backup.log 2>&1
```

Prune old archives on whatever retention the operator charter sets; the script
does not delete anything.

## 3. Restoring

```bash
./deploy/matrix/restore.sh backups/para-matrix-<stamp>.tar.gz
```

Destructive — it drops the volumes and replaces the config directory. It prints
the manifest, verifies checksums, and requires you to type `restore`. Pass
`--yes` only in a drill or a script.

Order matters, and it is the reason this is a script rather than a list of
commands: **Postgres must be recreated from an empty volume** so `initdb`
applies the `C` collation Synapse requires (MATRIX_V2 F11). Restoring into a
volume initialised with any other collation gives you a database Synapse refuses
to start against — and the error arrives at the end of a long restore, when you
are already in an incident.

A healthy server is not a successful restore. Always verify data:

```bash
curl -s -X POST http://127.0.0.1:8008/_matrix/client/v3/login \
  -H 'Content-Type: application/json' \
  -d '{"type":"m.login.password","identifier":{"type":"m.id.user","user":"<known-user>"},"password":"<pw>"}'
```

then read back a message you know predates the backup.

## 4. The restore drill

An untested backup is not a backup. Run this on a schedule — quarterly at
minimum — and never for the first time during an incident.

Ideally on a separate host. On the production host it is genuinely destructive:
take a fresh backup first, and accept the downtime.

```bash
# 1. Record what must come back
./deploy/matrix/backup.sh
docker compose -f docker-compose.matrix.yaml exec -T synapse-db \
  psql -U pg -d matrix -tAc "SELECT count(*) FROM users"
docker compose -f docker-compose.matrix.yaml exec -T synapse-db \
  psql -U pg -d matrix -tAc "SELECT count(*) FROM events"
shasum -a 256 deploy/matrix/synapse/*.signing.key

# 2. Destroy it
docker compose -f docker-compose.matrix.yaml down -v
rm -rf deploy/matrix/synapse

# 3. Rebuild from the archive alone
./deploy/matrix/restore.sh backups/para-matrix-<stamp>.tar.gz --yes

# 4. Verify — all four must hold
#    - signing key checksum identical
#    - user and event counts match
#    - a known user can log in
#    - a message predating the backup reads back
#    - publicRooms still returns 401 (hardening survived)
```

Record the date and outcome in the decision log. A drill that was not written
down did not happen.

## 5. Known gaps

- **Off-host shipping is manual.** The script writes locally and tells you to
  encrypt; it does not push anywhere. Deliberate — credentials for a remote
  target on the backup host widen the blast radius of compromising that host.
- **No point-in-time recovery.** Restores land on the last backup; anything
  after it is lost. WAL archiving would close this and is not set up.
- **Media is on a local Docker volume**, not SeaweedFS as MATRIX_V2 §3.6
  intends, and is unencrypted at rest. The backup covers it; the architecture
  gap is separate and still open.
- **The drill has only been run on a single-node local stack.** It has not been
  exercised against a production-sized database, where the dump and restore
  windows will be materially longer.
