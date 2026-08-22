# Personal Civic Tree — data boundaries

How a user's own civic record is stored, who may read it, and what must not be
built. Companion to the spaces adoption plan; the community civic tree is out of
scope here and stays as it is.

**Status:** CD-P1 implemented. CD-P2 is a standing prohibition, not a plan.
OD-P1 and OD-P2 are open.

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

**F-P1 — the export was an unauthenticated cross-account read.** *(fixed, CD-P1)*
`exportCivicTree` ran under `optionalStandardOrRole` and resolved
`params.actor ?? viewer` with no ownership check. `optionalStandardOrRole`
returns null credentials rather than throwing when no credentials are present,
so an anonymous `GET ?actor=<any did>` returned that account's votes (with
selected option), delegations (with delegate), highlights (with full text) and
memberships, pre-formatted. The aggregation made it worse than the sum of its
sources: no protocol knowledge required, one request, a ready-to-open vault.

**F-P2 — fixing the aggregate does not fix the exposure.** *(open, OD-P2)*
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
dataplane filters `isPublic = true`, and `com.para.actor.getProfileStats` returns
public profile aggregates. Neither is an instance of F-P1. Recorded so the next
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

- *Dropping the `actor` parameter entirely.* Cleaner, but it is a breaking
  lexicon change for a parameter with a legitimate self-referential use, and it
  invites a future re-add without the check. Keeping the parameter and rejecting
  the mismatch documents the rule at the point of temptation.
- *Gating on a `visibility` field in the exported records.* This is CD-P2's
  mistake in a different costume — a per-record flag the caller cannot be forced
  to respect, and one the protocol never sees.
- *Allowing role credentials through for moderation.* An Obsidian vault of one
  person's political activity is not a moderation instrument. If moderation ever
  needs this data it should get a purpose-built, audited surface.

**Consequences.** The endpoint now requires a real session. There was no client
consumer, so nothing broke. The check must be re-applied when this handler is
ported into `WatZappa-atpfork`, which currently has the lexicon and not the
handler.

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

- *Enforcing the flag in the appview only, and documenting the limitation.* This
  is the current state. The limitation is not documented anywhere the user can
  see, and the UI presents the flag as a privacy control.
- *Encrypting private records in place, in the public repo.* Moves the problem to
  key distribution and leaves the ciphertext, its size, and its write timing
  public — enough for traffic analysis of who is politically active and when.
- *Waiting for spaces before writing this down.* The prohibition is what has
  value now: the next person to add sharing to collections will reach for
  `isPublic` unless this exists.

**Consequences.** Sharing is blocked until a space host exists (OD-P1). That is
the intended trade: no sharing is a better product than a sharing control that
does not control anything.

---

## 4. Open decisions

**OD-P1 — where collections live.** They should be records in a
`com.para.space.personal` space, `skey: civic-tree`, under `memberListPolicy`
with the owner as sole member, with the appview table demoted to an index. This
needs a space host, and WatZappa cannot merge `upstream/permissioned-data` — it
has no shared ancestry with atproto. The two candidates are a stock alpha PDS run
as a sidecar, or continuing the hand-port (`packages/space` is already vendored
and passing its own suite). Unresolved.

**OD-P2 — when the sources move.** From F-P2: the personal civic tree only
becomes private once highlights, delegations and votes leave public repos.
Highlights and the RAQ assessment can move to a personal space as soon as OD-P1
resolves. Votes and delegations additionally need the `civic` ballot identity,
because a space hides records from non-members but does not make a write
anonymous to members — every space commit is signed over a context that includes
the author DID (`com.atproto.space.defs#signedCommit`). Blocked behind OD-2.

**OD-P3 — whether the aggregate should exist at all.** `exportCivicTree` builds
a single document containing everything PARA knows about a user's politics. It is
now owner-only, which makes it a data-portability feature rather than a leak. But
it is also a ready-made exfiltration target for a compromised session, and the
convenience it adds over per-collection export is modest. Worth deciding
deliberately rather than keeping by default.
