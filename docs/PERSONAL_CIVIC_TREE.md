# Personal Civic Tree — data boundaries

**Scope: shared PARA data boundaries and the TypeScript AppView implementation.**
Reviewed 2026-10-14. CD-P1 is implemented; CD-P2 remains the sharing constraint.
Hosting/source migration and the aggregate's long-term scope remain open
(OD-P1–OD-P3). [VLPDS](VLPDS.md) is the Rust integration guide; replacing the
PDS does not migrate these private AppView payloads or make public records private.

---

## 1. It is two systems sharing one name

Anything reasoning about "the personal civic tree" has to say which half it
means, because they have opposite properties.

**Collections** — `com.para.collection.*`. What `CivicTreeScreen` renders: user-
curated sets of items with typed relations between them. Access control is
already correct — `authVerifier.standard`, `actorDid` bound to the viewer, no
caller-supplied DID anywhere. But there is **no record lexicon**: a collection is
an opaque `payload` in the appview and exists nowhere else. Private, and homeless.

**The civic footprint aggregate** — `getParaPersonalCivicTree`, surfaced through
`com.para.actor.exportCivicTree`. A derived view over memberships, cabildeos,
votes, delegations and highlights, rendered as an Obsidian vault. Not curated by
the user; assembled from records that already exist. This is the half that leaked.

---

## 2. Findings

**F-P1 — the export was an unauthenticated cross-account read.** _(fixed, CD-P1)_
`exportCivicTree` ran under `optionalStandardOrRole` and resolved
`params.actor ?? viewer` with no ownership check. `optionalStandardOrRole`
returns null credentials rather than throwing when no credentials are present,
so an anonymous `GET ?actor=<any did>` returned that account's votes (with
selected option), delegations (with delegate), highlights (with full text) and
memberships, pre-formatted. The aggregation made it worse than the sum of its
sources: no protocol knowledge required, one request, a ready-to-open vault.

**F-P2 — fixing the aggregate does not fix the exposure.** _(open, OD-P2)_
CD-P1 stops PARA serving anyone's dossier. It does not stop a third party
assembling the same dossier, because every source it reads is a public repo
record reachable by `com.atproto.repo.listRecords`. What was removed is the
convenience, not the data. **An authorization check on an aggregate is worth
little while its sources are world-readable** — the boundary has to sit where
the records live.

**F-P3 — the appview runs from `dist`.** The `standard` auth change had no effect
until `pnpm build` ran, because `@atproto/bsky` resolves through its `exports`
map to `dist/`, and the dev-env test network boots the built package. A
source-only review of this fix would have concluded, wrongly, that it was live.
The regression test in `tests/views/para-civic-tree-export.test.ts` caught it.

**F-P4 — the graph model already exists and is unused.**
`com.para.collection.defs#civicTreeRelation` defines `fromItemId`, `toItemId`,
`kind` and `note`, and `collectionView` carries `relations` alongside `items`.
The v2 graph rendering is therefore a client change with no schema, lexicon or
migration work behind it.

**F-P5 — the neighbouring endpoints are sound.** Checked while sweeping for the
same shape: `com.para.raq.getUserAlignment` takes a caller-supplied `did` but the
dataplane filters `isPublic = true`, and `com.para.actor.getProfileStats` applies profile/viewer rules, including
`revealInfluence`: the owner can read hidden totals but another viewer cannot. Neither is an instance of F-P1. Recorded so the next
reviewer does not re-derive it.

---

## 3. Decisions

### CD-P1 — a civic tree is exportable only by its subject

**Decision.** `com.para.actor.exportCivicTree` requires `authVerifier.standard`.
The `actor` parameter is retained so a client may name itself, and is rejected
with `Forbidden` when it resolves to any DID other than the authenticated
viewer. Pinned by `tests/views/para-civic-tree-export.test.ts`.

**Problem.** F-P1.

**Rejected alternatives.**

- _Dropping the `actor` parameter entirely._ Cleaner, but it is a breaking
  lexicon change for a parameter with a legitimate self-referential use, and it
  invites a future re-add without the check. Keeping the parameter and rejecting
  the mismatch documents the rule at the point of temptation.
- _Gating on a `visibility` field in the exported records._ This is CD-P2's
  mistake in a different costume — a per-record flag the caller cannot be forced
  to respect, and one the protocol never sees.
- _Allowing role credentials through for moderation._ An Obsidian vault of one
  person's political activity is not a moderation instrument. If moderation ever
  needs this data it should get a purpose-built, audited surface.

**Consequences.** The endpoint now requires a real session. There was no client
consumer, so nothing broke. Any replacement AppView handler must retain this ownership check. With VLPDS,
the shared TypeScript AppView still serves the export; the PDS is not its
authorization boundary.

### CD-P2 — sharing is a membership operation, never a boolean

**Decision.** No sharing feature for collections, highlights, assessments or any
other personal civic data may be implemented as a visibility field on the record.
Sharing is expressed as membership of the space that holds the record, through
`com.atproto.simplespace.addMember` / `removeMember`.

**Problem.** PARA has made this mistake twice already and both instances are
still live. `com.para.raq.assessment` carries `isPublic` and
`com.para.highlight.annotation` carries `visibility`, and both records sit in
world-readable repos. The appview honours the flags; the protocol does not know
they exist. Anyone reading the PDS directly gets the data regardless. A flag that
only binds the well-behaved reader is not access control, and writing one is
worse than writing nothing, because the product then makes a promise about it.

**Rejected alternatives.**

- _Enforcing the flag in the appview only, and documenting the limitation._ This
  is the current state. The limitation is not documented anywhere the user can
  see, and the UI presents the flag as a privacy control.
- _Encrypting private records in place, in the public repo._ Moves the problem to
  key distribution and leaves the ciphertext, its size, and its write timing
  public — enough for traffic analysis of who is politically active and when.
- _Waiting for spaces before writing this down._ The prohibition is what has
  value now: the next person to add sharing to collections will reach for
  `isPublic` unless this exists.

**Consequences.** Sharing is blocked until a space host exists (OD-P1). That is
the intended trade: no sharing is a better product than a sharing control that
does not control anything.

---

## 4. Open decisions

**OD-P1 — where collections live.** The target is owner-controlled,
permissioned storage for personal civic collections, with the AppView demoted
to an index. The current `com.para.collection.*` handlers instead store opaque
owner-scoped stash payloads in the AppView. A public repo CAR does not export
that state. Keep an explicit private export/migration/recovery obligation until
a hosting decision and tested implementation replace it.

VLPDS's alpha Spaces support is a candidate on the native PDS; it is not enabled
by choosing the Rust write fork. WatZappa contains Spaces schemas/port work,
but their presence alone does not establish a working host in this checkout.
Resolve the actual host, OAuth permissions/client support, ownership and recovery
before migration. Do not introduce an additional PDS as an assumed requirement.
Sharing remains space membership under CD-P2, never a public visibility flag.

**OD-P2 — when the sources move.** Highlights, assessments and other personal
artifacts need an authorized storage/migration path. Public votes and delegation
have their own [OD-7 policy](OD-7-BALLOT-IDENTITY-REGISTRATION.md); accepted public
ballots do not acquire secrecy through an owner-only aggregate. A Space limits
readers but its signed commits still identify the author to authorized readers.

OD-2 proof of possession is closed by Matrix CD-M4. That does not supply a
private-voting protocol or decide OD-P1. Private ballots require the separate
election/credential/publication work in [GOVERNANCE.md](GOVERNANCE.md), not simply
moving a public record or renaming its identity.

**OD-P3 — whether the aggregate should exist at all.** `exportCivicTree` builds
a single document containing everything PARA knows about a user's politics. It is
now owner-only, which makes it a data-portability feature rather than a leak. But
it is also a ready-made exfiltration target for a compromised session, and the
convenience it adds over per-collection export is modest. Worth deciding
deliberately rather than keeping by default.
