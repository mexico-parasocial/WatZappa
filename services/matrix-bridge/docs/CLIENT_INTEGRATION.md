# PARA client ↔ matrix-bridge integration contract

This is the spec the PARA app implements against. It documents the current,
shipped behavior of the bridge (`services/matrix-bridge`) — event payloads and
endpoints here describe the bridge implementation. Updated 2026-09-21.

**Deployment gate:** the Synapse v1.161.0 + MAS 1.24.0 deployment does not
support `m.login.application_service`. Direct Synapse login returns 404; MAS
exposes SSO/token login and rejects appservice login. `/api/matrix-token`
returns 503 `MATRIX_CLIENT_LOGIN_REQUIRED` and creates no session record.
Never give the client an appservice or admin credential as a fallback.

**The supported path is the homeserver's own authorization-code flow**, run by
the client:

1. `POST /api/matrix-challenge` (M8 bearer) → `{challenge, expiresAt, purpose}`.
   One-time, TTL 5 minutes, bound to the issuing session. Every proof below
   signs this challenge.
2. `POST /api/matrix-identity` (M8 bearer) with a CD-M4 `SignedAssertion`
   (`purpose: "matrix-login"`, audience `para-matrix-bridge/identity.v1`,
   challenge from step 1) → `{userId, homeServer, loginFlow}`. The MXID is
   derived from the presented identity public key — the same derivation iM8
   computes locally (`getMatrixIdentity`), so this call is the cross-check
   plus the point where the Synapse account is ensured to exist. It mints no
   session, no device and no token. There is no mapping behind it: a DID has
   no stored MXID anywhere in the bridge.
3. The client asks the Matrix SDK for an authorization URL (`urlForOidc`),
   opens it in a browser session, and completes with
   `loginWithOidcCallback(redirectUrl)`. PARA's implementation is
   `src/features/encryptedChat/` (`oidc.ts`, `client.native.ts`); the redirect
   is `para://matrix-auth`.
4. After the MAS login completes, attest the session:
   `POST /api/matrix-attest` (M8 bearer) with `{deviceId, assertion}` — a
   fresh challenge signed for audience `para-matrix-bridge/attest.v1`, where
   `deviceId` is the MAS-issued device id. The bridge records the device
   against the derived MXID so message attribution, moderation, revocation
   and role projection can reach it. Idempotent per device; re-attest on new
   logins.
5. The resulting access token lives in the client's own encrypted store. It
   never reaches the bridge, and the bridge never mints it.

**Joining community rooms is also pull-based** (CD-M6): when the SSE
`membership.changed` event says `state: "active"`, call
`POST /api/community-join` (M8 bearer) with `{communityUri, assertion}` — a
fresh challenge signed for audience `para-matrix-bridge/join.v1`. The bridge
checks active membership + the proof, then joins the derived MXID into the
community's rooms (main + assigned chamber, or the observer layout) with the
power levels the governance roles imply. Response:
`{userId, spaceId, joinedRoomIds, chamber}`. Leaving/removal arrives as
`membership.changed` with a non-active state: the bridge deactivates the
device sessions it minted and bans those accounts from the rooms; drop local
caches and treat the rooms as closed.

`loginFlow` is `'oidc'` for this deployment. Treat any other value as
unsupported rather than falling back to something weaker.

[MAS application-service login limitation](https://element-hq.github.io/matrix-authentication-service/as-login.html).

The model is two-tier, on purpose:

- **The bridge** (`BRIDGE_URL`, e.g. `https://bridge.para.social`) owns
  identity mapping, governance, sortition, moderation, read state, push
  registration, and the real-time event stream. Clients talk to it with an
  **M8 bearer token** — the same token the app already holds for PDS login.
- **The homeserver** (Synapse, e.g. `https://matrix.para.social`) owns chat
  itself. Where appservice login is supported, the bridge can mint a
  device-bound Matrix session. With MAS, native authorization is required. Clients speak the standard Matrix client API (matrix-js-sdk / Matrix
  Rust SDK).

Appservice ingestion receives events for its registered namespaces, strips
content before persistence, and ignores untracked rooms. In unencrypted rooms,
the homeserver and appservice can see plaintext. In E2EE rooms only authorized
clients holding keys can decrypt content. No message keys belong in the bridge.

## 1. Session flow (native screens)

```
M8 login ──► PARA app holds { m8 token, did, identity keys (via M8/iM8) }
   │
   ├─► GET  BRIDGE_URL/api/events          (SSE, M8 bearer)     — always on
   ├─► POST BRIDGE_URL/api/matrix-challenge (M8 bearer)          — before any proof
   ├─► POST BRIDGE_URL/api/matrix-identity (M8 bearer + SignedAssertion)
   │      └─► { userId, homeServer, loginFlow: "oidc" }          — derivation cross-check
   ├─► MAS authorization-code flow (client-side) ──► own Matrix access token
   ├─► POST BRIDGE_URL/api/matrix-attest   (M8 bearer + SignedAssertion, audience attest)
   │      └─► { userId, sessionId, deviceId, attested: true }    — register the MAS device
   ├─► POST BRIDGE_URL/api/community-join  (M8 bearer + SignedAssertion, audience join)
   │      └─► { userId, spaceId, joinedRoomIds, chamber }        — on membership.changed active
   ├─► POST BRIDGE_URL/api/matrix-token    (M8 bearer + SignedAssertion, audience session)
   │      └─► { accessToken, deviceId, sessionId, userId, homeServer }  — appservice-login deployments only
   ├─► POST BRIDGE_URL/api/push-token      (M8 bearer)          — once per install
   └─► GET  BRIDGE_URL/api/devices         (M8 bearer)          — settings screen
```

### 1.1 Device sessions (homeservers supporting appservice login)

`POST /api/matrix-token` (M8 bearer). Body: a CD-M4 `SignedAssertion` for
audience `para-matrix-bridge/session.v1` over a fresh challenge, plus optional
fields:

```json
{
  "assertion": { "type": "para.identity.pop.v1", "purpose": "matrix-login",
                 "audience": "para-matrix-bridge/session.v1",
                 "identityPub": "<64 hex chars>", "challenge": "<from /api/matrix-challenge>",
                 "signedAt": "2026-09-21T12:00:00.000Z" },
  "signature": "<128 hex chars, sr25519>",
  "friendlyName": "iPhone 15 (María)",
  "deviceId": "PARA-<stable-per-install-id>"
}
```

- `deviceId` is **optional but recommended**: reuse a stable per-install id so
  the homeserver sees the _same Matrix device_ on every login. For the E2EE
  spike this is load-bearing — Megolm device keys and cross-signing attach to
  the device. Never reuse that device ID after its crypto store is lost;
  create a new device and recover/verify it instead.
- Response: `{ accessToken, deviceId, sessionId, userId, homeServer }`.
  `homeServer` is the public URL (scheme/host fixed up from the internal one).
- `sessionId` identifies the _bridge-side_ session record (not a Matrix
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

Every verified interaction also settles access (`reconcileMemberAccess`):
communities where the caller's membership turned non-active get the presented
account banned and its sessions revoked; active communities get current roles
re-projected as power levels. Treat a 403 from a room the app still holds
locally as authoritative and drop local caches — the SSE `membership.changed`
event is the push signal, reconciliation is the enforcement.

**Room membership is a lease.** Any verified interaction (identity probe,
session mint, attestation, join) renews the caller's accounts for their
active communities. An account that goes too long without one (30 days by
default) is kicked from the community's rooms by the bridge's sweep — even if
the member is still active. Clients must therefore **re-join automatically**:
when the Matrix sync reports the account left a community room it believes it
belongs to, run `POST /api/community-join` for that community on next
foreground (the endpoint is idempotent and re-admits active members
immediately).

### 1.2 Matrix sync discipline

Run matrix-js-sdk sync **only while a chat screen is visible** (`startClient`
on focus, `stopClient` on blur/background), with `lazyLoadMembers: true`.
Background wake-ups come from push; on return-to-app, reconcile via SSE
replay + a room-timeline fetch, not a long-running sync. Exact policy should
be validated on iOS and Android — see MATRIX_V2 review §6.

E2EE (phase 2 for PARA-hosted rooms): the client owns the crypto engine
(Matrix Rust SDK natively; matrix-js-sdk WASM on web). The bridge is not in
the content path and must never be. Key backup/verification UX belongs to the
client; M8 may broker _access_, never message keys.

## 2. Real-time events — `GET /api/events` (SSE)

Auth: M8 bearer. One long-lived connection per device; reconnect with the
last received `id`.

Wire protocol:

1. On connect the server sends `retry: 5000`, then a `hello` event:
   `data: { "maxSeq": 123 }`. The snapshot is informational, not permission
   to advance the cursor before replay.
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
5. `checkpoint` events carry `{ seq }` and an `id`; persist that cursor even
   when all intervening records were filtered. Process events/checkpoints in
   arrival order and commit cursors only after handling prior events.
6. 25s heartbeats also reconcile the durable log, repairing missed in-process
   notifications. Resource access is checked at each delivery. M8 authentication
   is refreshed on drains after 60 seconds; failure closes the stream. Slow
   consumers are disconnected and must reconnect with their processed cursor.

### Event catalog (exact payloads)

| Event (`event:`)        | Audience                                                                   | Payload                                                                                                                                                                                                                                                               |
| ----------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `membership.changed`    | the affected DID (direct)                                                  | `{ did, state, roles }` — your own membership/roles changed; `state` ∈ `active \| left \| removed \| blocked \| …`; on `left/removed/blocked` drop local community caches                                                                                             |
| `proposal.state`        | community-wide                                                             | `{ proposalUri, from, to, votingEnds }` — today `from:"deliberation"`, `to:"voting"`; render the "voting open" surface                                                                                                                                                |
| `sortition.selected`    | selected DIDs (direct)                                                     | `{ runId, cabildeoUri }` — you were selected for an assembly; mirror of the Expo push (`type: "sortition_selected"`)                                                                                                                                                  |
| `sortition.run.updated` | community-wide                                                             | `{ runId, status, selectedCount, eligibleCount }` — aggregate only, **no member identities**                                                                                                                                                                          |
| `chat.unread`           | currently authorized room members, further restricted by DID on read-clear | `{ roomId, invalidated: true }` on activity; `{ roomId, clearedFor, upTo }` on mark-read. Refetch `/api/unread`; never add a message delta. Bridge counts reflect message/encrypted-event metadata; the native SDK is authoritative for decrypted timeline semantics. |
| `badge.updated`         | the affected DID (direct)                                                  | `{ communityUri, badges }` — the caller's visible badge types changed                                                                                                                                                                                                 |
| `constitution.updated`  | community-wide                                                             | `{ version }` — refetch `GET /api/constitution` for the rules                                                                                                                                                                                                         |
| `resync_required`       | caller                                                                     | `{ oldestRetainedSeq, maxSeq }`                                                                                                                                                                                                                                       |

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
  token; that alone is load-bearing. The optional Synapse-side pusher
  registration additionally needs the caller's MXID post-CD-M1: include the
  same `SignedAssertion` (audience `identity`) in the body and the bridge
  derives it. Without it, only Expo delivery is configured — native Matrix
  push can also be set by the client with its own session token.
- Chat push (`reason: "matrix-message"`) data payload:
  `{ reason, roomId, communityUri, communityName, senderName }` — deep-link to
  `communityUri` → `/api/space-for-community?uri=` for room resolution, then
  open the room via the Matrix client.
- Sortition push data payload: `{ type: "sortition_selected", runId, cabildeoUri, communityUri }`.

## 5. Institutions and identity links

- `POST /api/institutions` authenticates M8 and returns 201 `{ institutionId }`
  with a server-generated UUID URN and an initial, non-expiring owner.
- Generic membership routes operate only on existing institutions. They cannot
  create, replace, expire or revoke owner memberships. Ownership handover is
  unavailable until its dedicated acceptance/approval protocol and Matrix
  authority changes are implemented.
- Public `com.para.identity.linkedChat` records are unverified claims.
  `verifyChatLink` fails closed with `matrix-proof-required` and performs no
  remote reads. Do not use records to authorize memberships or correlate
  private/work/voting identities automatically.
- External providers are outside the current delivery; do not relay M8 tokens
  to them. Solidarity integration is not a dependency of the native pilot.
