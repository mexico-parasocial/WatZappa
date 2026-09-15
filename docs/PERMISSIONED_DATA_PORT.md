# Permissioned-data port

**Status:** implementation in progress. This document is the integration
boundary for OD-P1; it does not make community spaces a Q4 pilot dependency.

## Checkpoint — 2026-09-14

Worktree: `WatZappa-permissioned-data`, branch `codex/permissioned-data-port`,
based on `4e0ddd958`. These additions are local and uncommitted. The main
WatZappa checkout now includes `5e42601c7` (PDS/OAuth reconciliation) and
`f2f097d68` (institutional Matrix authorization policy). Integrate against those
commits by reviewing each overlapping file; this worktree is not yet rebased or
merged into main.

| Area                                              | Current implementation                                                                                                                                                    | Remaining before route use                                                                              |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Space persistence, blobs, CAR, client attestation | Implemented and tested locally                                                                                                                                            | Manual integration with current main and full regression run                                            |
| PARA projection                                   | Authority-store state, members, receipts, snapshot/patch semantics, ordering, digest chain, retained deletion watermark; pinned-key signed intake and latched stale state | Production trust configuration and authenticated recovery protocol                                      |
| AppView policy publisher                          | Ed25519 signer; independent normalization/digest encoding; public JWKS; transactional Postgres outbox with ordered leases and acknowledgements; tested against PDS        | Governance-authorized input, authenticated delivery worker and recovery                                 |
| PARA resolver                                     | Pure rule-based resolver; transactional input reader; active state, role expiry, client/collection/action scope, freshness and epoch checks                               | Reviewed production rule configuration and wiring in the same transaction as writes                     |
| M8 assurance                                      | Standalone draft verifier, fixed public Ed25519 JWS vectors, bounded JWKS fetching and rotation; durable PDS challenges with atomic nonce/JTI consumption                 | Broker signer/JWKS agreement and implementation; authenticated issuance, rate limits and cleanup wiring |
| Credential exchange                               | No registered route or context wiring                                                                                                                                     | Complete integration and existing-auth regression tests, then a disabled feature gate                   |
| Institutional chat                                | Separate authorization policy on main; not imported by this branch                                                                                                        | Bridge membership persistence and route enforcement, maintained by that workstream                      |

Private file bytes remain an AT Protocol responsibility. Institutional Matrix
permissions may authorize seeing a file reference; they cannot authorize the
bytes behind it. This port does not yet provide a usable private-file service.

Focused checkpoint verification: seven PDS suites, 111 tests passed (space storage,
PARA projection storage/intake, resolver, client attestation, M8 verifier and durable store),
plus one AppView/PDS interoperability suite with 17 tests and one Postgres outbox
suite with 18 tests: 146 tests across nine suites total.
The 22 new durable-store tests exercise real SQLite, separate connections,
restart persistence, expiry, migration round trips, bounded cleanup and forced
write-failure rollback. Another 32 signed-policy intake tests cover trust bindings,
key rotation, replay, invalidation, concurrent updates and persistence failures.
The interoperability suite runs the real AppView signer, PDS verifier/storage and
resolver against temporary SQLite; it is not a deployed HTTP delivery test.
The outbox suite uses a dedicated random schema per test in local Postgres,
including concurrent writers/workers, transaction rollback, restart, lease expiry,
migration round trips, and delivery of stored envelopes through real PDS intake.
Targeted verifier/store/intake/publisher/outbox/test typechecking uses the PDS's
existing `noImplicitAny: false` setting and a mapping to built fetch declarations.
The latest Jest run uses the package's own config with the existing dependency
overlay; it no longer requires the earlier temporary Jest mappings. The installed
runner is invoked directly from the PDS directory to avoid pnpm changing that
overlay. The AppView compatibility suite likewise uses its installed Vitest runner
and package config directly. The outbox suite requires Postgres, but no Redis;
it bypasses the shared dev-infra cleanup wrapper and drops only its own random
schemas. The older publisher suite needs neither service.
This is not a clean full workspace build or full PARA integration run.

## Decision

WatZappa will hand-port the permissioned-data PDS implementation from
`upstream/permissioned-data@89deb9faca20e56fa2a262fe9746ed52bc1095ba`.
The histories have no merge-base. Upstream is therefore a behavioural reference,
not a source tree to merge, cherry-pick, or copy wholesale.

`packages/space`, the `com.atproto.space` and `com.atproto.simplespace`
lexicons, and syntax support are already byte-identical to that reference. They
are not part of this port. The work is the dormant PDS runtime: storage, auth,
context, handlers, and tests.

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

Migration `004` adds `para_space_policy_fault`: independent maximum verified
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

A genuine missing-update fault still needs a new full checkpoint. The next
protocol must bind a short-lived PDS-issued challenge to the current accepted
digest/version and both verified fault floors. The publisher must serialize a
new governance-authorized snapshot above its own head and both receiver floors;
the PDS must atomically verify/consume that challenge and install the checkpoint.
Publisher leases and superseded pending envelopes must remain fenced until the
exact checkpoint receipt is authenticated. This is a design requirement, not an
implemented reset path; large snapshots and checkpoint delivery remain open.

Production action/collection/role mappings and freshness intervals are not
invented here. The resolver has no permissive default rules. Institutional
rosters must remain private and distinct from public community governance.

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
| CAR stream helper                                                         | **Ported, tested**          | Required to support the already-vendored `@atproto/space` package without replacing common infrastructure.                                         |
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

Next, in order:

1. Freeze the draft M8 profile against the actual broker and add cross-service
   signing/JWKS interoperability tests. Policy epoch remains PDS-owned.
2. Wire authenticated challenge issuance, endpoint rate limits and periodic
   cleanup only as part of the disabled credential-exchange integration below.
3. Build the governance-authorized publisher input and authenticated checkpoint
   recovery, including high-water marks, expired/ambiguous delivery and large-snapshot
   transport. The signer and durable outbox are tested; live delivery remains unwired.
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

At the final local check, the main checkout also had uncommitted institutional
SQLite/Postgres store and route/middleware changes. These belong to the other
workstream; their implementation and verification were not repeated here.

The institutional bridge module on main is an authorization-policy foundation.
Its next slice is membership persistence and route-level enforcement. Keep that
work separate from public community governance and do not import its owner role
as a universal private-file grant. Referenced AT URIs still require authorization
at their PDS. Any institution-specific file rules need a private, trusted policy
source and the same complete credential/write gates as other protected resources.

## Non-negotiable tests

Before enabling any route, cover valid owner access plus invalid iM8 assurance,
wrong user binding, wrong client attestation, DPoP replay, cross-space access,
stale-policy revocation, and role-denied write operations. Run the upstream
space suite after adaptation as well as the existing PDS and Bsky regression
suites.
