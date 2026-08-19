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

**F2 — Synapse was generating a SQLite config.** *(fixed)*
The compose file passes `SYNAPSE_DB_HOST` / `SYNAPSE_DB_USER` / …, which the
image's config template does not read; it reads `POSTGRES_*`. The generate step
in `setup.sh` passed neither, so the generated config used SQLite while the
`synapse-db` Postgres container ran unused. Retention purge jobs (§5) are not
viable on SQLite at any size. Fixed in `setup.sh`.

**F3 — the generated config directory was not gitignored.** *(fixed)*
It holds the homeserver signing key, `macaroon_secret_key`, `form_secret`,
`registration_shared_secret` and the database password. Added to `.gitignore`.
If that directory was ever committed, those secrets are burned and the signing
key must be rotated.

**F4 — user text is stored in the bridge database on two paths.** *(open)*
The README's "never raw message content" holds for timeline sync but not for:
`chat-moderation.ts` stores a 200-character preview of every reported message
(`reported_message_preview`), and deliberation cards store user-submitted text
(`deliberation_cards.content`). Card text is user-submitted through an
authenticated endpoint, not scraped from rooms — but it is still message-derived
content sitting outside Synapse, outside room retention, and outside E2EE.

**F5 — deliberation text is sent to OpenAI.** *(open, needs a decision)*
`/api/summarize` sends card titles and up to 150 characters of each card's
content to OpenAI (`gpt-4o-mini` by default) for up to 100 cards. The path is
gated on `OPENAI_API_KEY` being set, so it is off unless deployed with a key —
but when on, community deliberation content leaves our infrastructure to a
third-party processor, with no consent surface and no mention in the README,
the threat model, or the v2 plan. For a product that sells itself on privacy
this needs an explicit decision, not a config default. Tracked as OD-3.

**F6 — three API endpoints are unauthenticated reads.** *(open)*
`/api/proposals`, `/api/constitution` and `/api/votes` perform no M8
authentication, contradicting the README's "Client API endpoints require M8
JWTs". `/api/votes?card=<id>` returns every vote on a card **including
`voter_did` and influence weight** — a per-DID voting record to any caller who
can reach the port. The port is published on `127.0.0.1` only, so this is not
currently internet-exposed, which is why it is a finding and not an incident.
These are deliberation-card votes, not ballots; ballots are not in this service.

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

**OD-2 — proof of possession for `para-idp`.** The client must prove it holds
`identity_priv_i` when asserting its public key to MAS. mubEZ's registration
contract already calls for "a signature over the registration challenge with
`identity_priv_i`", but no signature scheme is implemented anywhere in iM8 or
mubEZ today, and ristretto255 has no off-the-shelf Ed25519-style signature.
Choosing one is a cryptographic design decision for the security reviewer, not
something to improvise. Until it is closed, `getMatrixIdentity` deliberately
returns no private key material and cannot sign.

**OD-3 — third-party LLM processing (F5).** Whether community deliberation text
may be sent to OpenAI at all; if yes, under what consent surface, with what
retention commitment from the processor, and whether a self-hosted model is
required instead. Until this is closed, deploy without `OPENAI_API_KEY`.

**OD-4 — identity label mapping.** Confirm `civic` = ballot identity and
`anonymous` = community identity as reasoned in §4.

**OD-5 — where governance logic goes.** The provisioner cannot be thin while
proposals, sortition and moderation live in the bridge. Needs a target before
Phase 2 starts.

## 7. Phase status

| Plan item | Status |
|---|---|
| Confirm v1 assumptions; inventory what the bridge stores | Done — §1, §2 |
| Metadata hardening applied and documented | Done — §5. **Applied to the compose stack; not yet verified on staging.** |
| MXID derivation formula locked | Done — §4, CD-M1 |
| iM8 `getMatrixIdentity` with tests | Done — `matrixIdentity.ts`, 18 tests |
| Identity-boundary CI suite (Matrix) | Partial — the "voting key has no Matrix account" half is covered. The "no DID↔MXID table exists" half cannot pass until the v1 table is removed (Phase 2). |
| `para-idp` + MAS prototype | Not started — blocked on OD-2 |
| Tuwunel spike | Not started |
| Homeserver decision recorded | Open — OD-1 |
