# Matrix↔PARA Community Bridge

Synchronizes PARA community memberships with Matrix spaces. **PARA-only — federation disabled.**

The bridge uses [`matrix-bot-sdk`](https://github.com/turt2live/matrix-bot-sdk) for Matrix client and supported admin operations; Synapse-specific admin endpoints not covered by the SDK are called directly.

## How It Works

1. **Consumes** `com.atproto.sync.subscribeRepos` firehose
2. **Filters** `com.para.community.board` (create) and `com.para.community.membership` records
3. **Creates** a Matrix space for each new PARA community
4. **Invites/kicks** users based on membership state
5. **Sets power levels**: owners → 100, moderators → 50, members → 0
6. **Chat client** — the PARA app hosts a self-contained WebView shell that loads a pinned, project-bundled copy of `matrix-js-sdk` from `PARA/assets/chat/`

## Security Model (PARA-Only)

- **Federation is disabled** in Synapse (`federation_domain_whitelist: []`)
- **No public room directory** — rooms are not discoverable
- **Registration is closed** — accounts are provisioned only by the bridge via Admin API
- **No guest access** — all users must be authenticated PARA members
- **Client API endpoints require M8 JWTs** — callers cannot submit arbitrary DIDs
- **E2EE is disabled by default** (`MATRIX_ENABLE_ENCRYPTION=false`). Rooms are transport-encrypted via HTTPS and run on a PARA-only homeserver with federation disabled. Full Matrix E2EE requires a Rust/WASM crypto stack; this is not supported inside a React Native WebView (see [matrix-js-sdk#4150](https://github.com/matrix-org/matrix-js-sdk/issues/4150)). Do not enable `MATRIX_ENABLE_ENCRYPTION` until the app uses a native Matrix client or a WebView engine with working WASM crypto and key backup.
- **Synapse is the only chat history store** — the bridge persists event metadata only, never raw message content
- **Push notifications are generic** — no plaintext message previews leave Matrix clients
- Firehose commits are consumed unauthenticated (acceptable for own PDS; enable sig verification if consuming from public relay)

## DIDs ↔ MXIDs

- `did:plc:abc123` → `@did-plc-abc123:matrix.para.social`
- Users are auto-created via Synapse Admin API if they don't exist
- Passwords are generated randomly and stored in SQLite (for future Element Web login)

## Environment Variables

| Variable                   | Default                                                      | Description                                                                  |
| -------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `PDS_FIREHOSE_URL`         | `wss://pds.para.social/xrpc/com.atproto.sync.subscribeRepos` | AT Protocol firehose                                                         |
| `MATRIX_HOMESERVER_URL`    | `http://synapse:8008`                                        | Synapse Admin API base URL                                                   |
| `MATRIX_ADMIN_TOKEN`       | _(required)_                                                 | Synapse admin access token                                                   |
| `MATRIX_ENABLE_ENCRYPTION` | `false`                                                      | Enable Matrix E2EE (`m.megolm.v1.aes-sha2`) — requires working client crypto |
| `M8_BASE_URL`              | `http://localhost:8787/v1`                                   | M8 Identity Manager API                                                      |
| `BRIDGE_DB_PATH`           | `/data/bridge.db`                                            | SQLite database path                                                         |
| `BRIDGE_LOG_LEVEL`         | `info`                                                       | Log level                                                                    |
| `PORT`                     | `3001`                                                       | Health check HTTP port                                                       |

## Endpoints

- `GET /healthz` — 200 if healthy, 503 if too many failed syncs
- `GET /metrics` — Prometheus metrics (`para_matrix_invites_total`, `para_matrix_kicks_total`, `para_matrix_spaces_created_total`, `para_matrix_sync_latency_seconds`, `para_matrix_firehose_lag_seconds`)
- `POST /api/matrix-token` — requires M8 bearer token; returns a Matrix login token for the authenticated session DID
- `POST /api/push-token` — requires M8 bearer token; registers push token for the authenticated session DID
- `GET /api/space-for-community?uri=...` — requires M8 bearer token and active community membership
- `GET /api/rooms` — requires M8 bearer token; lists the authenticated user's active Matrix rooms with unread counts
- `GET /api/unread` — requires M8 bearer token; returns total unread counts for the authenticated user's active Matrix rooms

## Cursor Persistence

The bridge saves the firehose sequence cursor to SQLite every 30 seconds and on graceful shutdown. On restart, it resumes from the last cursor to avoid reprocessing old events.

## Retry Worker

Failed syncs (e.g., Matrix API timeout during invite) are automatically retried every 60 seconds with exponential backoff. Max 5 retries per event. Metrics track retry success/failure rates.

## Backfill

For existing communities created before the bridge was deployed:

```bash
# Query your AppView for all communities + memberships, then sync
pnpm run backfill --pds https://pds.para.social
```

> **Note:** The backfill script is a skeleton. You must adapt it to query your AppView's database or custom endpoint for all `com.para.community.board` and `com.para.community.membership` records.

## Architecture Notes

- **Database backend:** `src/db/index.ts` selects PostgreSQL when `DATABASE_URL` is set, otherwise SQLite. All bridge code uses the async `IBridgeDatabase` interface so either backend is interchangeable.
- **Governance logic:** Proposal, sortition, and deliberation logic currently lives inside this bridge. A future refactor should split these into a dedicated governance service so the bridge focuses purely on Matrix sync.
- **E2EE limitation:** Full Matrix E2EE is not supported in a React Native WebView because `matrix-js-sdk`'s Rust crypto requires WASM (see [matrix-js-sdk#4150](https://github.com/matrix-org/matrix-js-sdk/issues/4150)). E2EE remains opt-in until a native Matrix client or WASM-capable runtime is adopted.

## Development

```bash
npm install
npm run dev        # tsx watch
npm run build      # tsc
npm start          # node dist/index.js
npm run backfill   # one-time backfill script
```
