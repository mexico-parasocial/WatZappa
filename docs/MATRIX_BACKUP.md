# Matrix backup and restore

Use `deploy/matrix/backup.sh` and `deploy/matrix/restore.sh` with Python 3.12+
and the explicitly selected Docker Compose project. Format 2 protects Synapse,
MAS, IdP/operator configuration, media and a source-bound SQLite bridge together.
It does not include the PDS, M8 database/keys or edge TLS configuration. Preserve
those separately as a coordinated platform recovery unit.

## Backup

```bash
BRIDGE_DB_PATH=/absolute/profile/bridge/bridge.db \
MATRIX_COMPOSE_PROJECT=watzappa bash deploy/matrix/backup.sh /private/backups
```

The selected project must have running Synapse/MAS databases and Synapse's media
volume. The script refuses an absent bridge binding or a PostgreSQL bridge URL;
PostgreSQL bridge operators need a separately tested dump/restore unit.

An archive contains `postgres.dump`, `mas.dump`, `config.tar`, `media.tar`,
`operator.tar`, `bridge.sqlite`, `manifest.json` and `SHA256SUMS`. Config includes
the homeserver signing key, MAS secrets and IdP configuration; operator includes
`.env` and the Compose definition. SQLite uses its online backup API rather than
copying a live WAL database. Media is selected from the chosen container mount.

These are individually consistent online snapshots, not an atomic snapshot of
all services. Pause writes for a coordinated cutover and back up external
identity/PDS dependencies at the same recovery point. Never transplant a bridge
cursor into another PDS generation.

The archive is private, mode 0600, and contains server credentials, tokens,
metadata and stored events/media. Encrypted-room payloads remain ciphertext;
legacy plaintext content remains plaintext. Client recovery secrets and a
working client recovery flow are still needed to decrypt encrypted history.
Never move it off the host unencrypted.

## Nightly encrypted off-host copy

`deploy/matrix/nightly-backup.sh`, run by `para-matrix-backup.timer`
(`ansible/roles/matrix_stack`), takes the archive above, encrypts it with `age`
to `matrix_backup_age_recipients`, deletes the plaintext, uploads the `.age`
file to `s3://<s3_backup_bucket>/matrix/`, checks the uploaded size, and writes
`para_matrix_backup_last_success_timestamp_seconds` for node-exporter.
`ParaMatrixBackupStale` fires after 26 hours without a confirmed upload. Local
encrypted copies are kept `matrix_backup_retention_days`; bucket lifecycle
rules govern the remote ones.

Generate the key pair off the host (`age-keygen -o identity.txt`), give only
the `age1…` public key to Ansible, and keep `identity.txt` where losing the
server does not lose it (a password manager or an offline copy held by a
second operator). Without it the backups cannot be read.

To restore: `aws s3 cp s3://BUCKET/matrix/FILE.age .`, then
`age -d -i identity.txt -o archive.tar.gz FILE.age`, then the steps below.

## Verify before restoring

```bash
bash deploy/matrix/restore.sh /private/backups/para-matrix-STAMP.tar.gz --verify
python3 scripts/matrix-backup-verification.test.py
```

Verification is read-only with respect to the deployment. It checks the exact
archive structure, checksums, safe nested paths, identity configuration and
SQLite integrity/source binding. It does not prove PostgreSQL dumps restore or
that a client can log in or decrypt history.

## Restore into a reviewed target

Stop the target host bridge first. Select the target's matching PDS generation,
bridge database path, Compose project/file and bridge port explicitly:

```bash
BRIDGE_DB_PATH=/absolute/target/bridge/bridge.db \
BRIDGE_PDS_SOURCE_ID=matching-generation-id \
MATRIX_COMPOSE_PROJECT=reviewed-target \
MATRIX_COMPOSE_FILE=/absolute/target/docker-compose.matrix.yaml \
bash deploy/matrix/restore.sh /private/backups/para-matrix-STAMP.tar.gz
```

This replaces the selected Matrix databases, configuration, operator `.env`,
media and bridge database. It requires typing `restore`; use `--yes` only for a
reviewed isolated drill. The target Compose definition must match the captured
one, and the Synapse database must already use `C` collation. The script refuses
a different PDS generation and does not destroy unrelated volumes. Database
restore errors stop the procedure rather than being ignored.

A pre-restore configuration copy is retained, but it is not a complete rollback
snapshot. Take and verify a fresh full backup plus the external dependencies
before an actual restore. A failure after mutations may leave the selected
stack stopped/partially restored; do not reopen it until recovery passes.

`restore.sh` also restores onto a fresh host: with no `.env`, generated config
or Synapse container present, it installs the captured `.env` before starting
the databases and creates Synapse before restoring media. The target's
`POSTGRES_PASSWORD` must match the backup's, since the restored `.env` replaces
it while an existing database volume keeps its own.

`scripts/matrix-restore-drill.sh` rehearses backup, encryption, upload, host
loss, decryption and restore on a disposable copy with real Synapse, MAS and
Postgres; para-idp sign-in and the bridge itself are stubbed there.

Use a separate checkout/host and explicit project for a full drill. Check
signing-key/config preservation, user/event counts, MAS login and refresh,
source-bound cursor/mappings, encrypted media and client history recovery, plus
public discovery/access restrictions. Booting services alone is insufficient.

## Evidence and remaining gates

On 2026-10-14 a private format-2 archive passed verification. Both dumps restored
without errors into disposable PostgreSQL 14/16 containers: 480 Synapse events
and 34 MAS public tables. The bridge snapshot passed integrity and source checks.
Six preflight tests passed, including tampering, traversal, missing identity
configuration and source mismatch. The initial drill hit the initdb temporary
server; readiness was corrected to require TCP availability before restore.

This was a component restore drill. It did not restore/restart the complete
live deployment or establish client login/decryption. The historical 2026-08-20
Synapse-only drill is not acceptance evidence for the current MAS/IdP unit.
Full isolated deployment recovery, off-host encrypted delivery, restore timing,
rollback and actual client recovery remain release gates. Record outcomes in
`MATRIX-LOCAL-ACCEPTANCE-2026-09-26.md` and PARA's linked device ledger.
