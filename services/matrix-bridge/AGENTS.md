# Matrix bridge

- Follow root testing skill. Run package scripts with the repo's Node 22; rebuild native SQLite dependencies after changing Node major versions.
- `pnpm test:postgres` runs the suite against SQLite and a disposable local PostgreSQL container. `pnpm smoke:appservice` creates and removes an isolated Synapse container. Never point these fixtures at deployed databases.
- `db.transaction` is for database-only work. Await all operations inside it; no network requests or live SSE notifications before commit. Ingestion uses `ingestMatrixEvents` for both appservice and polling; persisted event_log records are the delivery source of truth.
- SSE must check room access at delivery, including explicit DID audiences. Unscoped events are denied. In-process notifications only wake the durable log drain.
- Never authorize from public linkedChat records. Never use an admin token as an appservice/device token. MAS requires native client authorization: the client runs the homeserver's authorization-code flow and the bridge only reports identity via `GET /api/matrix-identity`. See CLIENT_INTEGRATION.md.
- Owner mutations are disabled on generic membership endpoints until the dedicated handover protocol exists. Do not reintroduce ownerless-ID claiming.
