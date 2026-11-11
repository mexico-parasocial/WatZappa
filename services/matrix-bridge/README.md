# Matrix↔PARA Community Bridge

Projects verified PARA community access onto Matrix. Synapse stores chat history;
clients own their Matrix sessions and encryption keys. The bridge handles identity
proofs, room provisioning, membership and role projection, devices, direct-message
requests, moderation, unread state and chat notifications.

## Authority and access

The bridge reads membership and member/moderator/owner roles from the configured
AppView using its dedicated authority service credential. It never grants an
office from a self-authored membership record. Clients authenticate to the bridge
with M8, prove possession of their chat identity key, authorize with MAS/OIDC and
attest their actual Matrix device before joining community rooms.

`MatrixProjectionPort` applies verified access to Matrix. Owners and moderators
can review every community room; ordinary members reach the main room. Chamber
seats need an externally verified assignment contract before they can grant access.
The bridge has no local allocation, randomness, assembly selection or seat lookup.
Existing chamber rooms remain tracked for moderation, revocation and read state.

Room leases expire after 30 days without a verified interaction by default. Native
clients must rejoin automatically when they return. Authority refresh runs before
serving, during protected operations and periodically. See
[CLIENT_INTEGRATION.md](docs/CLIENT_INTEGRATION.md) for the client contract.

## Responsibilities

- Consume community, membership, authority and constitution records from the
  configured AT Protocol stream, with a source-bound persisted cursor.
- Provision community spaces and configured child rooms, with retryable jobs.
- Derive MXIDs from proven identity keys; register/revoke device attestations.
- Apply role changes, removals, room leases, mutes and bans to Matrix.
- Accept direct-message requests and disclose the requester's MXID once on consent.
- Ingest event metadata through appservice transactions and reconciliation polling.
- Serve room lists, unread counts, read markers and durable SSE updates.
- Manage reports and sanctions; expose moderation risk badges only to the member
  and authorized moderators. Member lists come from verified membership state.
- Deliver Expo chat notifications and check provider receipts.
- Store and serve a community's constitution as read-only context.

Civic content and institutional administration belong to their own services.
The bridge accepts their effects only through verified authority, never a
client-submitted role or decision. It does not provide civic or AI APIs.

## Configuration

| Variable                                                                                           | Purpose                                                                                               |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `MATRIX_CHAT_ENABLED`                                                                              | Defaults to `true`; `false` disables homeserver operations and chat routes.                           |
| `PDS_FIREHOSE_URL`, `BRIDGE_PDS_SOURCE_ID`                                                         | Stream origin and data generation; use a relay with safe integer sequences when necessary.            |
| `BRIDGE_AUTHORITY_APPVIEW_URL`, `PARA_AUTHORITY_SERVICE_TOKEN`                                     | Verified authority origin and dedicated 32–512 character read credential.                             |
| `M8_BASE_URL`                                                                                      | M8 session verification endpoint base.                                                                |
| `MATRIX_HOMESERVER_URL`, `MATRIX_PUBLIC_HOMESERVER_URL`                                            | Internal and client-reachable homeserver URLs.                                                        |
| `MATRIX_SERVER_NAME`                                                                               | Homeserver `server_name`, used to derive MXIDs.                                                       |
| `MATRIX_ADMIN_TOKEN`, `MATRIX_HS_TOKEN`                                                            | Separate administrator and incoming appservice credentials.                                           |
| `MATRIX_MAS_ADMIN_URL`, `MATRIX_MAS_TOKEN_URL`, `MATRIX_MAS_CLIENT_ID`, `MATRIX_MAS_CLIENT_SECRET` | Private MAS administration for device revocation.                                                     |
| `MATRIX_ALLOW_APPSERVICE_LOGIN`, `MATRIX_APPSERVICE_TOKEN`                                         | Explicit legacy-only appservice sessions; never substitute an admin token.                            |
| `MATRIX_ENABLE_ENCRYPTION`                                                                         | Encryption for newly created rooms; defaults to `false`. Requires supported clients and key recovery. |
| `BRIDGE_MEMBERSHIP_LEASE_TTL_MS`, `BRIDGE_SYNC_FALLBACK_MS`                                        | Lease expiry and reconciliation polling intervals.                                                    |
| `DATABASE_URL` / `BRIDGE_DB_PATH`                                                                  | PostgreSQL or SQLite storage.                                                                         |
| `PUSH_GATEWAY_URL`                                                                                 | Matrix push gateway address.                                                                          |
| `CHAT_OPS_PORT` and `CHAT_OPS_*`                                                                   | Opt-in private, authenticated, audited operations listener.                                           |
| `PORT`, `BRIDGE_LOG_LEVEL`                                                                         | Public API listener and log level.                                                                    |
| `BRIDGE_CORS_ORIGINS`                                                                              | Exact web origins allowed to call the API from a browser, comma-separated; unset means no CORS.       |

## Storage and deployment

The async `IBridgeDatabase` contract has SQLite and PostgreSQL implementations.
Fresh databases initialize chat-owned tables only. Existing civic tables remain
untouched for a separately planned export/migration; the bridge does not read,
write or copy them in its SQLite-to-PostgreSQL migration. Existing activity badges
are excluded from responses, and recalculation replaces them with moderation
context. No activity counters or engagement tiers are maintained.

Messages are sent directly to Matrix. The bridge persists metadata, not message
bodies or encryption keys. Device attestations retain operational DID/MXID
attribution for moderation and revocation; they are not a public directory.
Unencrypted messages remain readable by the homeserver operator.

Synapse containment is configured in `deploy/matrix/hardening.yaml`, including
closed federation and registration, restricted discovery and content-free push.
Verify the effective deployed configuration and actual room protection.

Start the local stack from the repo root with `make matrix-up`. Backups and restore
instructions are in [MATRIX_BACKUP.md](../../docs/MATRIX_BACKUP.md). The manual
`backfill` helper requires operator review and is not a replacement for verified
authority reconciliation.

## Development

Run from this package with the repository's Node 22:

```bash
pnpm dev
pnpm build
pnpm typecheck
pnpm test --maxWorkers=1
pnpm test:postgres --maxWorkers=1
pnpm smoke:appservice
```

The PostgreSQL and appservice scripts create isolated disposable infrastructure.

Explicit device revocations persist before upstream calls and survive restarts.
HTTP 202 means pending, not revoked; device listings expose `revocationPending`.
Community removal bans only that community's rooms, preserving devices, other
communities and DMs. Access retries resolve current verified authority again.
Moderation clients receive explicit verified `roles` rather than deriving power
from activity counters or badge labels.
