# OD-7 — May the ballot identity sign its own registration?

Two specs disagree, an implementation picked a side without recording that it
was choosing, and the identity work is blocked behind the disagreement. This
document states both readings and what each costs. It does not decide.

**Status:** decided — **Reading A**. The ballot identity never signs. §5 is
answered in §5a from the vote path, and the answer imposes a hard requirement
on the vote proof that does not exist today. Still blocks the
`anonymous_identities` linkage fix (§6) until §5a lands.

---

## 1. The disagreement

`mubEZ/docs/IDENTITY_DERIVATION.md`, registration contract:

> The client registers **each identity** by sending only `identity_pub_i` and a
> signature over the registration challenge with `identity_priv_i` (proof of
> possession).

`OD-2-PROOF-OF-POSSESSION.md` §6.5, listed as *"the single most important review
point"*:

> **The ballot identity must never sign.** `getMatrixIdentity` already refuses to
> return anything signable for `civic`; the signing API must inherit the same
> allowlist rather than taking a raw scalar, or the boundary is bypassable one
> layer down.

`civic` is identity index 1, the ballot identity. The first says it registers
with a signature. The second says it never produces one.

## 2. What the code does today

`iM8/src/services/identitySignature.ts` implements OD-2's reading, globally:

```ts
export const SIG_PURPOSES = ['matrix-login', 'mubez-registration'] as const

export function signIdentityChallenge(seed, label, input, random?) {
  if (!isMatrixIdentityLabel(label)) {
    throw new MatrixIdentityForbiddenError(label)
  }
  ...
}
```

`isMatrixIdentityLabel` allows `['public', 'anonymous']`. So `civic` is refused,
and `identitySignature.test.ts:291` pins that refusal.

Three details make this worth reading closely rather than accepting:

1. **`mubez-registration` is a declared purpose that the ballot identity can
   never use.** The file declares exactly two purposes and then makes one of
   them unreachable for the identity whose registration is in dispute.
2. **The refusal is enforced by a Matrix allowlist.** `isMatrixIdentityLabel` is
   named, defined, and documented in terms of Matrix accounts.
3. **The error says so out loud.** A caller refused while signing a mubEZ
   registration challenge is told: *"identity `civic` must not have a Matrix
   account: only public and anonymous may authenticate to Matrix."* That message
   is true and irrelevant, which is the signature of a rule applied outside the
   scope it was written for.

None of this proves the code is wrong. It does show the choice was inherited
rather than made.

## 3. Reading A — the prohibition is total

*The ballot identity never signs anything. `IDENTITY_DERIVATION.md`'s "each
identity" is overbroad and should be narrowed to exclude `civic`.*

**What follows.** The ballot identity either registers with no proof of
possession, or does not register at all.

If it registers without proof, the server accepts a public key from whoever
sends it. Anyone who learns `identity_pub_civic` can register it first, and the
server cannot tell the holder from a bystander. Whether that matters depends
entirely on what registration is *for* — see §5.

If it does not register, then a ballot is authorised by something else
end-to-end: the eligibility proof and nullifier already present on
`com.para.civic.vote`. Under this reading the ballot identity is a **commitment,
not an account** — it is never presented, never authenticated, only proven
about. That is coherent, and `IDENTITY_DERIVATION.md` should say it plainly
instead of promising a signature.

**The case for it.** A key that never signs cannot be tricked into signing
something linkable. There is no purpose-confusion surface, no allowlist to get
wrong, no future endpoint that quietly accepts a ballot-key signature. The
boundary is structural rather than conditional, and conditional boundaries are
the ones that fail. This is also the Monero-shaped instinct the whole derivation
scheme is borrowed from: capability is separated by what a key *can do*, not by
what callers remember to check.

**The cost.** The registration contract in `IDENTITY_DERIVATION.md` has to be
rewritten, and the rewrite has to answer §5 — otherwise "the ballot identity
registers without proof" is a hole, not a decision.

## 4. Reading B — the prohibition is Matrix-scoped

*`civic` may sign a `mubez-registration` challenge and must never sign a
`matrix-login` one. The allowlist becomes purpose-aware.*

**What follows.** `signIdentityChallenge` takes the purpose into account:
`matrix-login` keeps the `['public', 'anonymous']` allowlist; `mubez-registration`
admits all three. The registration contract holds exactly as written.

**The case for it.** OD-2's own §1 sets out to serve both callers:

> This is not a Matrix-specific gap. `IDENTITY_DERIVATION.md` already promises it
> in the registration contract [...] **One scheme should serve both.**

Under the current implementation the scheme serves both for two identities and
neither for the third. §6.5's justification is also Matrix-shaped — its worry is
that the signing API sits *below* `getMatrixIdentity` and could bypass the Matrix
boundary. A purpose-aware allowlist that still refuses `matrix-login` for `civic`
satisfies that worry exactly.

Critically, **the defence Reading B needs already exists.** CD-7 requires:

> Purpose is inside the signed bytes. mubEZ registration and WatZappa's
> `para-idp` sign with the same key; a signature for one must be structurally
> unable to verify as the other.

So a `mubez-registration` signature cannot be replayed as a Matrix login. The
risk Reading B introduces is bounded by a mitigation the scheme was already
designed to carry.

**The cost.** The boundary stops being "this key cannot sign" and becomes "this
key cannot sign *for that purpose*". That is a weaker invariant, held by a
conditional that a future purpose could get wrong — a third `SigPurpose` added
without thinking about `civic` inherits the permissive branch unless the
allowlist is written as an explicit per-purpose map with no default.

## 5. The question that actually decides it

**What does registering the ballot identity buy?**

Both readings are coherent; they differ on whether proof of possession at
registration does any work for `civic`. That depends on a fact neither document
states:

- If a ballot is authorised solely by an eligibility proof and a nullifier, then
  the server never needs to know that anyone *holds* `identity_priv_civic`. The
  signature secures nothing, and Reading A is right by default — unnecessary
  signing is pure downside.
- If the server ever gates anything on "this ballot key is registered and its
  holder proved it", then Reading A leaves that gate open to whoever learns the
  public key, and Reading B is required.

This should be settled from the vote path, not from either spec. Until it is,
choosing between A and B is choosing between two plausible stories about a
mechanism that has not been pinned down.

## 5a. Answer, and what Reading A costs

**Decision: A.** The ballot identity never signs anything.

Answering §5 from the vote path settles it: nothing in the vote flow gates on
"the holder of this ballot key proved possession". A signature at registration
would secure nothing, so under §5's own test Reading A wins by default.

**What the vote path actually does today.** One person, one vote *is* enforced,
and it is worth being exact about how, because the mechanism is not the one the
lexicon description implies:

```ts
computeVoteNullifier(personId, subjectType, subjectUri)
  = sha256('m8:civic-vote-nullifier:v1' ‖ personId ‖ subjectType ‖ subjectUri)
```

The nullifier is anchored to a stable `person.id`, and
`UNIQUE (person_id, subject_type, subject_uri)` makes a second vote on the same
subject return the first nullifier instead of minting a new one. That is a
genuine one-person-one-vote guarantee, and it is the property this whole
three-identity scheme exists to protect.

It is not, however, private. The nullifier is computed **by the server, from an
identifier the server already holds**, and `civic_vote_nullifiers` stores
`person_id`, `session_id` and `alias_did` in the same row as `vote_nullifier`
and `subject_uri`. The server can reconstruct every subject a person has voted
on, by name. `com.para.civic.vote` calls this field a "privacy-preserving
one-person-one-vote nullifier"; it delivers the second half of that phrase and
not the first.

The consequence for this decision is sharp: **the ballot identity currently does
no work in the vote path at all.** Authorisation runs on `person.id`, server
side. `identity_pub_civic` is never presented, never checked, never needed. So
Reading A is not merely defensible today - it describes what is already true.
The question is what has to become true for the privacy half to hold, and that
is where registration re-enters.

**What registration is for under Reading A.** Moving the nullifier client-side -
so the server verifies a proof instead of computing the answer - requires the
nullifier secret to be anchored in something unique per person and unforgeable.
Derivation alone cannot supply that: a seed is user-chosen, and a second seed
yields a second ballot identity and a second vote. The anchor has to be the
issued credential, which is where `curp_hash` (CD-1) already establishes human
uniqueness.

So registration's job is **binding exactly one ballot identity per credential**.
And - this is what keeps Reading A intact - that binding does not require the
ballot key to sign. It requires a proof that *this ballot public key was derived
from a seed held by the holder of credential C, and no other ballot key is bound
to C*. A zero-knowledge binding proof discharges that; a signature is merely one
way to do it, and the more linkable one. Reading A survives its own critical
requirement.

**But the vote path as built cannot carry Reading A**, and the reason is
intensity. `M8CivicVoteProof` commits to:

```ts
{ subjectUri, subjectType, aliasDid, voteNullifier, eligibilityProofRef }
```

It binds *that* an eligible person voted on a subject. It binds nothing about
*how*. `issueParaVoteProof` is called with `{subjectUri, subjectType}` only - the
signal is never an input.

With a signature, content integrity comes free: the signed bytes cover the
ballot. Reading A removes the signature, so the binding has to come from
somewhere, and today it comes from nowhere. Three consequences follow, all
specific to intensity voting:

**1. The vote content must be bound to the proof - as a commitment, not as a
public input.** The binding requirement is real: today a ballot in the voter's
own repo can be rewritten to any intensity while its nullifier still verifies,
and `com.para.community.vote` records are written to the voter's own repo
(`qvl.ts:287`), so rewriting is a `putRecord`, not an attack.

But binding must not be achieved by publishing the value. An earlier draft of
this section proposed making `signal` a public input to the proof,
Semaphore-style. **That is wrong here**, and §5b says why: a published intensity
is not fungible, and this system has liquid democracy. The correct construction
is a Pedersen commitment `C = signal·G + r·H` bound into the proof, with the
tally computed homomorphically over commitments and opened only in aggregate.

**2. The range must be proven in zero knowledge, not asserted.** `signal` is
documented as -3..+3. A client that submits 100 is refused only if the circuit
constrains the range - and under a commitment the constraint has to be a range
proof, since there is no plaintext to check. An intensity ballot without one is
a ballot with unbounded weight.

**3. The quadratic budget is a cross-ballot constraint, and a per-subject
nullifier cannot express it.** Quadratic voting spends `signal²` credits, so a
budget spans every vote in an election while each nullifier covers exactly one
subject. Three ways out, in preference order:

- A running spend commitment the voter advances with each ballot, proven
  consistent with the previous one. Keeps everything client-side; most work.
- A credit-nullifier set - one nullifier per credit unit spent - so
  overspending double-spends a nullifier and is caught by the existing check.
- Server-side accumulation against the ballot identity. **This is acceptable
  here**, which is worth stating because it looks like it should not be: the
  ballot identity is deliberately stable across an election, since that is what
  makes one-person-one-vote enforceable. Accumulating spend against it therefore
  reveals nothing that the nullifier set does not already reveal - *provided*
  the ballot identity is unlinked from the account, which is exactly what §6
  is about.

**4. `aliasDid` has to go.** `issueParaVoteProof` sends
`aliasDid: agent.session.did` to the proof issuer. Even with every point above
fixed, the issuer observes account ↔ ballot directly. This is the same defect as
the `session_id` foreign key in §6, one layer up, and it is not fixed by fixing
the table.

## 5b. Liquid democracy makes this a transaction problem

The three consequences above are necessary but not sufficient, because PARA does
not only collect ballots - it lets people delegate them. `com.para.civic.vote`
carries `isDirect` and `delegatedFrom`; `com.para.community.intensity` adds
`delegationDepth` and `effectiveWeight`; `com.para.civic.delegation` records
`delegateTo` with `party` and `scopeFlairs`.

Once weight can move between people, a vote stops behaving like a signed
statement and starts behaving like a coin:

| Monero | PARA ballot |
|---|---|
| key image | vote nullifier - stops the same weight being spent twice |
| ring signature (CLSAG) | hides *which* delegation a delegate is exercising |
| stealth address | delegator and delegate unlinkable to observers |
| Pedersen commitment + range proof | hides intensity while proving -3..+3 |
| balance proof (Σ in = Σ out) | delegated weight neither created nor destroyed |
| fungibility | every unit of weight indistinguishable from every other |

This is not an analogy reached for after the fact. **CD-2 already committed to
it**, and gave it as the reason for the curve:

> One curve serves derivation, the planned CLSAG-style ring signatures, and
> Pedersen commitments for blind delegation.

ristretto255 was chosen because ring signatures and Pedersen commitments need a
prime-order group. The ballot design has to actually use what the curve was
selected for.

**Why fungibility is the load-bearing word.** If a delegated vote is
distinguishable from a direct one, or a delegate's weight is traceable back to
the people who granted it, three things follow, and all three are worse than the
single-ballot privacy problem:

1. **Delegators become coercible.** "I can see you gave your vote to X" is a
   stronger lever than "I can see how you voted on one motion", because
   delegation is standing and general rather than issue-by-issue.
2. **Weight becomes tainted.** A delegate visibly carrying weight from an
   unpopular bloc is identifiable as such, and the weight they carry is treated
   differently from anyone else's. That is precisely the property Monero's
   fungibility work exists to prevent.
3. **The delegation graph is more re-identifying than the ballots.** Who you
   trust with your vote predicts your politics more reliably than any single
   -3..+3 signal, and `delegatedFrom` publishes it directly today, in the
   voter's own public repo, alongside `party`.

**What this adds to the requirement list.**

- Delegation must be exercised through a ring over the eligible delegator set,
  not by naming `delegatedFrom`.
- The delegation link needs one-time addressing so that granting a delegation
  and exercising it are unlinkable to an observer.
- Aggregation must be provable without opening the parts: a delegate proves
  `effectiveWeight` is the correct sum of the commitments they hold, without
  revealing which they are or what each contains.
- **Quadratic voting is the hard case, and should be scheduled as such.** Cost is
  `signal²`. Under commitments that is a *multiplication* constraint, not a
  range constraint - materially harder than the rest, and it interacts with
  delegation because the budget spans an election while each nullifier covers
  one subject (§5a.3). If something has to ship in stages, this is the piece to
  isolate: a linear-weight ballot with commitments and rings is achievable well
  before a quadratic one.

**Honest scope.** CLSAG, one-time addressing, range proofs and a multiplication
proof is a large amount of cryptographic engineering, and OD-2 §6.1 already
records that we own transpositions of this kind even where we do not own the
design. Nothing above argues for building it all before anything ships. It
argues that the ballot format must not be frozen in a shape that forecloses it -
and publishing `signal` as a public input would do exactly that, which is why
§5a.1 has been corrected.

## 6. Why this is on the critical path

The `anonymous_identities` table joins every identity to the session that
created it:

```sql
session_id TEXT NOT NULL,
FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
```

`IDENTITY_DERIVATION.md` forbids exactly this, naming the case: *"No table may
relate two identity public keys, or an identity key to a seed, view key, or
another identity's session."* Removing it means replacing session scoping with
per-request proof of possession — 28 call sites in
`mubEZ/app/controllers/anonymous_controller.ts`.

That replacement cannot be specified until it is known whether `civic`
participates in it. Hence: this decision first.

## 7. Definition of done

- [x] §5 answered from the vote path, in writing (§5a).
- [x] Reading chosen: **A**.
- [ ] Recorded as a CD in `mubEZ/docs/CRYPTO_DECISIONS.md`, superseding
      `IDENTITY_DERIVATION.md`'s registration contract by name.
- [ ] `IDENTITY_DERIVATION.md` registration contract rewritten: the ballot
      identity registers **without** proof of possession, and the ballot proof -
      not a signature - is what authorises a vote.
- [ ] `M8CivicVoteProof` extended so `signal` and `creditsSpent` are public
      inputs to the proof, not fields beside it (§5a.1).
- [ ] `signal` carried as a Pedersen commitment with a range proof, not as a
      public input; tally homomorphic, opened only in aggregate (§5a.1, §5a.2).
- [ ] Delegation exercised through a ring over the eligible delegator set;
      `delegatedFrom` removed from the public record (§5b).
- [ ] Staging decision recorded: linear-weight ballots with commitments and
      rings first, quadratic (the `signal²` multiplication proof) isolated
      behind it (§5b).
- [ ] Quadratic budget mechanism chosen from §5a.3 and recorded.
- [ ] Nullifier derivation moved client-side and anchored to the issued
      credential rather than `person.id`, with the server verifying a proof
      instead of computing the value.
- [ ] Registration binds one ballot identity per credential, by binding proof
      rather than by signature - the mechanism that lets Reading A hold.
- [ ] `civic_vote_nullifiers` stops storing `person_id`, `session_id` and
      `alias_did` beside `vote_nullifier`. Until it does, the nullifier is an
      integrity mechanism only, and `com.para.civic.vote`'s field description
      should say so rather than claiming privacy it does not provide.
- [ ] `aliasDid` removed from `issueParaVoteProof` (§5a.4).
- [ ] `identitySignature.test.ts:291` re-documented: it currently pins the
      refusal without recording which reading it encodes. Under A it is correct
      and should say so, so a later reader does not read it as incidental.
- [ ] `SIG_PURPOSES` keeps `mubez-registration` only if a non-ballot identity
      still uses it; otherwise the refusal message stops being misleading only
      because nothing reaches it.
