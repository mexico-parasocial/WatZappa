# OD-P4 — Device-bound assurance for permissioned spaces

Status: **open, proposal — not decision-ready.** Written 2026-09-18 in response
to the question of whether the identity used for spaces should be merged with
iM8's identity infrastructure so that access can be managed per device. This
memo exists to be reviewed, amended or rejected. Nothing downstream of it should
be built until it is closed. On acceptance it becomes a sibling entry in
`mubEZ/docs/CRYPTO_DECISIONS.md`.

Reviewer: the part-time security reviewer named in the v2 plan.

## 1. The question

Should iM8 become the device-assurance authority for permissioned spaces, and
should the space credential identity be merged with iM8's identity
infrastructure so that a user can grant, see and revoke space access per device?

The short answer this memo argues for: **yes to device assurance, no to merging
the identities, and never for the `civic` identity.**

## 2. The primitive already exists — only the registry is missing

This is cheaper than it sounds. Three pieces are already built and tested.

**The DPoP thumbprint is already a device binding.** The draft assurance profile
in `PERMISSIONED_DATA_PORT.md` already requires `cnf.jkt`, the thumbprint of the
DPoP key on the exchange request. A DPoP key is per client instance, which in
practice means per app install on per device. The port therefore already proves
*"this exact request came from the key-holding instance"*. What it does not have
is any durable notion of *"and that instance is device D, enrolled at T, at
assurance level L, revocable independently of the OAuth session."*

**The extension point is already declared.** The profile carries
`assurance: { version: 1, level: "m8-session-verified" }`, and the memo already
states M8 may evolve the level without silently broadening access. A device
level slots in as a new `level` value with **no protocol change** and no new
lexicon.

**The revocation machinery already exists, twice.** The `PolicyResolver` already
denies on epoch mismatch, revoking a live credential before its TTL elapses. And
the checkpoint protocol already carries **two independent monotonic floors**
(source version and policy epoch) rather than conflating them. A device epoch is
the same pattern a third time, against machinery with tests behind it.

## 3. The hazard: a device registry is a correlation oracle

This is the part that must not be got wrong, and it is why the answer to
"merge the identities" is no.

PARA derives three identities from one seed — `public` (0), `civic` (1),
`anonymous` (2), with per-card tweaks under each label
(`iM8/src/services/keyDerivation.ts`, `mubEZ/docs/IDENTITY_DERIVATION.md`). The
entire point of that construction is that **no server holds a table relating two
of them**. The per-card tweak exists precisely because a single key per label
would make the unlinkability promise "only skin-deep".

A device registry built the obvious way destroys this. If iM8 stores rows of
`(device_id → DID)` and a user enrolls the same phone under `anonymous` and
under `public`, iM8 now holds the join that the whole derivation exists to
prevent. This is **worse than the status quo**, not neutral:

- a device identifier is an unusually strong correlator — stable, survives
  logout, often survives reinstall and sometimes factory reset;
- it is a *durable* table rather than a transient session, so it is exactly what
  a subpoena, a backup leak or a single server compromise yields; and
- it is invisible to the user, who was told the cards are not linked.

An access-controlled correlation table is still a correlation table. Access
controls are a policy over a structure; the structure is the risk.

## 4. Proposal: per-identity blinded device handles

Enrollment is scoped to **one derived identity and card**. There is never a
cross-identity device record, anywhere, at any privilege level.

The handle iM8 stores is blinded per identity, reusing the existing derivation
idiom rather than inventing a parallel scheme:

```
H = hashToScalar(DOMAIN_DEVICE, viewPriv, u32le(index), u32le(card), device_pub)
```

with `DOMAIN_DEVICE = 'para-device/v1'`, matching the existing
`DOMAIN_IDENTITY` / `DOMAIN_CARD` separation.

Properties that follow directly:

- The same physical device enrolled under `public` and under `anonymous` yields
  two handles that are **unlinkable to iM8**, because the index and card enter
  the hash.
- iM8 stores only `(identity DID, H, enrolled_at, assurance level, device
  epoch)`. It never stores the raw device identifier or `device_pub`, and holds
  no join key across identities.
- **Lost-device revocation works without correlation**, which is the usual
  sticking point. The handle derives from `viewPriv`, and the view key already
  exists to let the holder enumerate their own cards — "anyone holding the view
  key can still enumerate every card — that is what the view key is for". A
  recovery device holding the seed therefore recomputes every handle for every
  known `device_pub` and revokes the lost one per identity. The `device_pub`
  list lives encrypted under the identity key in the user's own repo, not in a
  server-side table.

## 5. Revocation as a second epoch dimension

The space credential carries `(policyEpoch, deviceEpoch)`. `PolicyResolver`
denies on a mismatch of **either**, with distinct denial codes
(`epoch-mismatch` gains a sibling `device-epoch-mismatch`) so the audit trail
says which authority revoked.

The two dimensions are deliberately **not merged**, and their separation is a
security property rather than an implementation detail:

| dimension | owned by | answers |
|---|---|---|
| `policyEpoch` | AppView governance → PDS projection | *is this member still authorized?* |
| `deviceEpoch` | the identity holder, asserted via iM8 | *is this device still mine?* |

Revoking a device bumps `deviceEpoch` for that identity only. Live credentials
die at the next check rather than at TTL expiry. Governance changes and device
changes cannot mask each other.

This also yields a property worth naming and testing explicitly: there are now
**two independent roots of authority** — the AppView publisher's Ed25519 key for
governance, and M8's key for assurance. Neither alone grants space access.
Compromise of the publisher key cannot fabricate a device; compromise of M8
cannot fabricate membership. Today this is true by accident of structure; it
should become a named, tested invariant.

## 6. `civic` must never carry a device binding

Stating this loudly because "apply the device binding everywhere" is the natural
engineering instinct and it is wrong here.

`civic` (index 1) is **the ballot identity** — "Civic participation (ballots,
delegation)". Binding ballots to a device creates two failures a ballot system
must not have:

1. **A seizure and coercion vector.** A device is a physical object. "Which
   device cast this ballot" converts a seized or borrowed phone into evidence
   about how a specific person voted. Ballot secrecy that survives only until
   someone picks up the handset is not ballot secrecy.
2. **A metadata channel.** Even a blinded handle is a stable pseudonym *within*
   the civic identity, enough to cluster ballots by device across time.

Recommendation: device enrollment applies to `public` and `anonymous` only.
`civic` keeps a separate assurance path with no durable device record. The check
must be an **allowlist over identity labels, failing closed** on anything
unrecognised — consistent with the existing rule that a document's
voting/community wording be translated to `civic`/`anonymous` before touching
code, and that unknown labels fail closed.

This interacts with OD-7 and with the standing decision that the pilot must not
publish rewritable ballot records. Device assurance does not change that and
must not be presented as mitigating it.

## 7. Rejected alternatives

**(a) Merge the space credential into the iM8 session identity.** Rejected. The
port already established that `/sessions/me` proves only that a `createSession`
request was checked, and "must not be treated as an enduring attribute of a PDS
OAuth token". Merging is precisely the conflation the port refused, and it would
put iM8 availability on the path of every space write — the same coupling the
PDS-resident projection was designed to remove.

**(b) One device registry across identities, with access controls.** Rejected,
per §3. The structure is the risk.

**(c) Vendor hardware attestation (Play Integrity, App Attest) as the assurance
floor.** Rejected as a floor; acceptable only as an optional *higher* level. It
binds the user to a vendor account, leaks a stable device and vendor identifier
to a third party who is not in the threat model, and excludes de-Googled and
custom-ROM devices — a population PARA has specific reason to care about. Any
use of it belongs in the threat model by name, as a third-party processor.

**(d) Reuse `clientAttestation` to carry device identity.** Rejected for the
reason the port already gives about M8 tokens: client, device and user prove
different things, and overloading one field makes the allow-list check
ambiguous. Three distinct facts want three distinct, separately verified claims.

## 8. Consequences and the cheapest first step

**Pilot on the personal civic tree.** The owner-only personal tree is where
device binding is most valuable and least dangerous: a single identity, the
owner's own private data, no cross-identity linking possible by construction.
That is already manual-port step 5 ("an internal owner-only personal civic tree
for one collection before introducing community spaces"), so this adds no new
sequencing risk.

**What this does not solve.** Device assurance does not make private file bytes
safe, does not substitute for the M8 signed-assertion contract (OD stage 1,
still the critical path and still without a deployed broker surface), and does
not relax any gate in `PERMISSIONED_DATA_PORT.md`. It is an additional
authorization input, never a replacement for one.

**Unrelated consolidation worth doing alongside.** `ClientAttestationVerifier`
and `M8AssuranceVerifier` now duplicate JWKS fetching, SSRF guarding, pinned-key
handling and replay consumption. A device verifier would be a third copy. The
*machinery* should be unified into one pinned-key verifier core with per-profile
configuration, while the *claims* stay strictly distinct per (d). This reduces
the audit surface at the point where the most security-critical code is being
written three times.

## 9. Open questions for the reviewer

1. Is `deviceEpoch` asserted by M8 inside the assurance assertion, or projected
   into the PDS the way `policyEpoch` is? The assertion is simpler; the
   projection avoids an M8 availability dependency at check time. This memo
   leans to the assertion, because a device epoch is the identity holder's
   claim, not governance state — but it is a genuine trade.
2. Should enrollment be per card, or per label with cards inheriting? Per card
   is stricter and matches the derivation, but multiplies user-visible device
   lists.
3. What is the assurance level lattice, and who may define new levels? It must
   be ordered and closed, or "level" becomes an unbounded privilege escalation
   surface.
