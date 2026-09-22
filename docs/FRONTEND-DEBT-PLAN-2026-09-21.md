# Frontend debt plan — PARA client vs the post-CD-M6 bridge

Written 2026-09-21, after the bridge landed CD-M1/CD-M6 (verified join,
proof-of-possession identity, attestation, reconciliation, membership lease).
Grounded in a survey of the PARA repo (`~/Desktop/Home/macserver/PARA`) and
the bridge's `docs/CLIENT_INTEGRATION.md` + `docs/CHATS_SCREEN_REDESIGN.md`.

The one-line summary: **the server side of the chat identity boundary is done
and tested; the client side of it does not exist yet, and one existing call is
now broken.** Everything else in this plan hangs off that.

---

## 1. Where the client actually is (surveyed, not assumed)

| Area | State | Evidence |
|---|---|---|
| Bridge HTTP client | Good shape: M8 bearer on every call, 401→refresh→retry, 403 typed | `PARA/src/lib/matrix/bridge.ts` (+ `bridge.test.ts`) |
| Bridge query layer | 20+ endpoints wired as react-query hooks | `PARA/src/state/queries/matrix.ts` (702 lines) |
| **`POST /api/matrix-token`** | **Broken by CD-M6**: called with no body; the endpoint now requires a `SignedAssertion` (audience `session`) and returns 400 `Missing assertion` | `state/queries/matrix.ts:102` |
| `GET /api/matrix-identity` | Removed server-side; now 410 with a migration pointer | bridge router |
| Challenge/proof flow | **Not implemented anywhere in PARA** — no `/api/matrix-challenge`, no assertion signing, no `/api/matrix-attest`, no `/api/community-join` | zero hits for those paths |
| Signing primitive | **Not in PARA's im8 lib** — `src/lib/im8/identity.ts` is credential presentation, not sr25519 signing. `signIdentityChallenge` lives in the iM8 app/repo | `PARA/src/lib/im8/` |
| Real-time | None. Unread comes from a 2-minute `/api/unread` poll; zero EventSource / `/api/events` consumers | grep across `src/` |
| Chat engine | WebView shell with a bundled `matrix-js-sdk` HTML client (822 lines) | `screens/Communities/matrix-client.ts`, `CommunityChatScreen.tsx` (473) |
| Native E2EE engine | **Exists, unmerged.** The whole feature (`client.native.ts`, `oidc.ts`, `timeline.ts`, `errors.ts` + tests, `@unomed/react-native-matrix-sdk@0.9.1`) is on branch `ballot-freeze-dead-vote-mutations`, commit `dc0df7ca4` — 14 commits ahead of `main`, a clean superset. The current checkout (`remove-atproto-api`, main + 1) does not contain it, which is why the directory appears missing. Nothing was deleted | `git branch --contains dc0df7ca4`, `git ls-tree dc0df7ca4 -- src/features/encryptedChat/`, `git show dc0df7ca4:package.json` |
| Membership lifecycle UX | No handling of `membership.changed`, no room-leave/rejoin reaction, no "three logouts" model | no SSE consumers |
| Civic chain UI | matter → deliberación → policy → cabildeo not wired end-to-end (features `civicTree`, `communityCivicTree`, `personalCivicTree` exist in isolation) | `src/features/` |
| Test posture | Jest with `--bail`; the matrix surface has exactly one test file (`bridge.test.ts`) | `package.json:65` |

## 1.5 W1 progress (2026-09-21, same day)

- **W1a landed — the signing channel exists.** Chosen shape: broker-mediated
  relay (mubEZ already had sessions + single-use challenge discipline;
  deep-link return was rejected as a new cross-app protocol with cold-start
  and size pitfalls). Three repos:
  - mubEZ: `POST/GET /matrix/sign-requests[/:id][/fulfill]` — a session-bound
    mailbox. PARA deposits the bridge challenge; iM8 lists pending for the
    session and, after user approval, posts the assertion back. The relay
    **verifies before storing** (`verifyIdentityAssertion` against exactly
    that request's purpose/audience/challenge) and expires with the bridge
    challenge TTL (5 min). Unit-tested (4/4). It never sees key material.
  - iM8: `src/services/matrixSignRequest.ts` — `listPendingMatrixSignRequests`
    + `approveMatrixSignRequest(id, identity)` signing via `seedVault.
    signChallenge` (ballot identity refused by the allowlist). The
    pending-signatures approval row is now in Credentials. Typecheck clean.
  - PARA: `src/lib/matrix/im8Signer.ts` — `requestAssertionSignature` (create
    → poll ≤60s → return) implementing `MatrixAssertionSigner`;
    `ensureMatrixProofSignerInstalled()`.

- **W1a finding:** the broker (mubEZ) **verifies** proofs; it never holds
  user identity keys — iM8 signs (`signIdentityChallenge`, purpose
  `matrix-login`). The channel is the session-bound relay above.
- **W1b landed:** `PARA/src/lib/matrix/proofs.ts` — audiences
  (byte-identical to the bridge's), `SignedAssertion`, an explicit
  `MatrixAssertionSigner` seam (`setMatrixAssertionSigner`), and
  `bridgeCallWithProof()` doing challenge → sign → POST. 4/4 jest tests
  (`proofs.test.ts`).
- **W1c landed (query layer):** `useMatrixTokenQuery` now sends a session
  assertion (fixes the 400); new `useMatrixIdentityQuery`,
  `useMatrixAttestMutation` (stable per-install deviceId),
  `useCommunityJoinMutation` (idempotent; invalidates rooms/unread/space).
- **W1d landed:** `src/lib/matrix/bootstrap.ts` — `bootstrapMatrixIdentity`
  (install signer → identity → attest → join-all; attest/joins fail soft,
  identity failure is fatal) and `rejoinCommunityRoom` for lease re-entry.
  8/8 jest tests across `bootstrap.test.ts` + `proofs.test.ts`; all W1 files
  typecheck clean on PARA's mid-refactor branch.
- **2026-09-22 integration:** PARA chat entry now starts the proof bootstrap
  for the current community, stores a stable install id for appservice login,
  renews membership on foreground and reacts to Matrix room-leave events.
  iM8 Credentials now lists pending Matrix signatures with explicit public
  or anonymous approval. PARA's poller now reads the broker's actual nested
  fulfilled-assertion response. The relay accepts only the four bridge
  audiences. MAS device attestation is deferred until the real MAS device id
  exists; an install id must not be presented as that device.
- **Still open in W1:** the current homeserver requires MAS authorization and
  `/api/matrix-token` returns 503. The native Matrix engine and OIDC flow
  remain on `ballot-freeze-dead-vote-mutations`; they must be merged and wired
  before production chat can connect. Bootstrap currently joins the selected
  community only; membership-wide join needs a paginated active-membership
  source. Attest the device returned by the MAS session after OIDC.
- Note: `bridge.test.ts` fails locally from `.env` leakage
  (`EXPO_PUBLIC_MATRIX_BRIDGE_URL=192.168.1.89:3001` overriding the default)
  — pre-existing; add an env mock to W5.

## 2. Workstreams

### W1 — CD-M6 client adoption (P0: chat is broken until this lands)

**W1a. M8 signing service.** The client must sign CD-M4 assertions
(`para.identity.pop.v1`, purpose `matrix-login`, four bridge audiences).
`signIdentityChallenge` exists in iM8; PARA's in-app im8 client lib has no
equivalent. Decide the seam: M8 API endpoint (PARA asks M8 to sign; M8 holds
`identity_priv`) vs porting the signer into PARA's im8 lib. The M8-endpoint
shape keeps the key in one place — recommended. Audience constants must match
`BRIDGE_AUDIENCES` byte-for-byte.
*Accept*: integration test signing → `verifyIdentityAssertion`-equivalent
green against the bridge's published vectors.

**W1b. Bridge client helpers** (`src/lib/matrix/proofs.ts`):
`requestChallenge()` → `signAssertion(audience)` → typed wrappers for the
four proof-bearing calls (`matrix-identity`, `matrix-attest`, `matrix-token`,
`community-join`). Handle the 410 on GET identity as a migration signal.
*Accept*: `bridge.test.ts`-style unit tests against a stubbed fetch.

**W1c. Wire the flows into the query layer:**
- Replace `useMatrixTokenQuery`'s bare POST (the current 400) with the
  session-audience assertion; keep the 503 `MATRIX_CLIENT_LOGIN_REQUIRED`
  handling (current deployment is MAS-native).
- After MAS authorization completes: `matrix-attest` with the MAS deviceId
  (idempotent; this is what makes the member attributable, revocable and
  role-projectable — without it they are invisible to moderation).
- On `membership.changed → active` (and on app foreground, and when sync
  reports the account left a room it should be in — the **lease** rejoin):
  `community-join`. The join is idempotent; call it liberally.
- Delete the dead `GET /api/matrix-identity` consumer, if any.

**W1d. Migration UX.** One-time: app open → challenge → identity probe →
MAS flow → attest → join-all-communities. Surfaces: a "conectando el chat"
progress state, and a hard error only if M8 signing is unavailable.

### W2 — SSE event stream (replaces polling; the nervous system)

One `GET /api/events` connection per device (fetch + ReadableStream in RN),
reconnect with last `id`, dedup on `id`, `checkpoint` cursor persistence,
`resync_required` → one `/api/unread` + `/api/rooms` refetch. Drives: unread
badges (kill the 2-minute poll; fix the bottom-bar bug where Chat counts only
DM unread — already flagged in the redesign doc), `membership.changed`
reactions (drop caches, leave rooms, prompt rejoin), `chat.unread` room-list
refresh. This is also the transport the lease/revocation UX depends on.
*Accept*: unread updates <1s after message; badge survives backgrounding;
revocation visible in-app without pull-to-refresh.

### W3 — Chat engine: integrate the unmerged native engine, then graduate it

`CHATS_SCREEN_REDESIGN.md` plans a native engine on
`@unomed/react-native-matrix-sdk` — and that work **already exists** on
`ballot-freeze-dead-vote-mutations` (`dc0df7ca4`: the full
`src/features/encryptedChat/` feature, unomed 0.9.1, E2EE disclosure and
unread fixes). It is not deleted and not lost; it has never been merged, and
both that branch and the current `remove-atproto-api` line are independently
migrating off `@atproto/api` — parallel refactors of the same surface that
will only get harder to reconcile.

**W3a (do early, it is cheap today):** merge `ballot-freeze-dead-vote-
mutations` (main + 14) into the current line (main + 1), or rebase the
current commit onto it. Resolve the `@atproto/api` migration overlap once,
while it is one commit vs fourteen — not after both lines grow.

**W3b:** with the engine merged, wire it as the redesign doc specifies:
`CommunityChat` renders the native timeline + composer per-room, WebView
shell only as the feature-flagged fallback (`EXPO_PUBLIC_CHAT_ENGINE=webview`)
for explicitly unencrypted rooms. This is the **Phase 2 E2EE spike** gate
from MATRIX_V2 — nothing about CD-M1/CD-M6 blocks it, and the key-backup UX
must route through iM8's recovery ceremony (never a server-side copy — the
solidar.app escrow is the named anti-pattern). The engine's session
bootstrap must speak the W1 flow (challenge → proof → MAS → attest), not the
pre-CD-M6 `/api/matrix-token` call the feature was built against.

### W4 — Civic chain UI (matter → deliberación → policy → cabildeo)

The governance backend (proposals, sortition, decisions, deliberation cards)
is fully served by the bridge and already queried by
`state/queries/matrix.ts`; the user journey across screens is not wired.
Sequence: matter intake → deliberación cards → policy vote → cabildeo proof,
reusing the existing query layer. Not chat-blocking; schedule after W1–W2.

### W5 — Quality floor

- Tests: the matrix surface has one test file. Minimum: bridge client
  (auth/retry), proofs helpers, the SSE consumer (fake stream), query hooks
  (react-query test wrappers). Drop `--bail` once green so failures surface
  together.
- i18n: new strings (migration, join progress, revocation toasts) must go
  through lingui from day one — the app is bilingual by policy.
- Error UX: distinguish "bridge down" (degrade to zero-state, existing
  pattern) from "proof rejected" (surface, do not silently retry).

## 3. Sequencing

```
W1a ─► W1b ─► W1c ─► W1d          (P0 — chat broken until W1c)
              └─► W2               (parallel start after W1b; W1c's
                                  membership reactions lean on it)
W3 decision anytime; blocks only E2EE
W4 after W1–W2; W5 continuously, enforced at W1/W2 PRs
```

## 4. Open decisions (not this plan's to make)

1. **Signer seam** (W1a): RESOLVED — broker-mediated relay, landed (§1.5).
   Open product question only: whether the wallet's approval surface shows
   the audience in plain language (recommended) or auto-approves known
   audiences (not recommended — approvals are the user's control point).
2. **Chat engine** (W3): resolved by forensics — the unomed engine exists on
   `ballot-freeze-dead-vote-mutations`; the decision is merge timing, not
   rebuild. Recommendation: W3a this week while the divergence is 1 commit.
3. **Attestation prompt timing**: silent on every login (recommended — it is
   infrastructure, not a choice) vs consent-gated. CD-M6 treats it as
   operational; if the community wants it visible, that's a product call.

## 5. What "done" looks like for W1

A fresh install, given an active community membership: M8 login → challenge →
identity probe returns the locally-derived MXID → MAS authorization → attest
(deviceId appears in `/api/devices`) → community-join (rooms appear) →
message sent from the client is attributed in the member list → a moderator
sanction lands on the right account → removing the member kills their access
at next app open → after lease TTL without interaction, they are evicted, and
foregrounding the app re-admits them. All observable from the PARA app with
zero bridge-database inspection.
