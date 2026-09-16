# PARA chats screen redesign — architecture and user stories

Handoff spec for the PARA app (`~/Desktop/Home/PARA`). Grounded in the current
app: the WebView shell in `CommunityChatScreen.tsx`, the bundled
`matrix-js-sdk` HTML client in `matrix-client.ts` (780 lines), the Messages
tab structure, and — critically — the already-present native engine:
`@unomed/react-native-matrix-sdk` (Rust, E2EE, sliding sync, SecureStore
secrets) with a working lab client in `src/features/encryptedChat/`
(`client.native.ts`) that has no UI consumers yet.

## Architecture of the redesigned chat surface

**1. Native room screen replaces the WebView.** `CommunityChat` keeps its
route and params (`communityUri`, `communityName`, `roomId`) — deep links and
push taps keep working unchanged. Internally it renders a native timeline +
composer driven by the unomed client (per-room scope), with the WebView as a
feature-flagged fallback (`EXPO_PUBLIC_CHAT_ENGINE=webview`). The E2EE lab
flag graduates into the engine flag: same client, now with UI.

**2. Session = device-bound bridge session.** On first chat open: reuse the
existing `POST /api/matrix-token` call, but pass `{ friendlyName, deviceId }`
with a **stable per-install deviceId** (Keychain/UUID kept in SecureStore) —
required for Megolm device-key continuity later. Cache the session
(accessToken + deviceId + sessionId) long-term, not 1h: these are device
sessions now, revocable via the settings screen.

**3. Unread via SSE, not polling.** Replace the 2-minute `/api/unread` poll
with one `GET /api/events` connection (EventSource semantics over
`fetch` + ReadableStream in RN). Events drive: total badge (Messages tab +
bottom bar — **fix the native bottom-bar bug where the Chat button counts
only DM unread**), per-community badges, room-list refresh on
`chat.unread`. `resync_required` → one `GET /api/unread` + `GET /api/rooms`,
then continue from `maxSeq`. Push stays for background wake-ups.

**4. Contexts in the Messages tab.** The list gains three sections —
**Personal** (solidarity/DMs), **Comunidad** (PARA chambers, grouped by
community with chamber chips), **Trabajo** (institutional, later). Today only
Comunidad + existing Bluesky DMs exist; the structure ships with two live
sections and the third reserved. Selection switches the Matrix profile
(homeserver + session + crypto store) — the iM8 context manager will own
this mapping; until then the app keeps a local profile registry.

**5. Settings additions.** In `IdentityHubScreen` (or a new "Chat e
identidades" section): device management (`GET /api/devices`,
`POST /api/devices/revoke` — clear UI list with friendly names/last-seen),
and "Vincular cuenta de chat externa" (solidarity linking; writes the
reciprocal `com.para.identity.linkedChat` records, verified via
`verifyChatLink`'s algorithm client-side).

## User stories (flows and the actions each requires)

### US-1 — María checks her community (the daily loop)

María opens PARA after work. **Actions:** app start → M8 session restored
(`restoreM8Session`) → SSE connects (`/api/events`, Last-Event-ID from
storage) → `chat.unread` events arrive for Chamber A → bottom-bar Chat badge
shows 4 → tap Chat → Messages tab, Comunidad section, "Asamblea CDMX —
Cámara A" row with badge → tap → native room screen loads via device session
(sliding-sync scoped to the room) → reads timeline → back → badge clears
(`mark-read` mutation + the SSE clear event updates her other devices) →
sees "Votación abierta" pill (from a `proposal.state` event) → taps into the
proposal → votes. **Objectives met with:** SSE badge, native room, mark-read
feedback, proposal notification.

### US-2 — Pedro moderates a report

A member reports an abusive message. **Actions:** Pedro taps the Messages
row → long-press a message → "Reportar" (`POST /api/moderation-report` —
F9: requires active membership) → later opens Comunidad → Moderador
dashboard (`GET /api/moderation-dashboard`, authorized by his
moderator/owner role) → reviews the report → applies a sanction
(`POST /api/moderation-sanction`, `community.moderate`) → the sanctioned
user's badges recompute → their client receives `badge.updated` (direct
audience). **Objectives met with:** role-aware moderation routes, badge SSE.

### US-3 — Ana links her solidarity account for party DMs

Ana is in a political party hosted on solidarity.social. **Actions:**
Settings → "Chat e identidades" → "Vincular cuenta externa" → picks
solidarity.social → logs in with her solidarity Matrix account (their OIDC/
password flow — pending their answer on third-party client login) → app
writes `com.para.identity.linkedChat` to her PARA repo and guides the
reciprocal record on the linked account → verification runs
(reciprocity check) → Personal section appears with her solidarity DMs →
she reads/writes E2EE DMs under that profile. **Privacy invariant:** the M8
bearer never leaves PARA's own services; the solidarity session lives in
iM8's encrypted store, not in the PARA backend. **Blocked on:** solidarity's
client-login answer; the UI ships behind the same flag.

### US-4 — Luis adds a second device and retires the first

Luis buys a new phone. **Actions:** PARA login via M8 → first chat open mints
a device session (new deviceId, friendlyName "Pixel 9") → E2EE verification
flow (QR/emoji comparison against the old device — phase 2 crypto, engine
already supports it) → old phone: Settings → devices list (`GET
/api/devices`) shows both with last-seen → "Revocar" on the old one
(`POST /api/devices/revoke`) → its Matrix token dies server-side. Three
distinct sign-outs stay separate in UI copy: cerrar sesión PARA (M8),
revocar dispositivo Matrix, salir de una comunidad.

### US-5 — Sortition selects María for an assembly

**Actions:** none by María — the bridge processes the run (role-gated),
publishes `sortition.selected` (direct) + Expo push "Fuiste seleccionada" →
her badge and the Cabildeos list show the assembly → she taps through to her
cryptographic proof (`GET /api/sortition-proof-as-record` — public,
verifiable by anyone).

### US-6 — Institutional handover (reserved)

The Secretariat inbox transfers to a successor without sharing personal
credentials: owner transfers room authority per Matrix power levels;
institutional Matrix accounts own their rooms; the bridge observes, never
custodies. Ships with the Trabajo context.

## Implementation notes for the app repo

- `matrixBridgeFetch` wrapper already handles M8 auth/refresh — SSE should
  use it for the initial connect; token refresh mid-stream = reconnect.
- Keep `useCommunitySpaceQuery` for room resolution (space id fallback).
- The unomed lab client already isolates crypto stores per `scopeId` — use
  one scopeId per context profile, not per community.
