# Permissioned-data port

**Status:** implementation in progress. This document is the integration
boundary for OD-P1; it does not make community spaces a Q4 pilot dependency.

## Checkpoint — 2026-09-16

Worktree: `WatZappa-permissioned-data`, branch `codex/permissioned-data-port`,
based on `4e0ddd958`. The port implementation is committed (`61d9f2e95`, then
`e12b62135` checkpoint recovery and `dff8080f3` sync-blob privacy), and the
branch has **merged main** (at `5572c5a36`) in `3930c8eba`, adopting main's
`packages/car`, PDS/OAuth reconciliation, oauth-provider-ui and Matrix-bridge
work. Main's own worktree and its uncommitted changes were not touched. The
dependency overlay reuses main's install plus local workspace symlinks
(`@atproto/car`, `@atproto/lex-cbor`, `@atproto/lex-data`, `varint` for
`packages/car`); this is not a clean lockfile installation. Upstream
(`bluesky-social/atproto` `permissioned-data`) remains a behavioural reference
only — never a merge source. Do not copy upstream files wholesale.

## Checkpoint — 2026-09-14 (superseded)

Worktree: `WatZappa-permissioned-data`, branch `codex/permissioned-data-port`,
based on `4e0ddd958`, with the implementation saved in checkpoint `61d9f2e95`.
The isolated worktree was restored from that branch after its directory was
removed; none of the checkpointed source was lost. Main is now at `5d79dc756`,
including PDS/OAuth reconciliation, CAR build repairs, and further institutional
Matrix work. Integrate against current main by reviewing each overlapping file;
this worktree is not yet rebased or merged into main. Do not replace main's
uncommitted changes or copy upstream files wholesale.

| Area                                              | Current implementation                                                                                                                                                    | Remaining before route use                                                                              |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Space persistence, blobs, CAR, client attestation | Implemented and tested locally                                                                                                                                            | Manual integration with current main and full regression run                                            |
| PARA projection                                   | Authority-store state, members, receipts, snapshot/patch semantics, ordering, digest chain, retained deletion watermark; pinned-key signed intake and latched stale state; single-use challenge checkpoint recovery (local component) | Production trust configuration, authenticated transport and governance wiring for recovery              |
| AppView policy publisher                          | Ed25519 signer; independent normalization/digest encoding; public JWKS; transactional Postgres outbox with ordered leases and acknowledgements; tested against PDS; checkpoint reservation, fencing and exact receipt confirmation | Governance-authorized input, authenticated delivery worker and checkpoint transport                     |
| PARA resolver                                     | Pure rule-based resolver; transactional input reader; active state, role expiry, client/collection/action scope, freshness and epoch checks                               | Reviewed production rule configuration and wiring in the same transaction as writes                     |
| M8 assurance                                      | Standalone draft verifier, fixed public Ed25519 JWS vectors, bounded JWKS fetching and rotation; durable PDS challenges with atomic nonce/JTI consumption                 | Broker signer/JWKS agreement and implementation; authenticated issuance, rate limits and cleanup wiring |
| Credential exchange                               | No registered route or context wiring                                                                                                                                     | Complete integration and existing-auth regression tests, then a disabled feature gate                   |
| Institutional chat                                | Separate authorization policy on main; not imported by this branch                                                                                                        | Bridge membership persistence and route enforcement, maintained by that workstream                      |

Private file bytes remain an AT Protocol responsibility. Institutional Matrix
permissions may authorize seeing a file reference; they cannot authorize the
bytes behind it. This port does not yet provide a usable private-file service.

Focused checkpoint verification (historical figures, produced under the former
dependency overlay and **superseded** by the reproducible run below): seven PDS
suites, 111 tests passed (space storage, PARA projection storage/intake,
resolver, client attestation, M8 verifier and durable store), plus one
AppView/PDS interoperability suite with 17 tests and one Postgres outbox suite
with 18 tests. The checkpoint-recovery stage added a PDS challenge/install
suite with 26 tests and a Postgres-to-SQLite recovery suite with 10 tests. The
space-blob sync-privacy port added a route-level suite with 2 tests that boots
this worktree's own PDS against its PLC mock.

**Reproducible verification — 2026-09-18 (Gate 0 closed).** After replacing the
dependency overlay with the branch's own install (`nodeLinker: hoisted`, now
honored via `pnpm-workspace.yaml` as `.npmrc` intended; Node 22; lockfile passes
`pnpm install --frozen-lockfile`; `pnpm run build` clean), all suites run and
pass against this tree alone:

| suites | runner | tests |
| --- | --- | --- |
| 9 PDS suites (space storage, para-policy storage/intake/checkpoint/resolver, client attestation, m8 verifier/store, space-blob privacy) | jest | **140/140** |
| 3 AppView suites (publisher interop, Postgres outbox, checkpoint recovery) | vitest + temp Postgres | **45/45** |
| `@atproto/space` | vitest | **100/100** |
| `@atproto/car` | vitest | **37/37** |
| **total** | | **322 across 12 suites** |

Reproduce with Node 22 (.nvmrc): `packages/pds` →
`../../node_modules/.bin/jest tests/{space-storage,client-attestation,m8-assurance-store,m8-assurance-verifier,para-policy-storage,para-policy-resolver,para-policy-intake,para-policy-checkpoint,space-blob-privacy}.test.ts`;
`packages/bsky` → `../../node_modules/.bin/vitest run tests/para-policy-*.test.ts`
(needs a local Postgres in `DB_POSTGRES_URL`; the suites create one random
schema each and drop it); `--root ../space` / `--root ../car` for those packages.
The former Jest ESM blocker (multiformats/uint8arrays export maps without a
`require` condition) is resolved by compiling tests to CommonJS through
`@swc/jest` (`.mjs` included) plus a repo-root custom resolver
(`jest.esm-exports-resolver.cjs`) that falls back to the package's
`import`/`default` export targets. The obsolete `varint` shim is removed. This
Jest change is test-infrastructure only and should be offered to main, where
the same pre-existing blocker reproduces.
The 22 new durable-store tests exercise real SQLite, separate connections,
restart persistence, expiry, migration round trips, bounded cleanup and forced
write-failure rollback. Another 32 signed-policy intake tests cover trust bindings,
key rotation, replay, invalidation, concurrent updates and persistence failures.
The 26 checkpoint tests cover challenge eligibility (stale and ready-but-lagged),
pending bounds and bounded
cleanup, full install with revoked members still denied, chain continuation,
catch-up of a ready projection and its invalidation by a concurrent ordinary
delta, invalid envelopes that do not consume challenges, floor/chain violations,
expiry, challenge reuse, state advanced between issuance and installation,
forced write-failure rollback of consumption, concurrent single-winner
installation, checkpoint-migration round trip and configuration validation. The 10
recovery tests
cover the end-to-end lost revocation with superseded-event fencing and resumed
ordered delivery, catch-up of a ready receiver after its undelivered head
expired (proving an accepted receipt cannot clear the latch), lost-response
reconciliation with worker fencing, publisher
restart persistence, floors advancing between issuance and installation with
re-preparation above the new floors, lease states and duplicate preparation
refusal, forged confirmations, publisher challenge validation and bounded
snapshot size, the governance-transaction precondition, and migration round
trips of the new outbox columns.
The interoperability suite runs the real AppView signer, PDS verifier/storage and
resolver against temporary SQLite; it is not a deployed HTTP delivery test.
The outbox suite uses a dedicated random schema per test in local Postgres,
including concurrent writers/workers, transaction rollback, restart, lease expiry,
migration round trips, and delivery of stored envelopes through real PDS intake.
Targeted verifier/store/intake/publisher/outbox/test typechecking uses the PDS's
existing `noImplicitAny: false` setting and mappings to built fetch/JWK declarations.
The latest Jest run uses the package's own config with the existing dependency
overlay; it no longer requires the earlier temporary Jest mappings. The installed
runner is invoked directly from the PDS directory to avoid pnpm changing that
overlay. The AppView compatibility suite likewise uses its installed Vitest runner
and package config directly. The outbox suite requires Postgres, but no Redis;
it bypasses the shared dev-infra cleanup wrapper and drops only its own random
schemas. The older publisher suite needs neither service.
All nine suites were rerun successfully after restoring the worktree. The outbox
rerun used a temporary loopback-only Postgres instance because the previous test
database was stopped. Targeted typechecking and lint of the latest fault-watermark
and receipt-reconciliation changes passed; lint disables import resolution only
for the local dependency overlay. Installed dependencies and built declarations
come from main, not a fresh installation of this branch's lockfile.
This is not a clean full workspace build or full PARA integration run.

## Decision

WatZappa will hand-port the permissioned-data PDS implementation from
`upstream/permissioned-data@89deb9faca20e56fa2a262fe9746ed52bc1095ba`.
The histories have no merge-base. Upstream is therefore a behavioural reference,
not a source tree to merge, cherry-pick, or copy wholesale.

The `com.atproto.space` and `com.atproto.simplespace` lexicons and syntax
support track upstream verbatim and are not part of this port: as of
2026-09-18 they are byte-identical to upstream `permissioned-data@907f41a7b`,
including the `putMember` / `readPolicy` / `writePolicy` reshaping that
replaced `addMember`.

`packages/space` is **no longer** byte-identical, in either direction, and the
earlier claim that it was is withdrawn. It differs from the pinned reference
`89deb9fac` in four files (the `@atproto/car` adoption), and from upstream
`907f41a7b` in ten files, because upstream moved 76 commits since the pin.
Re-basing it on current upstream is tracked as its own task; do not assume the
vendored copy matches either reference.

The work of this port is the dormant PDS runtime: storage, auth, context,
handlers, and tests.

## PARA policy boundary

Spaces separate three concerns which upstream deliberately keeps generic:

1. The AppView is the source of truth for community governance state.
2. The PDS holds a versioned, locally enforced projection of membership and
   roles. It is the data-plane decision point for credential issuance and every
   write.
3. iM8 is credential assurance, not a SimpleSpace policy. Its verification is
   isolated behind a PARA-owned verifier.

The generic `memberListPolicy` remains useful for membership admission. PARA
roles and collection/action rules belong in a `PolicyResolver` sidecar, rather
than a new generic simplespace policy type. A community space's `skey` must be
an immutable identifier; a slug is only a mutable display alias.

The upstream managing-app callback alone is insufficient for PARA community
writes: it participates in credential issuance and notification, but does not
make a role-aware decision before a write is persisted.

**Community decision:** use a PDS-resident, versioned membership/role
projection as the enforcement input (initially `member-list` plus the PARA
`PolicyResolver`), not `managingAppPolicy` as the sole gate. The AppView remains
the governance source of truth and publishes signed/versioned deltas into that
projection. This removes an AppView availability dependency from every
credential decision and gives role changes a policy epoch that immediately
invalidates stale credentials. A managing-app callback can later be retained
as a reconciliation signal, but never as the only write authorization check.

### PARA policy-projection contract

The existing AppView community model already distinguishes `pending`, `active`,
`left`, `removed`, and `blocked` membership, and stores both flat roles and
time-bounded `roleAssignments`. The PDS projection must retain those semantics;
the generic `simplespace_member` table is useful for a boolean member-list gate,
but is intentionally not sufficient for PARA role enforcement.

The future PARA projection row must carry, at minimum, the immutable space key,
member DID, membership state, roles, effective role assignments, a monotonic
policy epoch, source record URI/CID, received time, and the signed control-plane
delta version. The immutable space key is derived from a stable community ID or
board URI—not the mutable governance `slug`.

`PolicyResolver` should receive `{ space, principalDid, clientId, action,
collection, now, policyEpoch }` and return an explicit allow/deny decision,
denial code, and effective epoch. It runs both when a credential is issued and
before a role-protected write is persisted. A credential carries the epoch it
was issued under; a mismatch with the locally projected epoch revokes it even
if its time-to-live has not elapsed.

## Credential assurance

A PARA space credential can be issued only after an assurance verifier binds:

- the requesting user's DID;
- the OAuth client identity and its attestation;
- the request DPoP key thumbprint;
- the target space and PDS audience; and
- a fresh iM8 assertion with defined expiry and replay semantics.

The existing iM8 login factor proves only that a `createSession` request was
checked. It must not be treated as an enduring attribute of a PDS OAuth token.
The default upstream credential lifetime is two hours, so community credentials
must either be short lived or checked against a policy/revocation epoch before
use.

## Credential protocol decision

The current `validateIm8Token()` helper calls M8's `/sessions/me` endpoint and
returns only a DID and optional session ID. It has no audience, nonce, client,
DPoP-key, expiry, or replay binding. It is therefore sufficient for interactive
login 2FA, but **not** an input to a permissioned-space credential exchange.

Do not overload upstream's `clientAttestation` field with an M8 bearer token.
Those values prove different things and mixing them would make the allow-list
check ambiguous. Before `getSpaceCredential` is registered, M8 needs to issue
a short-lived, signed assurance assertion bound to the requested user DID,
OAuth client, DPoP JKT, authority/PDS audience, and a one-time nonce. PARA then
needs a distinct, versioned credential-exchange surface (for example
`com.para.space.getAssuredCredential`) or an upstream-compatible extension
that carries that assertion explicitly.

Until that contract exists, no space-credential route may be enabled—even for
owner-only spaces. The storage work can proceed safely because it has no route.

### Proposed M8 assurance-assertion contract

This is the minimum contract for M8 review, not an enabled protocol or a
replacement for its current login-factor API.

M8 returns a compact, signed JWS with a distinct media type. The PDS accepts it
only from a configured M8 issuer and trusted key set; it must not discover an
issuer or key URL from unverified token data. The assertion must contain:

- `iss`: the configured M8 issuer;
- `sub`: the requesting PDS account DID;
- `aud`: the exact PARA credential-exchange audience for this PDS;
- `client_id`: the OAuth client that produced the separately verified client
  attestation;
- `cnf.jkt`: the thumbprint of the DPoP key on the exchange request;
- `space`: the exact immutable space URI;
- `nonce` and `jti`: PDS-issued challenge and M8 assertion identifiers;
- `iat` and `exp`, with a maximum assertion lifetime of 60 seconds; and
- an explicit assurance level/version claim that M8 can evolve without silently
  broadening access.

The PDS verifies signature, issuer, type, audience, all request bindings,
freshness, and both `nonce` and `(iss, jti)` single use before issuance. It
must consume those values only after every validation step passes. M8 may
retain its own replay protection, but the relying PDS owns the final replay
record until `exp` because it observes the credential exchange.

The policy epoch is deliberately **not** an M8 claim: governance belongs to
the AppView-to-PDS projection. The PDS checks the current local epoch through
the `PolicyResolver` and embeds that epoch, with a short credential lifetime,
in the PDS-issued space credential. A role change can then invalidate a
credential without asking M8 to understand PARA governance.

### Draft verifier profile implemented locally

The fixture profile uses exact `typ: application/para-m8-assurance+jwt`,
`alg: EdDSA`, a nonempty `kid`, and
`assurance: { version: 1, level: "m8-session-verified" }`. Its example audience
is `${pdsDid}#para_assured_credential`; the relying PDS supplies the exact audience
independently of the token. This is a proposal for broker interoperability,
not evidence of agreement or an assertion issued by the live broker.

The verifier accepts only its configured HTTPS JWKS URL, caps decoded JSON at
64 KiB, and allows one forced refresh per minute per verifier instance for an
unknown key. Bad signatures with known keys do not force refreshes. A fixed
clock and public-only pre-signed vectors cover success, expiry, wrong type and
audience, missing nonce, excessive lifetime, rotated/unknown keys and tampering.
Expected-binding tests additionally cover DID, client, DPoP key, space and nonce.

`M8AssuranceStore` implements the injected consumer in the PDS account database
(migration `011`). It creates random 256-bit, 60-second challenges, binds them
to the configured issuer/audience and authenticated DID/client/DPoP/space, and
stores nonce and JTI hashes. The conditional challenge update and unique
`(issuer, jtiHash)` receipt insert share one transaction: a receipt conflict or
database failure rolls back the nonce update. Two independent calls to
`uniqueSpaceToken()` are insufficient. Challenge expiry has no clock tolerance;
assertion receipts remain through `exp + 5 seconds`, matching verifier tolerance.
The issuer must assign a distinct JTI to each assertion, never reuse one for a
later assertion after receipt expiry.

Issuance caps outstanding challenges at ten per DID; bounded maintenance removes
at most 500 expired challenges and 500 issuer-specific receipts per call. These
are storage safeguards, not endpoint authentication or rate limits. No route or
`AppContext` constructs this store yet. Before exposure, derive bindings from
verified OAuth/DPoP state, wire issuance rate limits and periodic cleanup, and
keep membership/role authorization in the separate PARA resolver. Successful
assurance consumption alone does not grant a credential or file access.

Current M8 `/sessions/me` login remains unchanged. The broker assessment found
no compatible deployed JWS/JWKS surface; broker implementation and
interoperability tests are still required.

### Projection storage and resolver semantics

Each space has exactly one materialized projection in its authority actor DB.
The transactor checks `SpaceRef.spaceDid` against that store's DID. The resolver
must be called with `getPolicyInput()` inside the same authority-store transaction
as the write; it makes no network requests.

The storage API explicitly distinguishes full snapshots from member patches.
Omission from a snapshot retires a previously stored member to `removed` and
clears roles. Omission from a patch retains the member; revocation needs an
explicit `removed`/`blocked` update. Structured role assignments override flat
roles when nonempty; `validFrom` is inclusive and `validUntil` exclusive.

A new store requires a trusted full bootstrap snapshot. It may start at an
existing positive source version and epoch. Subsequent versions are contiguous
**per space**, each epoch strictly increases, and each update names the previous
accepted projection digest. Receipts retain the signed envelope and metadata;
the digest also binds the normalized member payload so a conflicting retry is
rejected. The digest is SHA-256 over the fixed-field-order JSON emitted by the
transactor, including its signed envelope. This draft encoding must be frozen
with the AppView publisher before use across services.

Space deletion retains receipts and the high-water mark, sets the projection to
`space-deleted`, and requires a newer chained full snapshot on reactivation.
The resolver denies missing, non-ready, expired or mismatched projections, and
checks both source issue time and local receipt time against a required freshness
bound. Identical retries do not refresh that time. Unchanged members may have an
older member source version; credentials compare against the current space epoch.

Storage itself rejects out-of-order deltas without changing the projection.
`ParaPolicyIntake` now verifies incoming envelopes before storage and commits
`stale` status for authenticated forward gaps, current-version equivocation,
chain mismatch or epoch rollback. Invalidation and the ordering check share the
same authority-store transaction: the error is returned from the transaction
and thrown only after commit. Unauthenticated input, invalid payloads and older
replays cannot invalidate a ready projection. Members, accepted receipts and the
last accepted version remain unchanged by invalidation.

Stale state is deliberately latched, including across process restarts. Even a
subsequent ordinary full snapshot cannot clear it: doing so could re-enable old
membership before a known missing revocation. An authenticated recovery/checkpoint
protocol remains required before route use; durable verified high-water marks
are now implemented as prerequisites, not as permission to reset stale state.
Do not manually clear `stale` or bypass intake to recover a live stream.

Migration `901-para-policy-fault` adds `para_space_policy_fault`: independent maximum verified
source-version and policy-epoch floors, each retaining its signed evidence.
The maxima are collected in the same transaction as stale invalidation and
continue increasing for fresh authenticated messages received while stale.
Invalid signatures and older accepted-version replays do not change them.
The floor record never replaces accepted membership, epoch or digest state;
repeated evidence neither lowers a floor nor refreshes its observation time.

### Draft signed AppView intake profile

The standalone intake is not registered with `AppContext` or any endpoint.
Its operator-supplied configuration binds one authority store and exact space,
source record URI, issuer DID and audience, with an explicit positive maximum
assertion age and bootstrap permission. It accepts only pinned public Ed25519
keys with distinct key IDs. Rotations replace trusted configuration; there is
no URL discovery or token-driven key fetch.

The draft compact JWT uses exact header fields `alg: EdDSA`,
`typ: application/para-policy-delta+jwt`, and `kid`. The strict payload is
`{ iss, aud, iat, exp, delta }`, where `delta` contains the projection fields
except `signedDelta`. The stored receipt is the verified compact envelope,
never a nested caller-provided receipt. The issuer and exact audience are checked
again after signature verification; `delta.sourceIssuer`, `space` and `sourceUri`
must match configuration, and `delta.issuedAt` must equal `iat` to the second.
Expiration, future issuance and configured maximum age/lifetime are checked
before intake and again inside each transaction attempt, without clock tolerance.
Source URI/CID are signed publisher attestations, not independent repo proofs.

Input is limited to the existing 16 KiB signed-receipt bound. Larger snapshots
and authenticated recovery need a reviewed checkpoint/transport design, not a
silent size increase. Publishers must retain byte-identical envelopes for retries
and use the documented projection-digest encoding. This profile and its tests
are local draft artifacts, not evidence of a compatible deployed AppView signer.

### AppView publisher interoperability

`packages/bsky/src/para-policy/publisher.ts` now implements a standalone signer
using an operator-supplied Ed25519 private key. It owns issuer/audience/space/source
bindings and issue/expiry times, validates and normalizes authorized member input,
and returns immutable signed bytes, the projection digest, version, epoch and
expiration. Its JWKS accessor returns public material only. It has no production
dependency on PDS code; compatibility tests exercise the two implementations
independently, including normalized role assignments, omitted fields, snapshot
and patch semantics, digest chaining, rotation and receipt retries.

The local admission → revocation test proves that a signed AppView update can
change PDS authorization from allowed to denied, while a skipped update makes
the projection stale. This is component-level interoperability, not live delivery.

The signer deliberately does not read `para_community_membership` directly:
that index stores record-supplied roles and is not itself proof of authority to
grant private-file access. A reviewed governance authorization/materialization
boundary must supply publisher input. The durable transactional outbox now
allocates per-space versions/epochs, stores complete prepared artifacts before
send, retries the exact bytes, and acknowledges accepted digests. Expired
artifacts cannot be re-signed at the same version; missed/expired delivery needs
the authenticated recovery design. Neither the indexer nor a context/route invokes
the publisher yet. Private keys are caller-provided and never generated or persisted
by this module; external key-management integration remains a deployment concern.

### Durable AppView outbox

Migration `20260914T180000000Z` adds the publication stream and immutable-envelope
outbox tables. `enqueue(eventId, change)` requires the same Postgres transaction
as the authorized governance mutation. A per-space row lock serializes version
and epoch allocation, starting at one for a new full bootstrap snapshot. Failed
signing, persistence or governance work rolls back the stream and queued bytes
together. Existing streams cannot silently change issuer, audience or source URI.
Bootstrap of an already populated receiver requires the future checkpoint protocol.

Stable event IDs deduplicate semantic retries after normalization; reuse with
different material is rejected. Up to 100 unacknowledged updates may be queued per
space, providing backpressure rather than unbounded accumulation. Acknowledged
envelopes/event IDs are retained; pruning needs a separately reviewed retention
and recovery policy. No sensitive signing key is stored in these tables.

`claim()` leases only the first unacknowledged version for 30 seconds. Competing
workers cannot claim later versions, and lease takeover returns exactly the
same signed bytes with a fresh fencing token. `acknowledge()` advances only on
the exact head version/digest and current unexpired lease token. The future
transport must authenticate the receiver response before calling it; this local
method does not authenticate network responses itself. Network I/O must occur
outside the transaction. A still-live lease can acknowledge a receiver's earlier
success after assertion expiry, avoiding rejection of a valid in-flight response.

An expired unleased head latches `recovery-required`; later versions
are not delivered or regenerated. Expired/ambiguous delivery and lost acknowledgements
therefore require the authenticated checkpoint/reconciliation protocol before
operational use unless an exact accepted receipt resolves the lost acknowledgement
as described below. There is no worker, scheduler, HTTP route, indexer or governance
mutation wired to this outbox yet. The implementation uses a narrow typed view
of AppView's existing Postgres connection and its INT8-to-number parser.

### Receipt reconciliation versus checkpoint recovery

`ParaPolicyIntake.getAcceptedReceipt()` returns the current exact version/digest
and configured issuer/audience/space/source binding only for a non-deleted,
ready projection. It returns no receipt for stale, absent or source-mismatched
state. A receipt is evidence of previously accepted bytes, not proof of current
membership authorization or assertion freshness.

`ParaPolicyOutbox.reconcileAccepted()` may consume that receipt only after the
caller authenticates the receiver transport. It matches the complete binding,
version and digest to a persisted outbox artifact, atomically records acknowledged
versions and fences their old leases. A later expired head remains blocked; an
earlier receipt cannot move the cursor backward or clear a stop on that head.
This recovers lost acknowledgements even after the original assertion expires,
without touching PDS policy state or re-signing an old version. There is no network
authentication implementation or public reconciliation endpoint in this slice.

A genuine missing-update fault still needs a new full checkpoint. That protocol
is now implemented locally as `ParaPolicyCheckpoint` (PDS) plus publisher and
outbox checkpoint paths (AppView); see the next section. It is exercised
component-to-component against real SQLite and Postgres, not over HTTP.

### Authenticated checkpoint recovery (implemented locally, route-disabled)

The checkpoint envelope is deliberately not an ordinary delta: it uses
`typ: application/para-policy-checkpoint+jwt` with the same strict header and
pinned-key rules, and its strict claims are `{ iss, aud, iat, exp, checkpoint }`
where `checkpoint` carries `{ challenge: { id, secret }, kind: "snapshot",
space, sourceUri, sourceCid, sourceIssuer, sourceVersion, policyEpoch,
previousDeltaDigest, issuedAt, members }`. A checkpoint is always a full
snapshot; `previousDeltaDigest` continues the chain from the challenged accepted
digest, and the projection digest is computed with the same fixed-field
encoding as an ordinary delta — over the projection fields plus the checkpoint
envelope bytes — by two independent implementations (publisher and transactor)
so tests detect encoding disagreement. Envelope input stays bounded by the
16 KiB signed-receipt limit: larger recovery snapshots are rejected acotadamente
and require a reviewed transport, never a silent size increase or a partial
install.

The PDS issues a challenge only for a live, non-deleted space with an existing
projection for the configured source, in one of two recoverable conditions: a
verified fault (`stale`), or a healthy-but-lagged `ready` projection whose
publisher stream latched `recovery-required` after an undelivered head expired.
Without the second case that latch has no exit: the expired artifact cannot be
re-signed, an accepted receipt for the older version cannot clear it, and
forcing a deliberate gap at the receiver just to reach `stale` would be worse.
The challenge is single-use: a random 128-bit id plus a 256-bit secret whose
SHA-256 is the only persisted form. It binds issuer, audience, authority,
immutable space, source URI, the exact accepted version/digest, and both
verified floors (the fault maxima when a fault exists, otherwise the accepted
state's own version/epoch), with an operator-configured lifetime (1–3600 s,
tested at 300 s), at most four outstanding challenges per space, and bounded
expiry cleanup. Absent projections return no challenge: bootstrap is not
recovery.

Installation re-verifies signature, type, bindings and freshness, then inside
one authority-store transaction re-checks the challenge (unconsumed,
unexpired, secret hash), the space, the accepted state (still `ready` or
`stale` at exactly the challenged version/digest — any ordinary delta that
moved a healthy projection in the meantime invalidates the challenge) and both
current floors; requires the checkpoint
version above the version floor and the epoch above the epoch floor and
chained to the challenged digest; consumes the challenge with a conditional
update; and installs the snapshot, its delta receipt and a checkpoint receipt
row. Any write failure rolls the consumption back; only a complete valid
install can replace the projection, and only such an install moves `stale` to
`ready`. Snapshot semantics preserve PARA rules:
omitted members retire to `removed`, structured assignments keep precedence,
and a revoked or blocked member stays denied after recovery. If any accepted
state or floor advanced since issuance, the challenge is rejected
(`CheckpointStateAdvanced`) and a fresh challenge must be issued; re-delivering
installed bytes is refused (`CheckpointChallengeConsumed`) — after a lost
response the only path is `getCheckpointReceipt()`, which reports the exact
installed checkpoint while it is still the accepted projection, for the
caller-authenticated reconciliation below.

On the publisher side, `prepareCheckpoint` runs inside the same authorized
governance transaction as the snapshot decision (there is still no governance
adapter; the precondition is explicit). Under the existing stream lock it
reserves `sourceVersion = max(stream head, challenge version floor) + 1` and
`policyEpoch = max(stream epoch, challenge epoch floor) + 1` — two independent
dimensions — and persists the stable event id, challenge-bound input digest,
signed bytes and digest atomically, latching the stream `checkpoint-pending`.
Ordinary `enqueue`/`claim` stay blocked while a checkpoint is pending. A new
checkpoint may only be prepared after a pending one expires (it is then marked
superseded); versions are never re-signed. `claimCheckpoint` leases the pending
checkpoint with the same 30-second fencing tokens; `acknowledgeCheckpoint`
confirms only the exact version/digest/challenge id under the current lease,
and `reconcileCheckpoint` accepts the authenticated receiver receipt
idempotently after a lost response. Either path marks superseded the replaced
pending events (retained for traceability, never redelivered), advances the
acknowledged cursor to the checkpoint and releases the stream to `ready`.
Previous workers' tokens, expired leases, forged or mismatched receipts and
late envelopes cannot confirm, revert or bypass the recovery.

There is still no production transport: the challenge secret and both receipts
are payloads whose callers must authenticate the other service, and no HTTP
interopability exists. Oversized snapshots are rejected boundedly as above.

Production action/collection/role mappings and freshness intervals are not
invented here. The resolver has no permissive default rules. Institutional
rosters must remain private and distinct from public community governance.

### Key custody (operational guidance, pending DevOps decisions)

The publisher's Ed25519 keys are the authorization root of the whole policy
chain, yet the implementation deliberately holds no key material: publishers
receive caller-provided private keys, expose public-only JWKS, pin trust in
PDS configuration (1–16 kids), and store no signing material in the outbox.
Rotation is a trusted-configuration update with an overlap window, and
monotonic floors make rollback impossible even for the legitimate key holder.
Custody, escrow, rotation cadence, the compromise runbook and the signing
service's placement in the deployment tiers are documented in Spanish for the
future operators: [KEY_CUSTODY_ES.md](./KEY_CUSTODY_ES.md). No production key
or identity exists yet.

## Matrix boundary

The current firehose-to-Matrix membership projection remains the pilot path.
A later space-oplog consumer needs its own least-privilege service identity,
key custody, auditing, and reconciliation plan. It must never use a person's
iM8 session and must not receive personal civic-tree or ballot-sensitive data by
default.

## Manual-port order

1. Port the actor-store migration, schema, blob reachability, and space reader/
   transactor behind no externally reachable route.
2. Port client-attestation verification and the replay primitive as narrow,
   unreachable additions. Do not alter `AuthVerifier` until the PARA assurance
   assertion is specified; preserve PARA's existing authentication branches.
3. Add `SimpleSpaceManager`, the PARA assurance/policy adapters, and context
   wiring behind a disabled feature flag.
4. Register handlers only after the complete storage and authorization suite is
   green. Keep broad sync, export, and notification surfaces unavailable in the
   first personal-space slice.
5. Deliver an internal owner-only personal civic tree for one collection before
   introducing community spaces.

Each step is adapted against current WatZappa types and imports, then reviewed
as a semantic diff. It must not replace a current file with its upstream version.

## Manual merge map

| Upstream area                                                             | Disposition in PARA         | Reason                                                                                                                                             |
| ------------------------------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Actor-store migration, schema, space reader/transactor, blob reachability | **Ported, inert**           | Local persistence only; no route or policy decision is exposed.                                                                                    |
| CAR stream helper | **Replaced by `@atproto/car`** | The duplicated common/repo CAR code and varint shim are retired; repo re-exports the car package and the vendored space package consumes it directly. |
| Replay namespace and client-attestation verifier                          | **Ported, inert**           | Provides verified client identity and single-use tokens, but cannot issue a credential.                                                            |
| `AuthVerifier` space-token and DPoP paths                                 | **Adapt later**             | It touches existing PARA/OAuth authentication behavior; add only after the assurance exchange and its tests are defined.                           |
| `SimpleSpaceManager` / `managing-app` callback                            | **Replace the policy seam** | Generic callback authorization is not an adequate community role/write gate. Route it through the local `PolicyResolver` and versioned projection. |
| SimpleSpace configuration and owner APIs                                  | **Feature-flagged later**   | They must use immutable `skey` identifiers and PARA policy semantics before registration.                                                          |
| Credential-exchange and record XRPC handlers                              | **Blocked**                 | The current M8 bearer lookup cannot bind a user, client, DPoP key, space, and replay challenge safely.                                             |
| Notifications, remote sync, and oplog consumer                            | **Deferred**                | They introduce service identity, fan-out, reconciliation, and privacy scope beyond the personal-tree pilot.                                        |

## Next stage: assurance and policy boundary

**Objective:** make an assured credential exchange possible behind a disabled
feature flag. This stage ends with deterministic integration tests and no
publicly enabled space route.

| Order | Deliverable                            | Manual-port rule                                                                                                                       | Exit criterion                                                                                                                                                                                           |
| ----- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | M8 assertion contract and test vectors | Define a new signed assertion; do not extend or repurpose `/sessions/me`.                                                              | M8 and PARA agree on issuer/JWKS, `typ`, claims, key rotation, 60-second lifetime, nonce/JTI ownership, and error semantics. Valid and invalid compact-JWS fixtures are checked in.                      |
| 2     | Durable PARA policy projection         | Add a PARA-specific projection table and signed-delta intake; keep generic `simplespace_member` only as a boolean admission aid.       | The PDS can atomically apply ordered deltas for `active`/removed/blocked state, roles, expirations, and policy epoch; gaps, stale events, and invalid signatures fail closed.                            |
| 3     | `PolicyResolver` adapter               | Translate existing AppView membership and role-assignment semantics, not upstream `managing-app` callbacks.                            | Unit tests show exact allow/deny codes for member, moderator, expired role, unknown projection, and epoch mismatch decisions.                                                                            |
| 4     | M8 assurance verifier                  | Reuse the existing client-attestation/replay foundations, but add a dedicated PARA verifier.                                           | Verification proves signature, trusted issuer, audience, user DID, client ID, DPoP JKT, space, freshness, nonce, and JTI replay behavior; no failure path consumes a valid nonce/JTI early.              |
| 5     | Disabled credential exchange           | Add a PARA-specific exchange surface guarded by an off-by-default PDS feature flag; adapt `AuthVerifier` only at the narrow DPoP seam. | An integration test can mint a short-lived credential only when OAuth/client attestation, M8 assertion, DPoP proof, and `PolicyResolver` all agree. Existing PDS/PARA authentication tests remain green. |

### Stage-2 sequencing

1. Freeze the wire contract before creating an endpoint. The first implementation
   artifact is a fixture bundle: public M8 signing keys, valid assertions, expired and
   wrong-audience variants, reused nonce/JTI variants, and a key-rotation case.
2. Implement the projection before credential issuance. Its signed control-plane
   delta includes a monotonic version and policy epoch, so an unavailable,
   unknown, or stale projection denies rather than falling back to AppView at
   request time.
3. Add the `PolicyResolver` as a pure PDS boundary with no network call. It
   evaluates effective role assignments at request time and returns a
   machine-readable denial reason for auditing and tests.
4. Build the M8 verifier and challenge/replay store against the fixture bundle.
   It must use configured trust material and PDS-safe fetching; untrusted token
   claims never choose an issuer or JWKS URL.
5. Hand-port only the required delegation/DPoP behavior from upstream
   `AuthVerifier`, line by line, then wire the new exchange behind the disabled
   flag. Do not register generic `com.atproto.space` handlers in this stage.

### Stage-2 test gate

The feature flag remains off until all of the following pass:

- valid exchange, wrong M8 issuer/type/audience/user/client/space/DPoP binding,
  expiry, key rotation, nonce replay, and assertion-JTI replay;
- forged, mismatched, expired, and replayed client attestations;
- DPoP proof replay and credential/key-binding mismatch;
- projection signature failure, version gap, rollback, unknown member,
  removed/blocked member, role expiration, and stale-policy epoch;
- cross-space and cross-collection denial; and
- existing targeted PDS storage, OAuth replay, and PARA community regression
  suites.

**Explicitly out of scope:** enabling a public exchange, generic space-record
handlers, community write access, Matrix-oplog sync, notifications, exports,
or a user-held M8 session as a service credential.

## Today: action plan

Completed in the isolated manual-port branch:

1. Added the actor-store migration, schema, reader/transactor, blob
   reachability checks, and a regression test. No XRPC handler or credential
   path is registered.
2. Added the narrow CAR stream compatibility layer required by the existing
   vendored `@atproto/space` package, with stream/CID-verification coverage.
3. Added the replay namespace needed for one-time space delegation and client
   attestation tokens.
4. Added a standalone `ClientAttestationVerifier` with SSRF-guarded metadata
   and JWKS fetches, client signature and audience checks, and single-use
   replay protection. It is not constructed by `AppContext` and no route can
   invoke it yet.
5. Added the authority-store PARA projection, strict payload validation,
   snapshot/patch rules, digest-linked receipts and deletion high-water marks.
6. Added the transactional policy-input reader and pure resolver with explicit
   scope rules, active membership, role expiry, freshness and epoch decisions.
7. Added the standalone draft M8 verifier and deterministic public JWS vectors.
8. Added durable PDS challenge issuance and atomic nonce/JTI consumption, shared
   assertion timing constants, migration `011`, and SQLite regression tests.
   The verifier/store are tested together, but no credential issuer or route is
   connected yet.
9. Added pinned-key signed AppView intake, explicit bootstrap/source trust and
   atomic stale invalidation for verified stream faults. Ordinary input cannot
   reset a stale projection; recovery and live publisher integration remain open.
10. Added the independent AppView signer and cross-service compatibility suite,
    including signed admission/removal, matching digests, role expiry, snapshot/
    patch semantics, key rotation and byte-identical retries. Live delivery is off.
11. Added the transactional Postgres outbox, stable event deduplication, per-space
    version/epoch allocation, fenced head-only leases, exact acknowledgements and
    expiry/recovery latch. Local Postgres-to-PDS delivery is tested; workers remain off.
12. Added durable verified version/epoch fault floors and exact-receipt lost-ACK
    reconciliation. Tests prove reconciliation leaves PDS policy unchanged and
    does not bypass a stale projection or a later expired head.
13. Added the authenticated checkpoint-recovery protocol: bounded single-use
    PDS challenges bound to accepted state and both verified floors, atomic
    challenge-consuming full-snapshot installation (migration
    `902-para-policy-checkpoint`), independent
    checkpoint signing, outbox checkpoint reservation with pending/lease fencing
    and exact receipt confirmation or reconciliation. Eligibility covers both a
    stale projection and a ready-but-lagged one whose expired head latched the
    publisher stream. Recovery is proven
    Postgres-to-SQLite with lost revocations staying denied; it remains a local
    component with no route, transport or governance adapter.
14. Ported upstream 907f41a7b manually: public `sync.getBlob` now refuses any
    blob that no public repo record dereferences (`BlobNotFound`), so
    space-only blobs are never served through public sync; bytes shared with a
    public record remain available until that record is deleted and space
    reachability still protects them. To make route-level testing possible in
    this worktree at all, the missing `src/events.ts` (present on main, already
    imported by this branch's context) and its `eventsLogger` export were
    brought over, lexicons and mailer templates were generated, and a new
    suite builds this worktree's own PDS (not the dependency overlay's copy)
    with only the PLC mock from dev-env. The guard's test fails without the
    guard, proving it is load-bearing.

Next, in order:

1. Freeze the draft M8 profile against the actual broker and add cross-service
   signing/JWKS interoperability tests. Policy epoch remains PDS-owned.
2. Wire authenticated challenge issuance, endpoint rate limits and periodic
   cleanup only as part of the disabled credential-exchange integration below.
3. Provide the governance-authorized snapshot input and an authenticated
    checkpoint transport (including oversized snapshots), then a delivery
    worker. The challenge/install/confirm protocol itself is implemented and
    tested locally; nothing is wired to a route or scheduler yet.
4. Review production collection/action/role rules and freshness policy; route
   credential issuance and every protected write through the local resolver.
5. Manually reconcile current main's PDS/OAuth changes, then expose already
   verified client/DPoP bindings through a narrow authentication seam.
6. Build the distinct PARA credential exchange behind an off-by-default flag
   and run the full assurance, cross-space, replay, revocation and existing-auth
   regression matrix. Public activation remains a later release decision.

The Matrix bridge retains its firehose membership projection for the pilot. A
space-oplog consumer is a separate service-identity and reconciliation project;
it is not part of this port's first release.

## Coordination with institutional messaging

At the restoration check, main had advanced through `5d79dc756` and retained
uncommitted changes in Matrix authorization, governance-read and moderation
routes, a plan file, and CAR test configuration. These belong to the other
workstream; their implementation and verification were not repeated here.

Keep institutional messaging work separate from public community governance and do not import its owner role
as a universal private-file grant. Referenced AT URIs still require authorization
at their PDS. Any institution-specific file rules need a private, trusted policy
source and the same complete credential/write gates as other protected resources.

## Non-negotiable tests

Before enabling any route, cover valid owner access plus invalid iM8 assurance,
wrong user binding, wrong client attestation, DPoP replay, cross-space access,
stale-policy revocation, and role-denied write operations. Run the upstream
space suite after adaptation as well as the existing PDS and Bsky regression
suites.
