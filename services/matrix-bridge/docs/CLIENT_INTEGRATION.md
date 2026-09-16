# PARA client ↔ matrix-bridge integration contract

This is the spec the PARA app implements against. It documents the current,
shipped behavior of the bridge (`services/matrix-bridge`) — event payloads and
endpoints here are exact, not aspirational. Version: matches commit `9fc0714bf`.

The model is two-tier, on purpose:

- **The bridge** (`BRIDGE_URL`, e.g. `https://bridge.para.social`) owns
  identity mapping, governance, sortition, moderation, read state, push
  registration, and the real-time event stream. Clients talk to it with an
  **M8 bearer token** — the same token the app already holds for PDS login.
- **The homeserver** (Synapse, e.g. `https://matrix.para.social`) owns chat
  itself. Clients connect with a **device-bound Matrix session minted by the
  bridge** and speak the standard Matrix client API (matrix-js-sdk / Matrix
  Rust SDK).

The bridge never sees message content for rooms it does not host events in,
and — by design — **does not observe DMs hosted on other providers** (e.g. a
user's solidarity.social account). Those live entirely between the client and
that provider.

## 1. Session flow (native screens)

```
M8 login ──► PARA app holds { m8 token, did }
   │
   ├─► GET  BRIDGE_URL/api/events          (SSE, M8 bearer)     — always on
   ├─► POST BRIDGE_URL/api/matrix-token    (M8 bearer)          — on chat open
   │      └─► { accessToken, deviceId, sessionId, userId, homeServer }
   │           └─► matrix-js-sdk createClient({ homeserver, accessToken, userId, deviceId })
   ├─► POST BRIDGE_URL/api/push-token      (M8 bearer)          — once per install
   └─► GET  BRIDGE_URL/api/devices         (M8 bearer)          — settings screen
```

### 1.1 Device sessions

`POST /api/matrix-token` (M8 bearer; optional JSON body):

```json
{ "friendlyName": "iPhone 15 (María)", "deviceId": "PARA-<stable-per-install-id>" }
```

- `deviceId` is **optional but recommended**: reuse a stable per-install id so
  the homeserver sees the *same Matrix device* on every login. For the E2EE
  spike this is load-bearing — Megolm device keys and cross-signing attach to
  the device, so device churn means key churn and undecryptable history.
- Response: `{ accessToken, deviceId, sessionId, userId, homeServer }`.
  `homeServer` is the public URL (scheme/host fixed up from the internal one).
- `sessionId` identifies the *bridge-side* session record (not a Matrix
  concept). Keep it for the settings screen.

Lifecycle endpoints (M8 bearer):

- `GET /api/devices` → `{ devices: [{ sessionId, deviceId, friendlyName, userAgent, createdAt, lastSeenAt, revoked }] }`
- `POST /api/devices/revoke` body `{ sessionId }` → deactivates the device on
  the homeserver (its access token dies) and marks the session revoked.
  Revoking the device the app is currently using requires a fresh
  `/api/matrix-token` call before the next chat open.

Three distinct "logouts" the app should model separately:
(i) PARA/M8 session sign-out (identity — clears the bearer),
(ii) Matrix session revocation (one device — above),
(iii) community/institutional access removal (governance — arrives as an SSE
`membership.changed` event; it implies neither of the first two).

### 1.2 Matrix sync discipline

Run matrix-js-sdk sync **only while a chat screen is visible** (`startClient`
on focus, `stopClient` on blur/background), with `lazyLoadMembers: true`.
Background wake-ups come from push; on return-to-app, reconcile via SSE
replay + a room-timeline fetch, not a long-running sync. Exact policy should
be validated on iOS and Android — see MATRIX_V2 review §6.

E2EE (phase 2 for PARA-hosted rooms): the client owns the crypto engine
(Matrix Rust SDK natively; matrix-js-sdk WASM on web). The bridge is not in
the content path and must never be. Key backup/verification UX belongs to the
client; M8 may broker *access*, never message keys.

## 2. Real-time events — `GET /api/events` (SSE)

Auth: M8 bearer. One long-lived connection per device; reconnect with the
last received `id`.

Wire protocol:

1. On connect the server sends `retry: 5000`, then a `hello` event:
   `data: { "maxSeq": 123, "communities": ["at://…"] }` (the caller's active
   communities — the audience filter).
2. Replay: events with `seq > cursor` that the caller is entitled to **now**
   (entitlements are re-evaluated during replay — a revoked member cannot
   replay events from before revocation). Cursor comes from the
   `Last-Event-ID` header or `?lastSeq=`.
3. Live events follow, each with `id: <seq>`. **Delivery is at-least-once:
   dedup on `id`.**
4. If the cursor predates the 7-day retention window, the server sends a
   `resync_required` event (`data: { oldestRetainedSeq, maxSeq }`) instead of
   a silent gap — refetch state over the regular REST endpoints, then
   continue from `maxSeq`.
5. 25s heartbeat comment lines (`: heartbeat`) keep intermediaries alive.

### Event catalog (exact payloads)

| Event (`event:`) | Audience | Payload |
| --- | --- | --- |
| `membership.changed` | the affected DID (direct) | `{ did, state, roles }` — your own membership/roles changed; `state` ∈ `active \| left \| removed \| blocked \| …`; on `left/removed/blocked` drop local community caches |
| `proposal.state` | community-wide | `{ proposalUri, from, to, votingEnds }` — today `from:"deliberation"`, `to:"voting"`; render the "voting open" surface |
| `sortition.selected` | selected DIDs (direct) | `{ runId, cabildeoUri }` — you were selected for an assembly; mirror of the Expo push (`type: "sortition_selected"`) |
| `sortition.run.updated` | community-wide | `{ runId, status, selectedCount, eligibleCount }` — aggregate only, **no member identities** |
| `chat.unread` | community-wide (new messages) or the affected DID (read-clear) | `{ roomId, count }` on new messages; `{ roomId, clearedFor, upTo }` on mark-read — recompute exact unread via `GET /api/unread` |
| `badge.updated` | the affected DID (direct) | `{ communityUri, badges }` — the caller's visible badge types changed |
| `constitution.updated` | community-wide | `{ version }` — refetch `GET /api/constitution` for the rules |
| `resync_required` | caller | `{ oldestRetainedSeq, maxSeq }` |

`badge.updated`, `constitution.updated`.

## 3. Authorization semantics (what 403 means)

The bridge enforces `authorize(actor, action, resource)` (F9, closed):

- Moderator powers (sanctions, dashboard, recompute) require the
  `moderator`/`owner` role.
- Processing a sortition run requires `moderator`/`owner`/`delegate`.
- Room-scoped writes (`mark-read`) require chamber assignment matching the
  room's chamber; `observer`-role members reach only main/observers rooms.

Clients should treat `403` as authoritative and refresh entitlements on the
next `membership.changed` for the caller's DID.

## 4. Push

- Register once per install: `POST /api/push-token` (M8 bearer) with the Expo
  token; the bridge installs a Synapse pusher aimed at its own gateway.
- Chat push (`reason: "matrix-message"`) data payload:
  `{ reason, roomId, communityUri, communityName, senderName }` — deep-link to
  `communityUri` → `/api/space-for-community?uri=` for room resolution, then
  open the room via the Matrix client.
- Sortition push data payload: `{ type: "sortition_selected", runId, cabildeoUri, communityUri }`.

## 5. Open items tracked elsewhere

- Solidarity.social as a second Matrix provider: the client renders it as a
  second homeserver profile; **blocked on verifying** how a third-party client
  obtains a session there (password login? token-mint endpoint?). The bridge
  has no admin powers there and must never receive the M8 bearer for relay.
- Institutional rooms (owner transfer, shared inboxes): spec in progress;
  institutional Matrix accounts own their rooms; the bridge only observes.
