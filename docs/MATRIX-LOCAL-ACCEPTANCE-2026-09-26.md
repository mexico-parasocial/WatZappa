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
