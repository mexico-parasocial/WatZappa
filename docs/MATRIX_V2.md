# Matrix v2

Status: **Phase 1 in progress.** This document is the reference for the Matrix
v2 upgrade described in `para-matrix-v2-plan.md`. It records what v1 actually
is (§1–2), what we do and do not guarantee (§3), the derivation the whole
design rests on (§4), the hardening baseline (§5), and what is still undecided
(§6).

Written to the conventions used in mubEZ: hard guarantees are separated from
best-effort controls, and decisions are numbered records that are appended to,
never rewritten.

---

## 1. What v1 actually is

The plan was written against the README and marked several points *(assumed)*.
Those assumptions have now been checked against the source. Corrections:

| Plan assumed | Actually |
|---|---|
| Bridge puppets users and holds tokens | Confirmed. `user_matrix_map` stores `did`, `matrix_user_id` and a generated **password** per user (`services/matrix-bridge/src/db.ts`). `/api/matrix-token` mints login tokens via the Synapse admin API. |
| A DID→MXID linkage table exists | Confirmed, and it is worse than a derivation table: it is queried in both directions (`getMxidForDid`, `getDidForMxid`) and the MXID is a reversible encoding of the DID — `did:plc:abc` → `@did-plc-abc:server` (`src/matrix.ts` `didToMxid`). No key material is involved. |
| Encryption is inconsistent between rooms | Off entirely. `MATRIX_ENABLE_ENCRYPTION` defaults to `false`; when true it only sets `m.room.encryption` at room creation. The RN WebView client has no working crypto stack. |
| Bridge stores no message content | True of the timeline sync path only (`src/matrix-sync.ts` inserts `content: ''`). Two other paths do store user text — see F4. |
| Federation is closed | **False in a fresh deployment.** See F1. |

Governance logic (proposals, sortition, deliberation, moderation) also lives
inside the bridge. The v2 plan's "thin provisioner" cannot be reached by
renaming the service; that logic needs somewhere to go first.

## 2. Findings

Numbered so they can be closed individually. F1–F3 are the reason Phase 1
starts here rather than with MAS.

**F1 — the hardening in `setup.sh` never reached Synapse.** *(fixed)*
`setup.sh` generated `deploy/matrix/synapse/homeserver.yaml` and edited
`federation_domain_whitelist: []` and the room-directory settings into it.
`docker-compose.matrix.yaml` mounted that directory read-only at `/config` but
set `SYNAPSE_CONFIG_PATH: /data/homeserver.yaml`, a path inside the empty
`synapse_data` named volume. Synapse therefore ran from a config it generated
itself on first boot, with **federation enabled and the room directory
reachable** — the opposite of what the README claimed and of what an operator
following the documented steps would believe they had.

Fixed by pointing `SYNAPSE_CONFIG_PATH` at the `/config` directory (Synapse
merges every `*.yaml` it finds there) and adding the tracked overlay in §5.
Anyone who already ran the v1 setup must treat their homeserver as having been
federation-open and re-check it.

**Verified on a running server, 2026-08-20** — not by reading the file, which is
the whole lesson of this finding. Against a live local stack:

```
GET /_matrix/client/v3/publicRooms  (no auth)  →  401 M_MISSING_TOKEN
federation_domain_whitelist  {}         presence_enabled            False
url_preview_enabled          False      trusted_key_servers         []
enable_authenticated_media   True       push_include_content        False
user_ips_max_age             1 day      retention_enabled           True
enable_registration          False      user_directory search_all   False
limit_profile_requests       True       media local lifetime        90 days
```

Two deployment defects had to be fixed before the overlay would load at all,
both consequences of moving the config path:

- Synapse only chowns `SYNAPSE_DATA_DIR` when it generates its own config. With
  an explicit `SYNAPSE_CONFIG_PATH` it assumes permissions are handled, and
  Synapse (uid 991) cannot create `/data/media_store` in a root-owned volume.
  A `synapse-init` service in the compose file now prepares the volume.
- The overlay file cannot be mounted *inside* a read-only bind mount — Docker
  cannot create the mountpoint. The `/config` directory mount dropped `:ro`;
  the overlay itself stays read-only.

**F2 — Synapse was generating a SQLite config.** *(fixed and verified)*
The compose file passes `SYNAPSE_DB_HOST` / `SYNAPSE_DB_USER` / …, which the
image's config template does not read; it reads `POSTGRES_*`. So the generated
config used SQLite while the `synapse-db` Postgres container ran unused.
Retention purge jobs (§5) are not viable on SQLite at any size.

*Correction:* the first fix — passing `POSTGRES_*` to the generate step — **did
not work**, and the claim that it did was wrong. The `generate` subcommand emits
a stock default config and never consults `POSTGRES_*`; those are read only by
the image's start-up template, on the path where it generates config for itself.
Standing the stack up is what exposed this.

Actually fixed by having `setup.sh` write a generated `zz-para-database.yaml`
overlay into the config directory, which merges over the SQLite block. It holds
credentials, so it lives in the gitignored generated directory rather than the
tracked overlay. Verified: the running server reports `database engine:
psycopg2`.

**F3 — the generated config directory was not gitignored.** *(fixed)*
It holds the homeserver signing key, `macaroon_secret_key`, `form_secret`,
`registration_shared_secret` and the database password. Added to `.gitignore`.
If that directory was ever committed, those secrets are burned and the signing
key must be rotated.

**F4 — user text is stored in the bridge database on two paths.**
*(moderation half fixed; deliberation cards open, deferred to CD-M5)*
The README's "never raw message content" holds for timeline sync but not for:
`chat-moderation.ts` stores a 200-character preview of every reported message
(`reported_message_preview`), and deliberation cards store user-submitted text
(`deliberation_cards.content`). Card text is user-submitted through an
authenticated endpoint, not scraped from rooms — but it is still message-derived
content sitting outside Synapse, outside room retention, and outside E2EE.

The sharper statement of the moderation half: **the bridge database has no
deletion path at all.** There is no `DELETE` against `chat_moderation_events` or
`deliberation_cards` anywhere — no purge job, no TTL. Set that beside
`hardening.yaml`, which sets 90-day message retention,
`redaction_retention_period: 7d` and `forget_rooms_on_leave: true`, and the
report path is a **retention bypass**: a reported message was purged from
Synapse at 90 days while a 200-character excerpt of it survived here forever,
attached to the reported member's DID. Redacting the message propagated through
Synapse in 7 days and never touched the excerpt. The reported member did not
consent to that copy, was not told it existed, and could not see or contest it.

*Fixed for the moderation path* by dropping the excerpt entirely rather than
expiring it, which makes the evidence inherit Synapse's retention and redaction
rules instead of racing them:

- `ingestReport` no longer takes a `context` parameter and
  `insertModerationEvent` no longer has a `reportedMessagePreview` field, in the
  interface or either implementation. An excerpt that cannot be passed in cannot
  be persisted by a later caller who has not read this. The typechecker found
  the one remaining call site.
- Reports keep `reported_event_id` and `matrix_room_id`; moderators resolve the
  content live from Synapse at review time.
- `purgeReportedMessagePreviews()` runs at start-up and clears excerpts captured
  by earlier versions. Stopping new writes while leaving existing rows would
  have fixed the finding only going forward.
- `getRecentReportsForCommunity` selects explicit columns instead of `SELECT *`
  — the `SELECT *` is how the excerpt reached the dashboard response, and it
  would have leaked the next column someone added.
- Pinned by `src/__tests__/report-retention.test.ts`, written against a stub
  database so it runs without the native `better-sqlite3` build.

**Accepted cost.** Reports about a message that has already been purged or
redacted become unreviewable, and once Phase 2 enables E2EE the server cannot
resolve the event at all — moderation review has to move client-side. Both are
consequences of the guarantee, not oversights: evidence that outlives the
message is exactly what this finding is about.

The deliberation-card half is untouched and stays open. CD-M5 names cards as the
first candidate to move once Spaces stabilises.

**F5 — deliberation text is sent to OpenAI.** *(consent surface implemented;
disclosure text and OD-3 policy questions still open)*
`/api/summarize` sends card titles and up to 150 characters of each card's
content to OpenAI (`gpt-4o-mini` by default) for up to 100 cards. The path is
gated on `OPENAI_API_KEY` being set, so it is off unless deployed with a key —
but when on, community deliberation content leaves our infrastructure to a
third-party processor, with no consent surface and no mention in the README,
the threat model, or the v2 plan. For a product that sells itself on privacy
this needs an explicit decision, not a config default. Tracked as OD-3.

The finding understated the surface. There are **three** provider-bound paths,
not one:

| Path | What it sends | Live? |
|---|---|---|
| `summarize.ts` | up to 100 cards, all authors, title + 150 chars | yes — `/api/summarize` |
| `llm-extraction.ts` `enrichCardWithLLM` | one card's own text | no caller |
| `llm-extraction.ts` `inferRelationshipsWithLLM` | the new card + up to **20 other members'** cards as context | no caller |

`llm-extraction.ts` is currently unreferenced outside itself — dead code, but
loaded: the relationship path exports other people's text as context, so wiring
it up later would have leaked without anyone revisiting this finding.

Implemented (CD-M3): per-author consent, enforced at one chokepoint, applied to
all three paths including the dead ones. What remains open under OD-3 is policy,
not mechanism — the disclosure wording, the retention commitment to demand from
the processor, and whether a self-hosted model is required regardless.

**F6 — three API endpoints are unauthenticated reads.** *(fixed)*
`/api/proposals`, `/api/constitution` and `/api/votes` performed no M8
authentication, contradicting the README's "Client API endpoints require M8
JWTs". `/api/votes?card=<id>` returns every vote on a card **including
`voter_did` and influence weight** — a per-DID voting record to any caller who
can reach the port. The port is published on `127.0.0.1` only, so this was not
currently internet-exposed, which is why it was a finding and not an incident.
These are deliberation-card votes, not ballots; ballots are not in this service.

Fixed by adding `authenticateM8(req, config)` to all three GET handlers
(`services/matrix-bridge/src/index.ts`), matching the pattern already used on
the POST endpoints. This requires a valid M8 session, closing the gap with the
README's claim; it does not add a community-membership check beyond that —
same authorization level the POST endpoints on these resources already use.

**F7 — push-based membership projection cannot survive CD-M1.** *(open,
structural — this is what OD-5 is really about)*
When the firehose sees a `com.para.community.membership` record it invites that
member to the community's rooms. To do that it needs an MXID, and it gets one
from `ensureMxid` (`firehose.ts`): read `user_matrix_map`, and on a miss derive
it with `didToMxid(did)`. `ensureUserExists` then mints a random password and
stores it via `setMxidForDid`.

All three of those mechanisms are things v2 removes:

| Mechanism | Removed by |
|---|---|
| `user_matrix_map` DID→MXID table | §3, "no server-held identity mapping" |
| `didToMxid` reversible derivation | CD-M1 |
| server-minted account passwords | §5, `password_config.enabled: false` |

After CD-M1 the MXID is `H(identity_pub_i)`. The server never sees
`identity_pub_i` — the membership lexicon carries only the repo DID, no MXID and
no key material (`lexicons/com/para/community/membership.json`) — so **the
server cannot compute the MXID of a member it wants to invite.** This is not a
porting difficulty; the operation is unimplementable as written.

The consequence is that OD-5 is not only "move governance logic out of the
bridge". The governance side is already portable (CD-M2). It is the
*provisioner* that has to change shape: it can no longer push users into rooms,
because it cannot name them.

**F8 — fifteen more GET endpoints are still unauthenticated.** *(fixed)*
F6 closed the three endpoints that had been spot-checked. A full pass over all
41 `/api` branches shows the pattern is broader: every `POST` handler calls
`authenticateM8`, and fifteen `GET` handlers still do not.

`/api/sortition/runs`, `/api/sortition-proofs`, `/api/sortition-proof`,
`/api/sortition-proof-as-record`, `/api/decisions`, `/api/chat-badges`,
`/api/chat-member-list`, `/api/moderation-dashboard`,
`/api/user-chat-preferences`, `/api/cards`,
`/api/community-map/contributions`, `/api/graph`, `/api/suggestions`,
`/api/summarize`, `/api/community-pulse`.

Ranked by what they disclose:

1. **`/api/chat-member-list?community=<uri>`** — the worst of the set. It
   returns `{ did, matrixUserId, badges, participation }` per member
   (`chat-moderation.ts` `getMemberList`, backed by a join against
   `user_matrix_map`). That is **the DID↔MXID linkage table itself, served over
   HTTP without a token** — the exact artefact this upgrade exists to remove.
2. `/api/sortition-proofs`, `/api/sortition-proof-as-record` — DID-linked
   selection proofs for an entire community.
3. `/api/moderation-dashboard` — reports and sanctions for a community.
4. `/api/summarize` — lets an unauthenticated caller trigger third-party LLM
   calls, i.e. spend and data egress (F5).
5. The remainder disclose deliberation content and per-DID preferences.

Fixed by adding `await authenticateM8(req, config)` as the first statement of
all fifteen GET handlers, matching the pattern F6 established. The PARA client
already sends `Authorization: Bearer` on every bridge call and already handles
401 by refreshing (`PARA/src/lib/matrix/bridge.ts`), so no client change was
needed. Every `/api` branch in `index.ts` now authenticates.

Residual, deliberately not addressed here: this is authentication, not
authorization. `/api/chat-member-list?community=` still returns any community's
member list to any authenticated user, and `/api/user-chat-preferences?did=`
still accepts an arbitrary DID. Membership and self-only checks are a separate
change — tracked as F9.

Verified by two independent parses of `index.ts` plus direct reads of the
handlers. The port is published on `127.0.0.1` only, so this is a finding and
not an incident — confirm the Caddy/nginx front end does not proxy `/api`
before relying on that.

**F9 — the bridge authenticates but does not authorize.** *(open)*
With F6 and F8 closed, every `/api` endpoint requires a valid M8 session. Almost
none of them check that the caller is *entitled to the specific resource*: any
authenticated user can read any community's member list, moderation dashboard,
sortition proofs or another user's chat preferences by passing the right query
parameter. `/api/space-for-community` is the exception — it checks active
membership — and is the pattern the others should follow.

Not urgent in the current single-community pilot; blocking before multiple
communities share a homeserver, because it makes cross-community enumeration
trivial for anyone with an account.

*One instance fixed: `/api/moderation-dashboard`.* It called `authenticateM8`
and **discarded the result**, then authorised entirely against the
client-supplied `modDid` query parameter — so any authenticated member could
name someone else's moderator DID and read the dashboard. `is_moderator` is
returned by `/api/chat-member-list` (`SELECT ps.*`), so finding a moderator DID
took one call. Now `modDid` must equal the authenticated DID and the entitlement
check runs against `auth.did`; `/api/moderation-recompute` twenty lines below
already did it this way, so this was a slip rather than the general pattern.

Singled out because this endpoint is where F9 and F4 compounded, and there the
"not urgent in a single-community pilot" reasoning did not hold: the dashboard
returned `reported_message_preview` and `reporter_did` for every report in the
community, so *within* one community any member could read the reported content
and learn who reported whom. With F4's excerpt now dropped the remaining
disclosure is reporter identity — still real, since it means **reporting is not
anonymous to anyone who can call the endpoint**, and worth checking against what
the client UI implies. The rest of F9 stands as written.

**F10 — `setup.sh` appended Redis config onto a comment line.** *(fixed)*
The generated `homeserver.yaml` ends with `# vim:ft=yaml` and **no trailing
newline**, so `echo "redis:" >> "$SYNAPSE_CFG"` produced `# vim:ft=yamlredis:` —
the `redis:` key swallowed into a comment, its children left as bogus top-level
config. The block was appended whenever `.env` contained a `REDIS_HOST`, which
it does.

Redis is not merely misconfigured here, it is wrong: it is only needed for a
worker deployment, and `docker-compose.matrix.yaml` defines no redis service, so
this pointed Synapse at a host that does not exist in the stack. The append is
removed and nothing is written into `homeserver.yaml` any more — generated
settings go to the overlay, which cannot corrupt a hand-written file.

**F11 — Postgres must be initialised with `C` collation.** *(fixed)*
Synapse refuses to start against any other collation:
`IncorrectDatabaseSetup: Database has incorrect collation of 'en_US.utf8'`. The
`synapse-db` service never set `POSTGRES_INITDB_ARGS`, so the volume was created
wrong. This was latent for as long as F2 hid it — nobody could hit a Postgres
collation error while Synapse was silently running on SQLite.

`POSTGRES_INITDB_ARGS: '--encoding=UTF8 --lc-collate=C --lc-ctype=C'` is now set.
**initdb args apply only at volume creation**: an existing Postgres volume must
be destroyed and recreated, or dumped and restored, since changing the compose
file alone does nothing.

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
- **Push payloads carry no message content.** `push.include_content: false` is
  server-enforced; a misconfigured client cannot opt back in.
- **Media requires authentication.** `enable_authenticated_media: true`.
- **The homeserver contacts no third-party key server.** `trusted_key_servers: []`.

### Best-effort (real, but do not describe them as guarantees)

- **Retention.** Synapse's retention support is experimental upstream. It stops
  *this server* serving old events; it does not reliably purge media and cannot
  reach copies already synced to a device. Never tell users "messages are
  deleted after 90 days".
- **Federation closure.** A configuration setting, not a network control. It is
  only as good as the config actually loaded — which is precisely what F1 shows
  can silently fail. Verify it at runtime, not by reading the file.
- **Rate limits.** Blunt scripted enumeration; not a defence against a
  distributed attacker.
- **Read receipts and typing notifications.** There is no server-side switch for
  these in Synapse. The plan's "receipts off by default" is a *client* setting
  and a server operator can still observe them.

### Not true yet (claimed by v1 docs, or aspired to by the plan)

- **End-to-end encryption.** Not on. The current client cannot decrypt. Until
  the Phase 2 crypto spike lands, the homeserver operator can read message
  content, and no wording anywhere should imply otherwise.
- **No server-held identity mapping.** v1 holds a bidirectional DID↔MXID table
  with passwords. §4 removes the *need* for it; deleting it is Phase 2/3 work
  and it exists until then.

## 4. MXID derivation

```
localpart_i = base32_lower_nopad( SHA-256("para-id/matrix-localpart/v1" ‖ identity_pub_i)[0..20] )
mxid_i      = "@" ‖ localpart_i ‖ ":" ‖ server_name
```

`identity_pub_i` is the 32-byte ristretto255 identity public key from
`mubEZ/docs/IDENTITY_DERIVATION.md`. Reference implementation:
`iM8/src/services/matrixIdentity.ts`.

Example, for the all-zero seed vector on `matrix.para.social`:

| identity | MXID |
|---|---|
| `public` (0) | `@k4o2lmcmitomgymtdb7y3htsthoofobo:matrix.para.social` |
| `anonymous` (2) | `@tksdt6ou5rbvxzeegiriy25u24pft5gz:matrix.para.social` |
| `civic` (1) | *refused — has no Matrix account* |

### Which identities may have an account

The plan says Matrix accounts exist for the *public* and *community*
identities and never for the *voting* identity. This codebase does not use
those names, and the mismatch is a trap:

| Plan | This codebase | Matrix account |
|---|---|---|
| public | `public`, index 0 | yes |
| community | `anonymous`, index 2 — the pseudonymous posting surface | yes |
| voting | `civic`, index 1 — *"Civic participation (ballots, delegation)"* | **never** |

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
user list *was* the linkage table — no exfiltration of the bridge database
needed, just a look at any room's member list. The MXID must instead be a
function of client-held key material only.

**Rejected alternatives.**

- *Server-assigned random localparts.* Requires the server to store the mapping,
  which is the thing being removed.
- *The public key encoded directly (base32 of the 32 bytes).* Works, but a
  53-character localpart, and it publishes the raw key in every member list and
  every event sender field. The hash keeps the key out of ambient logs while
  still being verifiable by anyone who is shown the key.
- *No truncation (full 256-bit digest).* 52 characters for no gain. The digest
  is not a secret — the full public key is presented at authentication — so it
  needs collision resistance, not preimage margin. 160 bits gives an ~2⁸⁰
  birthday bound against accidental collision.
- *SHA-512 reduced, matching the scalar derivation.* The scalar derivation uses
  SHA-512-mod-l because it must land in the group; a localpart has no such
  constraint and SHA-256 is the plainer choice.
- *Uppercase base32 / base64.* Invalid: the Matrix historical user-ID grammar
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

Two settings are deliberately present but commented out:

- `encryption_enabled_by_default_for_room_type: all` — **Phase 2.** This is the
  switch that delivers "E2EE always". It is blocked on the client, not the
  server: enabling it now leaves members unable to read rooms they are in.
- `password_config.enabled: false` — **Phase 1 exit**, once MAS and `para-idp`
  are live. Until then the bridge still issues passwords and turning this on
  locks everyone out. Leaving local password login enabled after MAS lands would
  keep a parallel way in and mean the derived-MXID property is not truly
  enforced.

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

## 6. Open decisions

**OD-1 — homeserver.** Synapse remains the default. The Tuwunel spike is
timeboxed to 2 days in Phase 1. Continuwuity is not a candidate while it lacks
application-service support; note that `docker-compose.matrix.yaml` still
carries a commented Continuwuity block from v1, which should be deleted once
OD-1 is closed so it cannot be mistaken for a supported option.

**OD-2 — proof of possession for `para-idp`.** *(CLOSED 2026-08-20 — see
CD-M4 below and [OD-2-PROOF-OF-POSSESSION.md](OD-2-PROOF-OF-POSSESSION.md))*
Gate G0 passed: `@scure/sr25519` accepts a PARA identity scalar and reproduces
`identity_pub_i` exactly. No novel cryptography is required, and the external
audit that a hand-rolled scheme would have needed is no longer on the critical
path. Implemented in `iM8/src/services/identitySignature.ts`.

**OD-3 — third-party LLM processing (F5).** Whether community deliberation text
may be sent to OpenAI at all; if yes, under what consent surface, with what
retention commitment from the processor, and whether a self-hosted model is
required instead. Until this is closed, deploy without `OPENAI_API_KEY`.

*Partially addressed.* The consent surface is built and enforced — CD-M3, §7,
per-author and fail-closed. The rest of OD-3 is untouched and still needs a
human decision: (a) the disclosure wording members are agreeing to, which
`AI_CONSENT_POLICY_VERSION = 1` currently stands in for without any text behind
it; (b) the retention and training commitment to require from the processor;
(c) whether a self-hosted model is required regardless of consent. Until those
are settled the deploy guidance above is unchanged — consent machinery existing
is not a reason to set `OPENAI_API_KEY`.

**OD-4 — identity label mapping.** Confirm `civic` = ballot identity and
`anonymous` = community identity as reasoned in §4.

**OD-5 — where governance logic goes.** *(closed by CD-M2, §7.)* Target is a
two-service split: `para-governance` owns the firehose and all governance state
and speaks DIDs only; `para-matrix-provisioner` owns rooms and never names a
user. Investigating this surfaced F7 — the current push-based membership
projection is unimplementable after CD-M1 — which is why the residual question
below is filed separately rather than treated as an implementation detail.

**OD-6 — the join seam (from F7 / CD-M2).** If the server can no longer invite a
member because it cannot compute their MXID, how does a member join a community
room? The client can derive its own MXID and holds `identity_priv_i`, so the
shape is a join authorized by proof rather than an invite. Undecided: whether
the proof is a short-lived capability token issued by `para-governance`, a
Synapse module validating it at join time, or MAS-mediated. **Blocked on OD-2** —
all three need the same signature primitive.

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

*Overstated:* the governance core is already Matrix-free. `constitution.ts` has
no imports at all; `drand.ts` imports only `node:crypto`; `sortition.ts` only
`drand`; `chat-moderation.ts`, `extraction.ts`, `summarize.ts` and
`llm-extraction.ts` reach only the database (and OpenAI, per OD-3). That is
1,842 lines that move with no rewrite. Only two modules touch Matrix at all:

- `proposals.ts` — a single fire-and-forget `announceInMatrix`, already
  try/caught at both call sites and already a documented no-op when a community
  has no space. This is an outbound notification, not coupling.
- `firehose.ts` — the real tangle: it consumes ATProto records and in the same
  pass both decides governance outcomes *and* projects them onto Matrix
  (`createSpace`, `createRoom`, `inviteUser`, `kickUser`, `setPowerLevel`).

So the seam is not between "governance" and "the bridge". It is inside
`firehose.ts`, which is doing two jobs.

*Understated:* F7. The projection half of that job stops being implementable
once CD-M1 lands, because the server can no longer name a member.

The table split falls out along the same line — 6 Matrix-plane tables
(`community_space_map`, `matrix_events`, `room_read_markers`,
`user_push_tokens`, `user_chat_preferences`, and `user_matrix_map`) against ~22
governance tables. The only table that genuinely straddles the planes is
`user_matrix_map`, which v2 deletes anyway. `chamber_assignment` is a governance
output that provisioning consumes, and is therefore exactly where the port
belongs.

**Rejected alternatives.**

- *Keep one service, split internally by module.* Cheapest, and the module
  boundaries are already good enough to make it look tidy. Rejected because it
  leaves governance state and Matrix credentials in one process and one
  database, so "the homeserver operator cannot link a DID to an MXID" stays a
  code-review claim rather than a deployment property. The point of the split is
  that the provisioner should not be *able* to learn what it must not store.
- *Provisioner owns the firehose and calls governance.* Inverts the dependency:
  the component that must know least would parse every governance record to
  decide what to forward. It also puts the cursor in the wrong service — replay
  is a governance concern.
- *Governance calls the Matrix admin API directly, no provisioner.* This is v1
  with extra steps, and it hands Synapse admin credentials to the service that
  holds voting records.
- *Three services (governance / provisioner / deliberation-and-LLM).* Splitting
  deliberation out is attractive while OD-3 is open, since it isolates the one
  component that talks to a third-party processor. Deferred, not rejected: it is
  a sub-split of `para-governance` and can be done later without disturbing this
  boundary. Doing it now would mean designing two ports before either is
  exercised.

**Consequences.**

The provisioner's port is small — the operations `firehose.ts` actually uses
today are `createSpace`, `createRoom`, `addChildSpace`, `inviteUser`,
`kickUser`, `setPowerLevel`, `getRoomMembers`, `sendEvent`, plus
`userExists`/`createUser`. The last two disappear with §5's
`password_config.enabled: false`, and per F7 every operation naming a *user*
disappears with CD-M1. What remains is genuinely thin: create rooms, set rules,
send bot messages.

Membership therefore inverts from push to **pull**. The server stops inviting
members; a member joins, presenting proof that they hold the identity key behind
their MXID and that they are an active member of the community. The client can
do this — it holds `identity_priv_i` and derives its own MXID — and the server
can verify it without storing a mapping.

That makes **OD-5 dependent on OD-2**: both need the client to prove possession
of `identity_priv_i`, and neither can be built until a signature scheme over
ristretto255 is chosen. Closing OD-2 unblocks both. The exact join mechanism —
capability token from governance, a Synapse module, or MAS-mediated — is left
open as OD-6 rather than guessed at here.

Until OD-2 closes, this decision is a target, not a migration order. The safe
work it authorizes now is the part that does not depend on the join seam:
separating the schemas, and lifting the governance modules out of `firehose.ts`
so that projection sits behind a named interface instead of inline calls.

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
relationship inference sends up to 20 *other* members' cards as context. Gating
on the caller would mean one member's opt-in exports everyone else's words. The
consenting user is rarely the person whose privacy is at stake.

**Rejected alternatives.**

- *Deploy-time flag only (the status quo, `OPENAI_API_KEY`).* All-or-nothing for
  a whole instance, and the people whose text is sent never see the question.
- *Consent checked against the requesting user.* The trap above. Rejected on the
  grounds that it silently exports non-consenting members' text.
- *A boolean column on `user_chat_preferences`.* Cheapest, but consent needs an
  audit trail — when granted, under which disclosure, when revoked — and a
  cosmetic chat preference is the wrong neighbourhood for it. Decisive practical
  point: this codebase has no `ALTER TABLE` anywhere, so a new column on an
  existing table would silently not apply to deployed instances, while a new
  table is created by the existing `CREATE TABLE IF NOT EXISTS` path.
- *Consent as a single timeless boolean.* Consent to one disclosure is not
  consent to a later one. `policy_version` is stored alongside the grant, and
  `AI_CONSENT_POLICY_VERSION` is compared with `>=` at check time, so bumping it
  invalidates prior grants and re-prompts rather than silently broadening what
  people agreed to.
- *Redaction/anonymisation instead of consent.* Deliberation cards are written in
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
sr25519 *is* Schnorr over ristretto255 — by constructing the 64-byte secret as
`(encodeSecretScalar(identity_priv_i) ‖ nonceSeed)` and letting the library
sign. `identity_pub_i` is then the sr25519 public key, verified against all
three shared seed vectors for both signing identities.

**Problem.** CD-M1 makes the MXID a function of a *public* value, so presenting
the key proves nothing. A signature scheme over PARA identity keys did not
exist: governance votes sign with the atproto DID key (which is the linkage v2
removes) and mubEZ's registration contract promised a scheme it never shipped.

**Rejected alternatives.**

- *Transposing Monero's `generate_signature` to ristretto255.* Sound, and it was
  the recommendation until the spike. Rejected because it needs cryptographic
  review this project has nobody to perform — the "part-time security reviewer"
  in the v2 plan does not exist. Retained as the documented fallback.
- *A separate Ed25519 signing key per identity.* Nothing would bind it to
  `identity_pub_i`; every fix leads back to signing with the identity key or to
  a server-side mapping table.
- *Signal's poksho/zkgroup.* Right family — ristretto255 Schnorr with labelled
  domain separation — but Rust-only, no React Native binding, and it solves
  zero-knowledge proofs of arbitrary statements where we need one discrete log.
  Read for discipline, not imported.

**Consequences.**

- **The scalar must be cofactor-shifted.** sr25519 stores the key half as
  `scalar << 3` (schnorrkel's Ed25519-compatible format) and divides by 8 on
  read. Injecting a raw scalar silently yields the *wrong* public key — no
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

**Supersedes.** The Option A recommendation in the OD-2 memo, which remains as
the fallback if this dependency ever becomes untenable.

### CD-M5 — atproto Spaces is the permissioned-space layer, not a Matrix replacement

**Decision.** Adopt atproto Spaces, when it stabilises, as the implementation of
the "Permissioned space" column that already exists in the layer-boundary table
(§4) — durable deliberation artifacts. It does **not** replace Matrix, and it
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
   not encrypted". §2 of this plan requires E2EE always, client-side only. A
   layer with no confidentiality cannot hold private conversation, and the fact
   that it is *permissioned* is easy to mistake for *private*.
2. **Identity is the atproto DID.** Everything in a space is authored by a DID,
   in that DID's repo. CD-M1 exists to stop a DID being relatable to a chat
   account; routing community conversation through Spaces would reinstate the
   linkage at the storage layer, where it is far harder to remove than a bridge
   table. There is no pseudonymous or unlinkable participant in the Spaces
   model.

**Consequences.**

- The layer-boundary table gains a real implementation for its third column:
  proposal drafts, amendments, evidence, and delegate ↔ delegator durable notes
  — content whose authorship is *meant* to be attributable to a public identity.
- **Hard boundary: the `anonymous` (community) identity must never author into a
  Space**, because doing so binds its content to a DID. Only the public identity
  may. This belongs in the layer-boundary table as a merge-blocking rule
  alongside the ballot rule.
- Nothing about CD-M1, CD-M4 or the quarter plan changes. Spaces is additive and
  arrives after; adopting an alpha protocol whose schema is not final, during a
  quarter already committed to production, would be the wrong trade.

**Rejected alternative.** *Replacing the Matrix homeserver with Spaces.*
Tempting — it would delete a whole service and its operational burden. It fails
on both properties above: PARA would lose encryption it has planned for, and
regain the linkage it has spent this quarter removing.

## 8. Phase status

| Plan item | Status |
|---|---|
| Confirm v1 assumptions; inventory what the bridge stores | Done — §1, §2 |
| Metadata hardening applied and documented | Done — §5, **verified on a running server 2026-08-20** (F1) |
| MXID derivation formula locked | Done — §4, CD-M1 |
| iM8 `getMatrixIdentity` with tests | Done — `matrixIdentity.ts`, 18 tests |
| Identity-boundary CI suite (Matrix) | Partial — the "voting key has no Matrix account" half is covered. The "no DID↔MXID table exists" half cannot pass until the v1 table is removed (Phase 2). |
| `para-idp` + MAS prototype | **Done and verified 2026-08-20** — a PARA seed creates `@k4o2lmcmitomgymtdb7y3htsthoofobo:matrix.para.social`; zero DID columns in either database |
| Tuwunel spike | Not started |
| Homeserver decision recorded | Open — OD-1 (deferred out of this quarter) |
| Proof of possession | Done — CD-M4, `identitySignature.ts`, 16 tests |
| Target for governance logic | Done — §7, CD-M2. Migration blocked on OD-2/OD-6; **the `firehose.ts` interface extraction landed 2026-08-22** (`MatrixProjectionPort` in `matrix-projection.ts`; firehose is DID-only). Physical schema split still awaits OD-2/OD-6. |
| LLM processing consent surface | Done — §7, CD-M3, 11 tests. Policy half of OD-3 still open; client-side prompt not built. |
