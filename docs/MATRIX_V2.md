# Matrix v2

**Scope: Matrix services shared by the TypeScript and Rust PDS deployments.**
Reviewed 2026-10-14. This guide preserves CD-M1–CD-M6 and the findings behind
them. Identity proofs, pull joins, authorization and IdP/MAS code exist; the
physical service split, client/device acceptance and production recovery remain
open. Implementation is not proof of an active deployment or complete privacy.

Use [Matrix operations](MATRIX_BACKUP.md) for topology-specific backup coverage
and dated local evidence, [the roadmap](QUARTER_PLAN_2026Q4.md) for release gates,
[the client contract](../services/matrix-bridge/docs/CLIENT_INTEGRATION.md) for
current wire behavior, and [VLPDS](VLPDS.md) for the Rust platform. Historical
observations below retain their dates; inspect the current deployment before
using them as operational facts.
---

## 1. Historical v1 baseline

The reviewed v1 bridge derived MXIDs reversibly from account DIDs, stored a
DID/MXID/password mapping and pushed members into rooms. Some unauthenticated
routes exposed this pairing and moderation text. Synapse ran an unintended
SQLite/default configuration despite a PostgreSQL/hardening design. These
findings motivate the controls below; this is not the current v2 contract.

Current code removes `user_matrix_map`, derives the MXID from a client-held
identity key, requires proof-bearing joins and authorizes community resources.
Revocable device-session rows still retain DID/MXID pairs; removal of the
mapping table alone does not make the whole bridge unlinkable. The physical
CD-M2 split and real-client/recovery evidence remain separate obligations.

## 2. Findings and their disposition

Stable F-numbers remain usable from source comments and operational guides.
The implementation records are local evidence, not a certification of every
running instance.

| Finding                                      | Cause and correction                                                                                                                                                                       | Remaining operational boundary                                                                                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **F1 — ignored hardening config**            | Synapse loaded `/data/homeserver.yaml` while hardened files were mounted under `/config`. Compose now uses `/config`, with a writable-volume initializer and tracked overlay.              | Check the loaded settings and live unauthenticated `publicRooms` refusal. Runtime verification was recorded 2026-08-20.                                                  |
| **F2 — unintended SQLite**                   | Generation ignored the assumed `SYNAPSE_DB_*`/`POSTGRES_*` path. Setup writes the explicit `zz-para-database.yaml` overlay.                                                                | Verify the real database engine; a PostgreSQL container existing does not prove Synapse uses it.                                                                         |
| **F3 — generated secrets tracked**           | Synapse generated config/signing keys were not ignored. They are now gitignored.                                                                                                           | Review any historical exposure; signing-key recovery requires the correct existing key, not regeneration.                                                                |
| **F4 — retained message excerpts**           | Moderation stored 200-character previews outside Synapse retention. New previews were removed, old previews purged at startup, and response columns made explicit.                         | Deliberation cards still store user-submitted text. Moderator review of encrypted messages requires an entitled client with keys; metadata alone cannot recover content. |
| **F5 — LLM export without author consent**   | Summary/extraction/context paths could export other authors' text. CD-M3 enforces per-author, versioned consent at the shared filter.                                                      | Provider-use policy/disclosure remain OD-3. Keep `OPENAI_API_KEY` unset until approved.                                                                                  |
| **F6 — three unauthenticated reads**         | Proposals, constitution and votes lacked M8 authentication. Checks added.                                                                                                                  | Authentication alone is not community entitlement; see F9.                                                                                                               |
| **F7 — push joins violate CD-M1**            | Membership records contain DIDs, not identity keys; the server cannot derive the new MXID from them. CD-M6 replaces push invites with proven pull joins and deletes the old table.         | Device-session correlation, attestation, revocation and lease behavior still need deployed-client acceptance.                                                            |
| **F8 — broader unauthenticated GET surface** | The remaining governance/moderation reads lacked M8 checks. The `/api` inventory was guarded.                                                                                              | Audit any new route; do not infer authorization from a bearer check.                                                                                                     |
| **F9 — resource authorization**              | Moderator DID and community query parameters could select someone else's authority/data. Central `authorize`/self-read checks now guard community endpoints; replay rechecks entitlements. | Public sortition-proof verification is a deliberate authenticated audit exception. Confirm role removal and current report privacy in the actual deployment.             |
| **F10 — Redis appended into a comment**      | Missing trailing newline swallowed `redis:`; the single-node stack has no Redis worker dependency. Removed the append; generated settings use overlays.                                    | Do not edit a running config by appending worker settings without a worker deployment.                                                                                   |
| **F11 — wrong PostgreSQL collation**         | Existing volumes were initialized with a non-`C` locale. Compose now sets UTF-8/`C` initdb arguments.                                                                                      | Those arguments affect only new volumes. Existing data needs a reviewed dump/recreate/restore, not a config-only restart.                                                |

F4 is pinned by the bridge's `report-retention.test.ts`, F5 by
`ai-consent.test.ts`, and the identity boundaries by
`identity-boundary.test.ts`. Consult the current
[bridge guide](../services/matrix-bridge/README.md) and
[acceptance checklist](../services/matrix-bridge/TEST_CHECKLIST.md).
The dated 2026-09-26 [local run](MATRIX_BACKUP.md#local-acceptance-evidence--2026-09-26)
established service health and fixtures, not authorized-device recovery.

## 3. Hard guarantees vs best-effort

The distinction matters more here than in most components, because Matrix
metadata is exactly what a coercive adversary wants and users will read any
vague claim generously.

### Hard guarantees (enforced, testable)

- **The ballot identity has no Matrix account.** `getMatrixIdentity` refuses it
  by allowlist, and the boundary suite in
  `iM8/src/services/__tests__/matrixIdentity.test.ts` pins the refusal, the
  absence of private key material on the returned object, and the fact that the
  refusal cannot be bypassed through the second entry point.
- **The MXID is a pure function of the identity public key.** No server table
  is required to relate an account to a DID or to another identity (§4).
- **No DID↔MXID mapping table exists.** _(since CD-M1/CD-M6, 2026-09-21)_
  `user_matrix_map` is dropped at startup on both backends, no store method
  resolves an MXID from a DID, and the boundary suite
  (`services/matrix-bridge/src/__tests__/identity-boundary.test.ts`) pins all
  three. Residual: `device_sessions` holds (did, mxid) per minted session as
  operational state — see CD-M6 consequences.
- **Push payloads carry no message content.** `push.include_content: false` is
  server-enforced; a misconfigured client cannot opt back in.
- **Media requires authentication.** `enable_authenticated_media: true`.
- **The homeserver contacts no third-party key server.** `trusted_key_servers: []`.

### Best-effort (real, but do not describe them as guarantees)

- **Retention.** Synapse's retention support is experimental upstream. It stops
  _this server_ serving old events; it does not reliably purge media and cannot
  reach copies already synced to a device. Never tell users "messages are
  deleted after 90 days".
- **Federation closure.** A configuration setting, not a network control. It is
  only as good as the config actually loaded — which is precisely what F1 shows
  can silently fail. Verify it at runtime, not by reading the file.
- **Rate limits.** Blunt scripted enumeration; not a defence against a
  distributed attacker.
- **Read receipts and typing notifications.** There is no server-side switch for
  these in Synapse. The plan's "receipts off by default" is a _client_ setting
  and a server operator can still observe them.

### Encryption depends on the room and client

Native encrypted-chat and recovery code now exists in PARA; the web client
still has a separate compatibility requirement. `MATRIX_ENABLE_ENCRYPTION`
controls room creation and does not encrypt old history or prove a client has
keys. Unencrypted rooms expose plaintext to the operator/appservice. Encrypted
rooms need authorized-device decryption and recovery evidence. Do not describe
all chat as encrypted or all chat as unencrypted from a global plan status.
See [the client rollout](../../PARA/docs/MATRIX-COMMUNITY-CHAT-IMPLEMENTATION.md).

## 4. MXID derivation

```
localpart_i = base32_lower_nopad( SHA-256("para-id/matrix-localpart/v1" ‖ identity_pub_i)[0..20] )
mxid_i      = "@" ‖ localpart_i ‖ ":" ‖ server_name
```

`identity_pub_i` is the 32-byte ristretto255 identity public key from
`mubEZ/docs/IDENTITY_DERIVATION.md`. Reference implementation:
`iM8/src/services/matrixIdentity.ts`.

Example, for the all-zero seed vector on `matrix.para.social`:

| identity        | MXID                                                   |
| --------------- | ------------------------------------------------------ |
| `public` (0)    | `@k4o2lmcmitomgymtdb7y3htsthoofobo:matrix.para.social` |
| `anonymous` (2) | `@tksdt6ou5rbvxzeegiriy25u24pft5gz:matrix.para.social` |
| `civic` (1)     | _refused — has no Matrix account_                      |

### Which identities may have an account

The plan says Matrix accounts exist for the _public_ and _community_
identities and never for the _voting_ identity. This codebase does not use
those names, and the mismatch is a trap:

| Plan      | This codebase                                                    | Matrix account |
| --------- | ---------------------------------------------------------------- | -------------- |
| public    | `public`, index 0                                                | yes            |
| community | `anonymous`, index 2 — the pseudonymous posting surface          | yes            |
| voting    | `civic`, index 1 — _"Civic participation (ballots, delegation)"_ | **never**      |

`civic` sounds like the community identity and is the ballot identity. Mapping
it the other way would put the ballot key on a chat server. **This mapping is
inferred from the spec's own description of index 1 and should be confirmed
explicitly before Phase 2** — it is the one Phase 1 decision taken without a
human in the loop, taken in the fail-safe direction (worst case a user cannot
chat under an identity they wanted; the ballot key stays off Matrix either way).

### CD-M1 — MXID localpart is a truncated domain-separated SHA-256, base32

**Decision.** As above: SHA-256 over a domain-separated encoding of the identity
public key, truncated to 160 bits, base32-encoded lowercase without padding,
giving a fixed 32-character localpart.

**Problem.** v1's MXID was a reversible encoding of the DID, so the homeserver's
user list _was_ the linkage table — no exfiltration of the bridge database
needed, just a look at any room's member list. The MXID must instead be a
function of client-held key material only.

**Rejected alternatives.**

- _Server-assigned random localparts._ Requires the server to store the mapping,
  which is the thing being removed.
- _The public key encoded directly (base32 of the 32 bytes)._ Works, but a
  53-character localpart, and it publishes the raw key in every member list and
  every event sender field. The hash keeps the key out of ambient logs while
  still being verifiable by anyone who is shown the key.
- _No truncation (full 256-bit digest)._ 52 characters for no gain. The digest
  is not a secret — the full public key is presented at authentication — so it
  needs collision resistance, not preimage margin. 160 bits gives an ~2⁸⁰
  birthday bound against accidental collision.
- _SHA-512 reduced, matching the scalar derivation._ The scalar derivation uses
  SHA-512-mod-l because it must land in the group; a localpart has no such
  constraint and SHA-256 is the plainer choice.
- _Uppercase base32 / base64._ Invalid: the Matrix historical user-ID grammar
  allows only `[a-z0-9._=/+-]` in a localpart. base32 lowercase is a strict
  subset; base64 is not.

**Consequences.** The localpart is not reversible to the public key, so any
service that needs to check "is this MXID that key" must be shown the key and
recompute. Changing the domain string, the hash, or the truncation length
renames every account on the server — treat this as a versioned wire format,
which is why the domain label carries `/v1`.

## 5. Hardening baseline

`deploy/matrix/hardening.yaml`, mounted as `/config/zz-para-hardening.yaml` so
it merges after the generated `homeserver.yaml`. Every setting carries its
rationale in the file itself; that file is the reference, not a copy here.

Room-default encryption remains a commented capability in the overlay;
`MATRIX_ENABLE_ENCRYPTION` and client compatibility must be reviewed before
changing existing room policy. Local password login is disabled with
`password_config.enabled: false` under MAS delegation. Verify the running
configuration and delegated login rather than reopening passwords to bypass
a broken client callback. Historical hashes/tokens require the separately
reviewed cleanup below.

### Upgrading an existing v1 deployment

The F1/F2 fixes change where Synapse reads its configuration, so a stack that
is already running will **not** restart cleanly without one step. Both the old
and new layouts keep state in the `synapse_data` volume; only config moves.

1. Stop the stack. Do not delete `synapse_data` — it holds the media store and,
   on a v1 deployment, the live database.
2. Move the existing config and signing key out of the named volume and into
   `deploy/matrix/synapse/` so they are visible at `/config`:

   ```bash
   docker compose -f docker-compose.matrix.yaml cp synapse:/data/homeserver.yaml ./deploy/matrix/synapse/
   docker compose -f docker-compose.matrix.yaml cp synapse:/data/. ./deploy/matrix/synapse/ # signing key
   ```

   Then edit `signing_key_path` in that `homeserver.yaml` to point at
   `/config/<server_name>.signing.key`. Keep every other path on `/data`.

3. Start the stack and confirm the overlay is in effect (below).

The signing key must survive: regenerating it changes the server's identity.
If you have no users yet, deleting the volume and re-running `setup.sh` is the
simpler path.

### Verifying

Verify the config actually loaded rather than trusting the file — that is the
lesson of F1. Check a setting that only the overlay sets:

```bash
docker exec para-matrix-synapse grep -rn "federation_domain_whitelist" /config/
```

Then confirm the server is answering with it live, rather than that the file
merely exists on disk:

```bash
curl -s http://127.0.0.1:8008/_matrix/client/v3/publicRooms
```

A hardened server rejects that unauthenticated; a server still running the
auto-generated config returns a room list.

### PW-CLEANUP — historical password material (reviewed 2026-09-20)

This subsection records the 2026-09-20 local inspection, not current database
counts or authorization to delete live credentials. New-write controls and
historical credential removal are separate obligations.

**New writes: stopped.** Verified in three places.

| Layer   | State                            | Evidence                                                                                                            |
| ------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Bridge  | Mapping table removed at startup | CD-M6 drops `user_matrix_map` on SQLite and PostgreSQL; the old password column is not a supported credential store |
| MAS     | Disabled, and empty              | `passwords.enabled: false` in `deploy/matrix/mas/config.yaml`; zero rows in `user_passwords`                        |
| Synapse | Disabled as of 2026-09-20        | `password_config.enabled: false` now set in `deploy/matrix/hardening.yaml` — see below                              |

**Historical observation: present and dormant on 2026-09-20.** Five of seven accounts in
Synapse's `users` table still carry a `password_hash` from before delegation:
`@paratest`, `@alice`, `@bob`, `@admin`, `@bridge-admin`. The same five hold 16
rows in Synapse's own `access_tokens` table.

Those tokens were tested, not assumed. Presenting one to
`/_matrix/client/v3/account/whoami` returns:

```
401 {"errcode":"M_UNKNOWN_TOKEN","error":"Token is not active"}
```

MAS introspection rejects Synapse's legacy tokens, so they are inert while
delegation is on. The password hashes are equally unusable while `/login` is
delegated — Synapse 404s it.

**The residual risk is conditional, and that is the point.** Dormant is not
removed. Every one of these becomes live again the moment delegation is turned
off or misconfigured, which is exactly the "parallel way in" this document's
hardening section warns about. A rollback performed under pressure — the most
likely time to disable delegation — is also the least likely time to remember
that five accounts, two of them Synapse admins, still have passwords.

**Phase 1 exit taken.** `password_config.enabled: false` was gated on the
bridge no longer issuing passwords. That gate is satisfied (table above), so
the setting has been uncommented. Synapse restarts healthy with it and
`mas-cli doctor` still passes its three delegation checks.

**Not done, and deliberately left for a decision:** removing the historical
rows. The cleanup is two statements against a live database:

```sql
-- Synapse: drop dormant password credentials
UPDATE users SET password_hash = NULL
 WHERE password_hash IS NOT NULL AND password_hash <> '';

-- Synapse: drop legacy pre-delegation access tokens
DELETE FROM access_tokens;
```

This is destructive and irreversible without a restore, so it should run after
a `synapse-db` dump and with a decision on `@admin` and `@bridge-admin` —
neither exists in MAS (MAS knows only `bridge-bot` and the one derived-MXID
user), so nulling their passwords leaves them with no way in at all if
delegation is ever removed. That may be exactly what you want. It should be a
choice, not a side effect.

## 6. Open decisions

**OD-1 — homeserver.** Synapse remains the configured default. Evaluating a
replacement is deferred; commented alternatives in Compose are not supported
deployment profiles.

**OD-2 — proof of possession for `para-idp`.** _(CLOSED 2026-08-20 — see
CD-M4 below)_
Gate G0 passed: `@scure/sr25519` accepts a PARA identity scalar and reproduces
`identity_pub_i` exactly. This avoids implementing the proposed Schnorr transposition. Library choice
does not replace review of key derivation, assertions, replay and device behavior. Implemented in `iM8/src/services/identitySignature.ts`.

**OD-3 — third-party LLM processing (F5).** Whether community deliberation text
may be sent to OpenAI at all; if yes, under what consent surface, with what
retention commitment from the processor, and whether a self-hosted model is
required instead. Until this is closed, deploy without `OPENAI_API_KEY`.

_Partially addressed._ The consent surface is built and enforced — CD-M3, §7,
per-author and fail-closed. **Decision authority: the founding community, by
ballot — this is not a unilateral maintainer decision.** What remains is to
draft the ballot proposal: (a) the disclosure wording members are agreeing to,
which `AI_CONSENT_POLICY_VERSION = 1` currently stands in for without any text
behind it; (b) the retention and training commitment to require from the
processor; (c) whether a self-hosted model is required regardless of consent.
Until the vote closes the deploy guidance above is unchanged — consent
machinery existing is not a reason to set `OPENAI_API_KEY`. The proposal and safe vote path belong in the
[release roadmap](QUARTER_PLAN_2026Q4.md), without an expired sprint date.

**OD-4 — identity label mapping.** Confirm `civic` = ballot identity and
`anonymous` = community identity as reasoned in §4. **Decision authority: the
founding community, by ballot.** The fail-safe default mapping stands until
the vote closes; if the community overturns it, the mapping change is code
follow-up, not a re-architecture.

**OD-5 — where governance logic goes.** _(closed by CD-M2, §7.)_ Target is a
two-service split: `para-governance` owns the firehose and all governance state
and speaks DIDs; the provisioner owns room/account operations on proven MXIDs
rather than deriving a directory from DIDs. CD-M6 adds the verified interaction
and revocable device-session state to this target. Investigating this surfaced F7 — the current push-based membership
projection is unimplementable after CD-M1 — which is why the residual question
below is filed separately rather than treated as an implementation detail.

**OD-6 — the join seam (from F7 / CD-M2).** _(CLOSED 2026-09-21 — CD-M6 below)_
A member proves possession of the identity key and active community membership
to the bridge. CD-M6 uses the verified assertion and Synapse admin force-join;
it does not add a Synapse module, MAS-governance coupling or a separate token
service. OD-2 is closed. Real client/device acceptance remains a release gate.

## 7. Service decomposition

### CD-M2 — split by plane; governance owns the firehose, the provisioner owns rooms

**Decision.** The bridge becomes two services over two schemas:

- **`para-governance`** — owns the ATProto firehose cursor and all governance
  state and logic: constitution, proposals, sortition (incl. drand), moderation
  and badges, deliberation cards, extraction and relationships. Speaks **DIDs
  only** and never resolves, stores, or derives an MXID.
- **`para-matrix-provisioner`** — thin. Creates a space and its rooms for a
  community, maintains join rules and power levels, relays bot announcements,
  proxies the push gateway. Operates on **rooms**, not on users.

The two communicate one-way, governance → provisioner, over a small port. No
call goes the other direction.

**Problem.** The plan calls for a thin provisioner, and §6 recorded that it
"cannot be thin while proposals, sortition and moderation live in the bridge."
Reading the source, that framing overstates the entanglement in one direction
and understates it in another.

_Overstated:_ the governance core is already Matrix-free. `constitution.ts` has
no imports at all; `drand.ts` imports only `node:crypto`; `sortition.ts` only
`drand`; `chat-moderation.ts`, `extraction.ts`, `summarize.ts` and
`llm-extraction.ts` reach only the database (and OpenAI, per OD-3). That is
1,842 lines that move with no rewrite. Only two modules touch Matrix at all:

- `proposals.ts` — a single fire-and-forget `announceInMatrix`, already
  try/caught at both call sites and already a documented no-op when a community
  has no space. This is an outbound notification, not coupling.
- `firehose.ts` — the real tangle: it consumes ATProto records and in the same
  pass both decides governance outcomes _and_ projects them onto Matrix
  (`createSpace`, `createRoom`, `inviteUser`, `kickUser`, `setPowerLevel`).

So the seam is not between "governance" and "the bridge". It is inside
`firehose.ts`, which is doing two jobs.

_Understated:_ F7. The projection half of that job stops being implementable
once CD-M1 lands, because the server can no longer name a member.

The table split falls out along the same line — 6 Matrix-plane tables
(`community_space_map`, `matrix_events`, `room_read_markers`,
`user_push_tokens`, `user_chat_preferences`, and `user_matrix_map`) against ~22
governance tables. The only table that genuinely straddles the planes is
`user_matrix_map`, which v2 deletes anyway. `chamber_assignment` is a governance
output that provisioning consumes, and is therefore exactly where the port
belongs.

**Rejected alternatives.**

- _Keep one service, split internally by module._ Cheapest, and the module
  boundaries are already good enough to make it look tidy. Rejected because it
  leaves governance state and Matrix credentials in one process and one
  database, so "the homeserver operator cannot link a DID to an MXID" stays a
  code-review claim rather than a deployment property. The point of the split is
  that the provisioner should not be _able_ to learn what it must not store.
- _Provisioner owns the firehose and calls governance._ Inverts the dependency:
  the component that must know least would parse every governance record to
  decide what to forward. It also puts the cursor in the wrong service — replay
  is a governance concern.
- _Governance calls the Matrix admin API directly, no provisioner._ This is v1
  with extra steps, and it hands Synapse admin credentials to the service that
  holds voting records.
- _Three services (governance / provisioner / deliberation-and-LLM)._ Splitting
  deliberation out is attractive while OD-3 is open, since it isolates the one
  component that talks to a third-party processor. Deferred, not rejected: it is
  a sub-split of `para-governance` and can be done later without disturbing this
  boundary. Doing it now would mean designing two ports before either is
  exercised.

**Consequences.**

The initial interface inventory identified `createSpace`, `createRoom`, `addChildSpace`, `inviteUser`,
`kickUser`, `setPowerLevel`, `getRoomMembers`, `sendEvent`, plus
`userExists`/`createUser`. CD-M6 resolves the user-operation boundary: account operations may use the
MXID proven in a verified interaction or an authorized device-session row; they
cannot derive one from an arbitrary DID. This keeps password issuance and the
old global mapping out of the contract without prohibiting force-join, role
projection or revocation.

Membership therefore inverts from push to **pull**. The server stops inviting
members; a member joins, presenting proof that they hold the identity key behind
their MXID and that they are an active member of the community. The client can
do this — it holds `identity_priv_i` and derives its own MXID — and the server
can verify it without storing a mapping.

OD-2 and OD-6 are closed by CD-M4/CD-M6. The interface extraction exists in
`matrix-projection.ts`; the physical service/schema separation remains a
target. The running bridge still has operational device-session pairings and
credentials in one process, so the target isolation is not a deployed guarantee.

### CD-M3 — LLM processing consent belongs to the author of each piece of text

**Decision.** Text may be sent to a third-party LLM provider only for members who
have granted consent at the current disclosure version. Consent is a property of
the **author of the text**, checked per-card at the moment a payload is
assembled — not a property of the user who triggered the request, and not a
deployment flag. Absence of a record is not consent.

Enforced in one place, `services/matrix-bridge/src/ai-consent.ts`
(`filterConsentedCards` / `hasAiConsent`), which every provider-bound path is
required to call. Stored in `ai_processing_consent`, read and written through
`/api/ai-consent`. Pinned by
`services/matrix-bridge/src/__tests__/ai-consent.test.ts` (11 tests).

**Problem.** The obvious implementation — a per-user setting checked when the
user calls `/api/summarize` — is wrong, and wrong in a way that looks correct.
A summary spans up to 100 cards written by many different members, and
relationship inference sends up to 20 _other_ members' cards as context. Gating
on the caller would mean one member's opt-in exports everyone else's words. The
consenting user is rarely the person whose privacy is at stake.

**Rejected alternatives.**

- _Deploy-time flag only (the status quo, `OPENAI_API_KEY`)._ All-or-nothing for
  a whole instance, and the people whose text is sent never see the question.
- _Consent checked against the requesting user._ The trap above. Rejected on the
  grounds that it silently exports non-consenting members' text.
- _A boolean column on `user_chat_preferences`._ Cheapest, but consent needs an
  audit trail — when granted, under which disclosure, when revoked — and a
  cosmetic chat preference is the wrong neighbourhood for it. Decisive practical
  point: this codebase has no `ALTER TABLE` anywhere, so a new column on an
  existing table would silently not apply to deployed instances, while a new
  table is created by the existing `CREATE TABLE IF NOT EXISTS` path.
- _Consent as a single timeless boolean._ Consent to one disclosure is not
  consent to a later one. `policy_version` is stored alongside the grant, and
  `AI_CONSENT_POLICY_VERSION` is compared with `>=` at check time, so bumping it
  invalidates prior grants and re-prompts rather than silently broadening what
  people agreed to.
- _Redaction/anonymisation instead of consent._ Deliberation cards are written in
  the author's own words; stripping the DID does not stop the text identifying
  them. Would trade a real control for the appearance of one.

**Consequences.**

Summaries become partial by default — nobody has consented yet, so
`/api/summarize` returns "not enough claims" on a fresh deployment until members
opt in. That is the intended fail-closed direction, but it means the feature
looks broken until the client ships the consent prompt. `DeliberationSummary`
carries `cardsWithheldForConsent` so the UI can say the summary covers part of
the discussion rather than presenting it as the whole.

`GET /api/ai-consent` deliberately takes no `did` parameter and reports only the
authenticated user's own state: whether a given member consented to AI
processing is itself personal, and a lookup by DID would make it enumerable —
the same mistake as F6.

This is mechanism, not policy. It gives each member a real choice and makes the
choice enforceable, but it does not answer whether we should be sending
deliberation text to OpenAI at all, what the disclosure says, or what retention
terms to require. Those stay open under OD-3, and until they are settled the §6
guidance holds: deploy without `OPENAI_API_KEY`. A consent checkbox is not a
substitute for that decision — shipping the checkbox and treating the question
as closed would be the failure mode to avoid.

### CD-M4 — Proof of possession is sr25519, with the scalar injected

**Decision.** PARA identity keys prove possession with `@scure/sr25519` —
sr25519 _is_ Schnorr over ristretto255 — by constructing the 64-byte secret as
`(encodeSecretScalar(identity_priv_i) ‖ nonceSeed)` and letting the library
sign. `identity_pub_i` is then the sr25519 public key, verified against all
three shared seed vectors for both signing identities.

**Problem.** CD-M1 makes the MXID a function of a _public_ value, so presenting
the key proves nothing. A signature scheme over PARA identity keys did not
exist: governance votes sign with the atproto DID key (which is the linkage v2
removes) and mubEZ's registration contract promised a scheme it never shipped.

**Rejected alternatives.**

- _Transposing Monero's `generate_signature` to ristretto255._ Considered in the
  decision process. Rejected because it needs cryptographic
  review this project has nobody to perform — the "part-time security reviewer"
  in the v2 plan does not exist. It is not an implemented fallback.
- _A separate Ed25519 signing key per identity._ Nothing would bind it to
  `identity_pub_i`; every fix leads back to signing with the identity key or to
  a server-side mapping table.
- _Signal's poksho/zkgroup._ Right family — ristretto255 Schnorr with labelled
  domain separation — but Rust-only, no React Native binding, and it solves
  zero-knowledge proofs of arbitrary statements where we need one discrete log.
  Read for discipline, not imported.

**Consequences.**

- **The scalar must be cofactor-shifted.** sr25519 stores the key half as
  `scalar << 3` (schnorrkel's Ed25519-compatible format) and divides by 8 on
  read. Injecting a raw scalar silently yields the _wrong_ public key — no
  error, just a different account. This is the load-bearing detail of the
  module and is pinned by tests. Lossless for every scalar below the group
  order, verified over 20,000 random values.
- **The library's `verify()` throws** on a malformed point rather than returning
  false, and a null body throws before any field is read. Both are wrapped: on
  a public endpoint they would have turned garbage input into a 500 instead of
  an auth failure. Pinned by a 160-case hostile-input test.
- **Nonces are synthetic**, satisfying the concern that drove us away from
  Monero's `random_scalar`: the stored nonce seed is derived from the identity
  key, and `sign()` mixes fresh randomness on top. A dead RNG cannot repeat a
  nonce on its own.
- **Purpose is inside the signed bytes.** `matrix-login` and
  `mubez-registration` share one key; a signature for one cannot verify as the
  other.
- `@scure/sr25519` becomes a production dependency of iM8. It is from the same
  author as `@noble/curves` and `@scure/bip39`, already relied on, and was
  audited by Oak Security in Aug 2025.

**OD-2 disposition.** Closed in favor of this implementation. A future
dependency replacement requires its own protocol review and compatibility
vectors; it does not automatically enable a Schnorr transposition. The ballot
identity signing prohibition is retained in [OD-7 §5a](OD-7-BALLOT-IDENTITY-REGISTRATION.md#5a-answer-and-what-reading-a-costs).
JavaScript secret-lifetime/zeroization limits and real device performance remain
part of the threat model; a library audit is not an audit of PARA authentication.

### CD-M5 — atproto Spaces is the permissioned-space layer, not a Matrix replacement

**Decision.** Adopt atproto Spaces, when it stabilises, as the implementation of
the permissioned-artifact boundary summarized below — durable deliberation artifacts. It does **not** replace Matrix, and it
must never carry the community identity's content. Not this quarter.

**What it actually is** (evaluated against
`https://atproto.com/blog/atproto-spaces-alpha`, 2026-08-20): a space is "a
miniature atproto network that can be gated so that only certain people and
applications are able to access the data published in it". Data lives in
per-space permissioned repos on the author's PDS. There are facilities for
real-time sync. Access is controlled by a space authority, "which is just a DID
like any other account". Alpha — protocol design, SDKs and schema are not final.

**Why it cannot take Matrix's place.** Two disqualifying properties, both by
design rather than by immaturity:

1. **It gives access control, not confidentiality.** In its own words, data in a
   space "is readable by any user or application with access to that space, it's
   not encrypted". The Matrix target requires client-side conversation encryption. A
   layer with no confidentiality cannot hold private conversation, and the fact
   that it is _permissioned_ is easy to mistake for _private_.
2. **Identity is the atproto DID.** Everything in a space is authored by a DID,
   in that DID's repo. CD-M1 exists to stop a DID being relatable to a chat
   account; routing community conversation through Spaces would reinstate the
   linkage at the storage layer, where it is far harder to remove than a bridge
   table. There is no pseudonymous or unlinkable participant in the Spaces
   model.

**Consequences.**

- Spaces is the candidate storage for proposal drafts, amendments, evidence,
  and delegate ↔ delegator durable notes
  — content whose authorship is _meant_ to be attributable to a public identity.
- **Hard boundary: the `anonymous` (community) identity must never author into a
  Space**, because doing so binds its content to a DID. Only the public identity
  may. This is a merge-blocking boundary alongside the ballot rule.
- Spaces does not change CD-M1/CD-M4. Hosting, OAuth-client readiness and
  personal-source migration require their own reviewed rollout; an alpha
  capability is not an enabled production storage contract.

**Rejected alternative.** _Replacing the Matrix homeserver with Spaces._
Tempting — it would delete a whole service and its operational burden. It fails
on both properties above: PARA would lose encryption it has planned for, and
regain the linkage it has spent this quarter removing.

### CD-M6 — the join seam is a bridge-verified proof plus admin force-join; membership is pull

**Decision.** A member joins a community's rooms by presenting two credentials
to the bridge in one request, and the bridge — not the homeserver — checks
both:

1. an **M8 session** (the same bearer the app already holds), proving the DID
   is an active member of the community in governance state;
2. a **CD-M4 assertion** (`para.identity.pop.v1`, purpose `matrix-login`,
   audience `para-matrix-bridge/join.v1`) over a bridge-issued one-time
   challenge, proving the caller holds `identity_priv_i`.

The bridge derives the MXID from the presented public key (CD-M1, implemented
once, in `services/matrix-bridge/src/identity-proof.ts`), ensures the Synapse
account exists via appservice registration, and force-joins it with
`POST /_synapse/admin/v1/join/{roomId}` — the one admin membership endpoint
verified to exist on a live Synapse. Rooms stay `invite`-only for everyone
else. Revocation and role changes are projected through the same boundary
(Consequences). Four audiences distinguish the proofs a client may
present (`identity`, `session`, `join`, `attest`); a signature for one never verifies as
another.

**Problem.** F7: after CD-M1 the server cannot name the member it wants to
invite, so v1's push model is unimplementable. OD-6 left three candidate
mechanisms open.

**Rejected alternatives.**

- _A Synapse module validating join proofs at the homeserver._ Strongest
  end-state, but it is new homeserver-side code in a component we harden rather
  than extend, and it does not exist today. The admin force-join endpoint
  already does the one thing needed: join a local user regardless of join
  rules, as the admin. Revisit if the bridge is ever removed from the trust
  boundary.
- _MAS-mediated join (the authorization-code flow carrying membership)._ MAS
  knows users by MXID only; it cannot check PARA governance state (which is
  DID-keyed) without becoming a governance consumer. That couples the identity
  provider to the governance plane — exactly the layering CD-M2 exists to
  prevent.
- _A separate capability-token service._ A third credential to issue, store,
  revoke and audit, for a decision that can be made from two credentials the
  caller already holds. The one-time challenge already gives the assertion
  replay protection; a capability token would add infrastructure, not
  properties.
- _Keeping the v1 table "just for invites"._ The linkage table serving its
  original purpose is the vulnerability, not a mitigation for it.

**Consequences.**

- The join decision (DID active in community ∧ key possessed) is made and
  consumed inside one request. The proof does not recreate a global DID↔MXID directory. Operational
  device-session rows do persist a pairing as described below; other
  interactions prove it afresh. The boundary suite pins the directory removal:
  `user_matrix_map` is dropped at startup on both backends, no store method
  resolves an MXID from a DID, and the member-list endpoint carries no chat
  identifier (`src/__tests__/identity-boundary.test.ts`).
- **`device_sessions` is the residual linkage surface, deliberately.** Each
  row holds (did, mxid) for a session the bridge minted after a verified
  proof. It is operational state — rows exist only where a verified
  interaction completed, they are revocable, and no API returns the pairing —
  not a directory. It is what makes revocation and role projection possible
  without the v1 table, and it moves to the provisioner side at the CD-M2
  physical split. An operator can correlate these rows today; absence of a
  global directory or public lookup is not operator unlinkability.
- **Revocation inverts too.** The bridge cannot kick a DID it cannot name, so
  removal deactivates every device session minted for that DID (killing those
  access tokens) and bans those MXIDs from the community's rooms. Re-entry is
  impossible anyway: the next verified join fails the active-membership check.
- **Role changes (the handover protocol) project at two moments.** A
  membership _update_ while active — moderation rotation, sortition replacing
  a delegate, owner handover — triggers `applyMemberRoles`: current roles are
  written as room power levels for every minted-session MXID, immediately and
  idempotently, retried by the retry worker. A member not yet joined picks the
  roles up at their next verified join.
- **Interaction-time reconciliation closes the offline gap** (2026-09-21).
  Every verified interaction — identity probe, session mint, attestation,
  join — ends with `reconcileMemberAccess(did, presentedMxid)`: for each
  community the DID has state for, active memberships get current roles
  projected onto the presented account (catching downgrades that arrived
  while offline) and non-active memberships get the presented account banned
  and minted sessions revoked (catching removals that arrived while offline —
  including MAS-native accounts with no minted session, which the
  event-time path cannot reach). Removal and role drift are therefore
  self-healing at the member's next app open. Reconciliation adds no global
  identity mapping: the proof supplies the account and governance supplies the
  verdict. Existing device-session pairings remain an operator correlation
  surface until their revocation/retention and physical separation are addressed.
- **The membership lease closes the never-interacts-again residual**
  (2026-09-21). Every verified interaction also records, per community, when
  each chat account last proved currency — `community_membership_lease`,
  keyed by (community, MXID), **no DID column**: it is a DID-free roster of
  "which accounts are in the rooms we manage and when they last showed up",
  not a mapping in disguise. An hourly sweep
  (`sweepExpiredMembershipLeases`, TTL `BRIDGE_MEMBERSHIP_LEASE_TTL_MS`,
  default 30 days, 0 disables) kicks accounts whose lease expired from the
  community's rooms and drops the rows. A removed member who never interacts
  again is therefore evicted within the TTL regardless — without the bridge
  ever naming them. Eviction is a kick, not a ban, because expiry also
  reaches active members who simply did not open the app: their next
  verified join re-admits them immediately (idempotent, membership still
  active); bans remain reserved for explicit removal. The client contract
  asks for an automatic re-join at app open when the homeserver reports the
  account left a community room.
- **Session attestation brings MAS-native clients into the same operational
  treatment** (2026-09-21). `POST /api/matrix-attest` (audience
  `para-matrix-bridge/attest.v1`): the client presents the standard proof
  plus its MAS device id, and the bridge records a device-session row for
  the derived MXID without minting anything. With that row,
  chat-message attribution counts the sender, moderation sanctions resolve
  the target, removal deactivates the device, and role changes reach it.
  Voluntary and idempotent per device; a MAS client that never attests
  keeps the pre-attestation behaviour (unattributed messages, no
  bridge-side enforcement handle) — the client contract asks for it on
  login.
- The client contract changed: `POST /api/matrix-challenge` then
  `POST /api/matrix-identity` / `/api/matrix-token` / `/api/community-join`
  with the assertion. `GET /api/matrix-identity` (mapping read) is gone.
  Documented in `services/matrix-bridge/docs/CLIENT_INTEGRATION.md`.
- The appservice observes `@[a-z2-7]{32}` through a **nonexclusive** namespace
  for MAS-native accounts. An exclusive reservation, or creating a Synapse user
  before its first MAS login, makes the localpart unavailable to MAS. The
  trusted IdP forces the derived localpart; passwords and free registration
  remain disabled. Existing appservice-owned accounts require a reviewed
  migration, never automatic adoption. The MXID derivation itself is unchanged.

## 8. Phase status

| Plan item                                                | Status                                                                                                                                                                                                         |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Confirm v1 assumptions; inventory what the bridge stores | Done — §1, §2                                                                                                                                                                                                  |
| Metadata hardening applied and documented                | Done — §5, **verified on a running server 2026-08-20** (F1)                                                                                                                                                    |
| MXID derivation formula locked                           | Done — §4, CD-M1; **bridge-side implementation + v1 table deletion landed 2026-09-21**                                                                                                                         |
| iM8 `getMatrixIdentity` with tests                       | Done — `matrixIdentity.ts`, 18 tests                                                                                                                                                                           |
| Identity-boundary CI suite (Matrix)                      | **Done — both halves.** Client half in iM8; server half in `services/matrix-bridge/src/__tests__/identity-boundary.test.ts` (table dropped at startup, no forward lookup, no chat identifier in member lists). |
| `para-idp` + MAS prototype                               | **Done and verified 2026-08-20** — a PARA seed creates `@k4o2lmcmitomgymtdb7y3htsthoofobo:matrix.para.social`; zero DID columns in either database                                                             |
| Tuwunel spike                                            | Not started                                                                                                                                                                                                    |
| Homeserver decision recorded                             | Open — OD-1 (deferred out of this quarter)                                                                                                                                                                     |
| Proof of possession                                      | Done — CD-M4, `identitySignature.ts`, 16 tests; **bridge-side verification in `identity-proof.ts`**                                                                                                            |
| Join seam (OD-6)                                         | **Done — CD-M6** (verified join, pull-model membership, handover projection, session-based revocation)                                                                                                         |
| Target for governance logic                              | Interface extraction implemented (`MatrixProjectionPort` in `matrix-projection.ts`). OD-2/OD-6 are closed; physical process/schema split and deployed isolation remain open.                                   |
| LLM processing consent surface                           | Done — §7, CD-M3, 11 tests. Policy half of OD-3 still open; client-side prompt not built.                                                                                                                      |

The status table records implementation/directed-test evidence from the cited
work. Full client and production gates are maintained in
[QUARTER_PLAN_2026Q4.md](QUARTER_PLAN_2026Q4.md).

### Native MAS operations — 2026-10-15

Native device revocation finishes matching OAuth and compatibility sessions in
MAS before deleting the Synapse device. Synapse deletion alone leaves the MAS
refresh token usable. Configure the dedicated confidential service client on
MAS's private admin listener; account/client credentials stay server-side.
Native pusher registration belongs to the client's own device session.

Community room creation now persists a retry job before homeserver requests,
reuses only rooms with matching provenance and encryption, and stores the
complete room map in a database-only transaction. Retries never restore old
membership roles. Legacy failed room creation needs reviewed adoption.

The optional private chat operations listener independently verifies the
trusted proxy credential and operator allowlist. It provides bounded status,
provisioning/device views and durable audit for explicit retries and revocation.
It never returns a DID↔MXID directory or message/key material. Deployment,
`/admin/chat`, isolated outage/restore evidence and production gates belong to
[VLPDS chat staging](../../vlpds/para/docs/CHAT-STAGING.md), not a separate
WatZappa runbook. Local SDK acceptance does not establish phone readiness.
