# Matrix local acceptance environment — 2026-09-26

This run supports PARA recovery/moderation acceptance. It does not establish
multi-device decryption or authorize a production rollout.

## Reproduced problems and corrections

- Element at `http://localhost:8082` used the production `chat.para.social`
  homeserver and could not connect. `scripts/matrix-stack.sh element-local`
  now applies an explicit local-only Compose override. Element uses its own
  origin for Matrix requests; Nginx forwards login/logout/refresh to MAS and
  the remaining Matrix API to Synapse. The original Element configuration is
  retained. Run `element-local` again after a regular `matrix-stack.sh up`,
  which applies the base Compose configuration.
- MAS redirected the browser to Docker's `para-idp` hostname. The setup script
  now uses `http://localhost:8090` as the local issuer and authorization
  endpoint, while MAS accesses token and JWKS endpoints over Docker's network.
  Explicit endpoints retain `pkce_method: always`; passwords remain disabled.
  Existing generated configuration was updated without regenerating secrets.
  This loopback configuration is for this Mac and its simulators, not phones
  on another host. See the upstream [MAS configuration reference](https://element-hq.github.io/matrix-authentication-service/reference/configuration.html).
- The bridge's persisted cursor `1517` was rejected by the current local PDS
  with `FutureCursor`. A private SQLite backup was taken before resetting only
  that cursor to zero. The supervisor restarted the bridge; it caught up to
  the current PDS. Do not apply this reset to a live deployment or automatically
  reset cursors on arbitrary connection failures.
- During restart, `para-analytics` acquired port 3001, which the host bridge
  needs. Analytics was stopped for this run. Its data was not removed. Before
  restarting it, assign it a different host port, or stop the bridge and
  relinquish 3001. Other restarting containers were left untouched.
- The bridge advertised the unreachable old address `192.168.1.89`. Its local
  public homeserver is now `http://localhost:8008`. Bridge supervision was
  replaced while preserving PDS process 76525 and the seeded accounts; the
  current test wrapper monitors that process. A future backend restart should
  use the normal `make run-dev-env` entrypoint.
- SQLite and PostgreSQL returned snake_case sync-log fields despite the
  `SyncLogEntry` contract. The retry worker consequently received an undefined
  event type and could not dispatch role/revocation retries. Both queries now
  return the contract's camelCase fields; a database-backed regression covers
  failed records, retry counts and successful removal from the failure queue.

## Live evidence

- Synapse, MAS, IdP, PDS and the host bridge responded to health checks.
- The cached local admin token passed both room listing and `whoami`.
- Nginx configuration passed `nginx -t`; local Matrix versions, auth metadata
  and MAS legacy login endpoints responded successfully.
- Element reached **Sign in with PARA / Waiting for approval** through its
  actual Continue button. No Matrix device was authorized by this check.
- Three fresh local PDS accounts and community membership records were created.
  The final fixture's community is
  `at://did:plc:ojdr3xwwixadijm4rqt72cvd/com.para.community.board/3mwfrslsoxq2i`.
  Its Matrix room is `!wLxCNKMEDPDIjavmsa:matrix.para.social` and its encryption
  state is `m.megolm.v1.aes-sha2`. The bridge recorded successful creation and
  three deferred joins, with owner/moderator and two ordinary-member roles.
  Deferred joins do not establish actual Matrix device membership.
- The replay initially hit Matrix room-creation rate limits; a subsequent
  fixture was created successfully after replay. The earlier failed fixture
  remains recorded. Failed space creation is not retried by the current
  retry worker and must not be described as recovered automatically.

## Private local artifacts

Credentials and the pre-reset database/configuration backups are under
`/tmp/para-chat-acceptance`, with directory mode 0700 and private files mode 0600. They are not committed. Use the fixture accounts only with the local
PDS. Never attach this directory to reports or copy its secrets into logs.

The fixture owner has moderation powers. This does not cover removal of a
moderator-only role, which requires a separate governance fixture and remains
an acceptance item.


## 2026-10-08 — connectivity, provisioning and release update

The September fixture is historical. The current PDS is a different,
disposable demo generation; do not reuse that fixture's bridge database or
apply its historical cursor reset to this process. Messaging acceptance is
still incomplete; VLPDS remains deferred.

### Current connectivity and data preservation

- Port 3001 has no listener. This explains PARA's room-list connection error.
  Synapse, MAS, IdP, Element and their PostgreSQL containers are healthy, but
  their host publications and advertised issuer/homeserver URLs are loopback.
  Health on this Mac does not establish iPhone reachability.
- The active full demo uses temporary SQLite, disposable test PostgreSQL/Redis,
  and in-memory PLC/service keys. It was left running. The canonical persistent
  launcher is `make run-dev-env` / `scripts/dev-env-persistent.sh`; its build
  fails on **73 existing Ozone diagnostics**, including missing generated API
  contracts/source imports and mismatched report-stat fields. No restart,
  database/profile substitution or firehose cursor reset was performed.
- A private partial rescue snapshot at
  `.dev-env-data/backups/demo-messaging-2026-10-08` contains checked online
  SQLite backups (29 files, integrity checks passed), actor key files and PLC
  audit operations for the 26 accounts present at capture. Its manifest marks
  `completeRestoreUnit: false`: blobs, PostgreSQL/schema binding, in-memory
  service/rotation keys, cross-store consistency and a restore test remain.
  This does not authorize stopping the demo or prove restorable accounts.
- Managed PARA local service settings were refreshed with the current Bonjour
  host, IP fallback `10.20.14.160`, and live AppView/chat proxy DIDs. Existing
  accounts/data were retained. Two additional synthetic accounts were created
  solely for the passing direct-message smoke; no community mapping was cut over.

### Locally implemented and verified

- Community provisioning failures now use a separate durable retry query on
  SQLite and PostgreSQL, including jobs beyond five failures. Retries read the
  current source-bound PDS record, ignore confirmed deleted records and publish
  mappings only after the room set completes. Alias reuse checks the operator
  creator, exact community marker, room type/parent and encryption requirement;
  unrelated or unmarked aliases fail closed. New rooms permit member messages
  while state and moderation actions still require elevated power.
- A blocked-provisioning gauge and `deploy/matrix/alerts.yml` provide actionable
  bridge/provisioning alert definitions. Scraping, alert delivery and outage
  drills are not established.
- Push uses Expo tokens, bounds decoded provider responses, returns 502 for
  temporary provider failures, returns permanently invalid push keys as rejected,
  and handles count-only badge updates without a message alert. Durable receipt
  tracking and duplicate suppression remain work before notification readiness.
- Bridge build/typecheck passed. SQLite/disposable PostgreSQL regressions passed
  **378 tests in 33 files**, including existing shared moderation changes.
  Appservice ingestion/SSE/dedup passed against an isolated Synapse fixture.
  Scoped ESLint passed with zero errors and one existing-style pino import
  warning in the new route test. The normal Vitest bundled-config path fails
  in this environment; the regression command uses `--configLoader runner`.
- The unchanged direct-message backend passed its existing API smoke with
  dedicated synthetic users: two-way messages, admission, unread/read markers,
  logs and fresh-login history. Actual DM navigation/background delivery remains
  pending. Client crypto/source evidence and all acceptance gates are in the
  [PARA device acceptance update](../../PARA/docs/MATRIX-CHAT-DEVICE-ACCEPTANCE-2026-09-26.md#2026-10-08--messaging-implementation-and-acceptance-update).

### Revisions and open release work

Local source bases: WatZappa `a22dad51467247f922a8b624c12ca2c35e0c4607`,
PARA `d00c7e514f25c9cb9b1ab749408f65f8f1cf031f`,
mubEZ `2003f6f14076418e44849cfbd04e1ab0fbf0ec32`.
All have local messaging changes; these are not deployed revisions. The exact
selected file hashes and saved results are in
`../../messaging-acceptance-2026-10-08/source-manifest.json`, SHA-256
`a54655122f40ef2453175bcdbae02844658d95feb20a6ebc77e61d29f10dbfb5`.

Required continuation:

1. Resolve the current Ozone build/schema integration and secure a complete,
   coherent restore unit for the active demo, including in-memory identities.
   Use the existing persistent launcher after a verified data-preserving transition;
   provision its dedicated AppView authority read credential. Never substitute
   an admin/M8 credential or attach an old bridge cursor to another PDS generation.
2. Configure actual reachable HTTPS homeserver/MAS/IdP/client URLs and verify
   them from the iPhone. The user currently has no working iPhone.
3. Complete the client acceptance ledger, including fresh-device recovery,
   Element interop, moderator-only revocation, account changes, outages and signed
   notifications. PARA full typechecks remain failed (22 iOS, 19 web diagnostics
   outside changed chat files), so no passing release candidate is established.
4. Complete durable push receipts/dedup, overall-app logout behavior, encrypted
   successor/read-only history migration tools and older-client upgrade handling.
   Keep current room mappings and the native opt-in default until acceptance passes.
5. Correct backup/restore coverage before running it: existing scripts omit
   MAS/IdP configuration and databases, pick volumes by a loose name match,
   archive live SQLite without an online backup, and the destructive restore
   suppresses some failures. Do not run the destructive script against this
   stack. Test a complete backup in an isolated deployment, alerts and rollback
   before declaring user readiness.
