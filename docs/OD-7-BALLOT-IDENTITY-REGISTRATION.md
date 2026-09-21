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

## 5c. The freeze, and what enforces it

`com.para.community.vote` and `com.para.community.intensity` were marked
DEPRECATED - _Do not write this record_ - in their lexicons on 2026-09-18, and
`useCastVoteMutation` / `useCastIntensityMutation` were deleted from the PARA
client. That left the freeze as a description of intent. It was not a control:
a `com.para.community.vote` carrying `voter` and `signal` was accepted by the
PDS straight into the author's repo, signed by their DID and sequenced to the
firehose, where it cannot be unpublished. By this project's own standard - a
privacy claim the code does not enforce is worse than none - the description was
the gap, not the fix.

**The rule is now code, in one place.** `ballotWriteRefusal` in
`@atproto/common` (`packages/common/src/para-ballot-freeze.ts`) is the single
definition - the frozen collections above, plus the narrowing of
`com.para.civic.vote` in §5d - consumed at two layers:

| Layer | Where                                                   | Effect                                                                                                                                                                                   |
| ----- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Write | `packages/pds/src/repo/prepare.ts`                      | `prepareWrite` refuses the record, which covers `createRecord`, `putRecord`, `applyWrites` and every `com.para.*` PDS endpoint - they all route through `prepareCreate`/`prepareUpdate`. |
| Index | `packages/bsky/src/data-plane/server/indexing/index.ts` | `indexRecord` drops creates and updates the same rule refuses, so a ballot written by _any_ PDS is not aggregated into a queryable who-voted-what table by our AppView.                  |

The write check is deliberately ahead of, and independent of, record validation:
`validate: false` waives schema checking, not the ballot policy.
`packages/pds/tests/ballot-freeze.test.ts` pins that, pins that deletes are
still accepted, and pins the string literals against the generated lexicons so a
rename cannot silently thaw one.

**What is deliberately not frozen, and why.**

1. **Deletes, at both layers.** A freeze that stopped people removing ballots
   they already published would invert the decision it implements.
2. **Sequencer recovery.** `prepareCreate`/`prepareUpdate` take a `replay` flag,
   set only by `scripts/sequencer-recovery`, which re-emits commits that were
   already made. Dropping one there would diverge the recovered repo from its
   commit. The flag is not reachable over XRPC.
3. **`com.atproto.repo.importRepo`.** The imported CAR _is_ the MST, so a frozen
   record inside it is already part of the repo being imported; refusing at the
   record level would not remove it, and refusing the whole import would make an
   account holding a pre-freeze ballot permanently unmigratable. This is a
   known hole: a crafted CAR can place a new frozen record in a repo. Closing it
   means deciding what import should do with pre-freeze history, which is a
   separate decision from this one.
4. **The Matrix bridge's own vote store.** `services/matrix-bridge` subscribes
   to `com.para.community.vote` on the firehose and writes `(proposalUri,
voterDid, choice)` rows through `ProposalService.onVoteCast`, in the service
   that also holds the Matrix identities. Nothing here changes that. With the
   PDS refusing the writes the handler stops firing for our own repos, but a
   record from any other PDS still lands in that table, and the rows already
   there are unaffected. Removing the ingestion would also remove the vote
   tallies the bridge renders, so it is a product decision rather than a
   cleanup.
5. **`com.para.civic.vote`, which is the ballot people actually cast.** The
   freeze covers the two lexicons that had no callers. The one with a live write
   path is this: `CabildeoDetailScreen` → `useVoteMutation` → `castCabildeoVote`
   → `com.para.civic.castVote`
   (`packages/pds/src/api/com/para/civic/castVote.ts`), which writes
   `com.para.civic.vote` into the voter's own repo on every cabildeo vote. It has
   no `voter` field and does not need one - the repo is the identity, so the
   ballot is attributable to its author exactly as §5a describes, and it is
   rewritable by `putRecord` on the same terms. **Decided 2026-09-20: for a
   cabildeo vote, that is accepted.** See §5d.

## 5d. Decision: cabildeo ballots are public, and only cabildeo ballots

**Decided 2026-09-20.** A cabildeo ballot may stay public and attributable. The
subject is a named local assembly with a fixed option list, the ballot is closer
to a show of hands than to a secret ballot, and blocking it would take cabildeo
voting offline for the pilot with nothing to replace it.

The decision is conditional - _while the vote is only a cabildeo vote_ - so the
condition is enforced rather than assumed. `com.para.civic.vote` is not frozen,
but it is narrowed: a write is refused unless `subjectType` is `"cabildeo"` and
`selectedOption` is an integer, and refused outright if it carries `signal` or a
non-empty `delegatedFrom`. The AppView applies the same rule before indexing, so
a ballot from a foreign PDS cannot fill `para_policy_vote` either.

**Why those two fields specifically.** They are how this record turns into the
thing §5b rules out. `signal` publishes a -3..+3 position on a policy in the
voter's own repo; `delegatedFrom` publishes the delegation graph, which §5b
names as more re-identifying than the ballots themselves. Both were already
reachable: `com.para.civic.vote` declares them, and the AppView's
`cabildeo-vote` indexer has a `subjectType === 'policy'` branch writing
`para_policy_vote` - a signal-and-delegation table with a `getPolicyTally`
endpoint over it. Nothing writes one today, which is exactly why the gate is
cheap now: it costs nothing to close, and it forces the decision to be retaken
the day policy voting ships rather than inherited by silence.

**What this obliges, and does not.** The publicness is now stated in the lexicon
description rather than implied by the data model, and the PDS enforces what the
description claims. It is _not_ yet stated in the product: `CabildeoDetailScreen`
does not tell a voter that their ballot is published under their DID,
permanently, before they cast it. Under this project's own standard that is the
remaining half of this decision, and it belongs in the PARA client, not here.

## 5e. Quadratic voting is an experiment, gated and off

**Decided 2026-09-20.** QV-LD is not retired and not canonical: it becomes a
feature in development behind the GrowthBook gate
`para:quadratic_voting:enable`, off by default.

What it is, stated plainly, because it is easy to mistake for a product
surface: a **shadow tally**. `getParaTallySimulation` computes the same proposal
three ways - flat, √n (weight = `√credits`, grouped per voter), and
correlation-adjusted - plus concentration metrics, and returns
`shadowMode: true`. `getParaAuditTrail` returns the raw ballots and every
intermediate step so a third party can recompute the result. Its purpose was to
choose a voting system on evidence rather than on argument.

**Its current state, verified rather than assumed:**

- Both inputs - `com.para.community.vote` and `com.para.community.intensity` -
  are frozen (§5c), so its two tables can only ever hold pre-freeze rows.
- `para_qvld_eigenstate_snapshot` has **no writer anywhere in the codebase**. It
  is created by a migration and read by both tally routes. With it empty the
  correlation factor is always 1, so the correlation-adjusted tally has always
  returned a copy of the flat one. That third system was never implemented.
- No PARA screen imports anything from `state/queries/qvl.ts` - not the
  queries, not the mutations. The stack is disconnected at both ends.

**The gate.** The four endpoints that read the experiment's tables -
`listVotes`, `listIntensities`, `getTallySimulation`, `getAuditTrail` - call
`assertQuadraticVotingEnabled` before touching the data plane. `checkGate`
returns false whenever GrowthBook is unconfigured or not yet ready, so the
experiment is off by default. Even with the flag enabled, the endpoints now
refuse with `BallotPrivacyUnavailable`: historical identified ballots and
live aggregate differences require a private publication path before reads
can reopen. `quadratic-voting-gate.test.ts` pins both flag states and all four
routes. Frozen inputs do not remove historical rows. The read refusal is an
operational privacy safeguard, not a claim that previously published data can
be erased or made anonymous.

**The `qvl` prefix does not mean what it says, and this matters for the split.**
`paraQvl*` / `para_qvld_*` names span three different things:

| Naming                                                                                    | What it actually is          | Status                                                                                                 |
| ----------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| `para_qvld_vote`, `para_qvld_intensity`, `para_qvld_eigenstate_snapshot`                  | the shadow tally experiment  | frozen inputs, gated, no readers                                                                       |
| `para_qvld_delegation`, `para_qvld_deliberation_statement`, `para_qvld_deliberation_vote` | liquid delegation and debate | still writable; debate is _meant_ to be attributable, so it is deliberately not frozen and not gated   |
| `para_qvld_civic_tree_statement`, `para_qvld_civic_tree_vote`                             | the civic tree               | **live** - PARA calls `com.para.community.civicTree.castCardVote`/`getCardVote` from the civic tree UI |

So a future extraction has to be scoped by function, not by prefix: moving
everything named `qvl` would take a shipped feature with it.

**On making it a parallel service.** The gate is step one. Step two - its own
package, and eventually its own deployable with its own schema and firehose
consumer - buys operational isolation, which is worth having only once there is
a ballot to feed it. Building a service now would mean deploying something that
consumes nothing, and the tally it would run (plain sums over published signals)
does not survive the replacement ballot anyway: §5a/§5b puts `signal` in a
Pedersen commitment with a homomorphic tally opened only in aggregate, so
per-voter signals - which both the √n weighting and the audit trail are built
on - stop existing. The parts that survive that change of model are the two
aggregate formulas: the `√credits` weighting and the HHI concentration metric.

## 5f. Where the intensity control writes

The client already has the control this whole design implies: `VotingButton`
produces -3..+3, the exact range of `signal`. Its value had nowhere to go.
`PostFeedItem` passes it to `updatePostShadow` with a literal
`'optimistic-vote-uri'` and no mutation behind it; `RAQAssessment` writes it to
device storage. Both ballot lexicons are frozen, `com.para.civic.vote` refuses
`signal` (§5d), and `com.para.community.deliberationVote` had only a
three-state `direction`. So the control existed and discarded what people told
it.

**Decided 2026-09-20, reversed 2026-09-21: deliberation stays unweighted.** The
magnitude was briefly put on the deliberation vote, on the reasoning that debate
is attributable on purpose so a magnitude there publishes nothing new. That was
built and then taken back out: **a position on an argument is for or against,
with no magnitude, so nobody can press harder on an argument than anybody else.**

The reversal is worth recording rather than quietly undoing, because the
reasoning that argued *for* weighting was sound as far as it went — it stayed
inside the freeze, published nothing extra, and gave the control a home. What it
did not weigh is that intensity in a debate is not the same instrument as
intensity in a ballot: on a ballot a quadratic price rations it, while on an
argument it would be free, so the loudest position wins by repetition of effort
rather than by persuasion. A debate that can be out-shouted is worse than one
counted by heads.

So `deliberationVote` carries `direction` and nothing else, the view serves
counts and the requesting viewer's own side, and the client offers the same
three plain choices it always did.

**Deliberation turned out to be unbuilt server-side**, which is worth recording
because §5e called it "still writable" on the strength of a client mutation:
neither record had a lexicon, neither had a table or an indexer, and
`listDeliberations` returned `statements: []` from a stub. Records were being
written into repos and going nowhere. Both lexicons are now defined,
`para_deliberation_statement` and `para_deliberation_vote` index them, and
`packages/bsky/tests/deliberation-indexing.test.ts` pins the split, the
defaulting, `pass` having no magnitude, and re-weighing replacing rather than
accumulating.

**Not named `qvl`**, deliberately: §5e's table says that prefix already spans
three unrelated things, and deliberation is not the quadratic experiment.

**The read is served.** `GetParaDeliberations` on the data plane counts the
positions per argument and attaches the requesting viewer's own - and only
theirs, since who else took which side is not part of the view. `listDeliberations` returns statements instead of the empty array its stub
used to return. Both indexers drop a record whose `author`/`voter` does not
match the repo it arrived from, since a remote repository may name anyone.

`ProposalDetailScreen`'s deliberation tab now reads that query instead of
`MOCK_DELIBERATIONS`, and its three pills write through it.

**So the -3..+3 control still has nowhere to write.** Both ballot lexicons are
frozen, `com.para.civic.vote` refuses `signal`, and deliberation is unweighted
by the decision above. `VotingButton` remains wired into the feed and RAQ, where
neither call site persists what it produces. That is the state, not a plan.

## 5g. Decision: the civic identity is pseudonymous, and m8 holds no legal identity

**Decided 2026-09-21.** Votes are attributable to a person's civic pseudonym
and to nothing else. Browsing that pseudonym and seeing how it voted on other
subjects is **accepted** - the accumulation of a voting history under one
pseudonym is not treated as a leak. What must never be reachable is the legal
identity behind it: the real name, the CURP, the INE or any other document.

This is a smaller claim than §5a/§5b were reaching for, and it is deliberately
smaller. It also turns out to be close to what is already built.

### What m8 stores today, verified

`mubEZ/src/db/schema.sql` has no column holding a name, a CURP or a document.
The tables are sessions, claim requests, grants, proof artifacts, identity
requests, `person_roots`, `person_aliases` and `civic_vote_nullifiers`.
`person_roots` is `id`, `session_id`, `status` and timestamps - nothing else.
`curp_hash` is not a column at all: it is a **claim** an issuer may attest,
listed beside `age_over_18`, `citizenship` and `district_hash` in
`src/types/index.ts` and in `identityWallet.ts`'s `allowedElements`.

So m8 stores no legal identity. **But it does not follow that the person root
is unlinkable to one, and on 2026-09-21 it is not.** Reading the code that
writes those tables rather than the tables themselves: `issueCivicVoteProof`
keys the person root by `session_id` and then calls `ensureSessionAlias`, which
writes the session's own **account DID** - identity index 0, the public-facing
one with a handle and a profile - into `person_aliases`. A civic pseudonym
linked afterwards shares `person_id` with it, and `listActiveAliasDids` hands
the whole set back to the caller.

One join therefore reaches from a vote to a public profile, which is where a
person may have put their real name. mubEZ **CD-12** resolves this: the
no-linkage rule in `IDENTITY_DERIVATION.md` stands, `person_aliases` is the
defect, and four changes make the invariant true - none of them needing new
cryptography, since per-request proof of possession is already decided as CD-10.
Until they land, the property described in this section is the target and not
the current state.

### The invariant

> **`person_roots.id` must never become linkable to a legal identity.**

Everything else in this decision follows from it, and it is stated as one line
on purpose: it can be written down, tested, and watched in review.

### 1. Verification produces claims, never rows

The invariant breaks on one specific day: when `mubEZ/src/services/ineSimulation.ts`
stops being a simulation. That is the moment something wants to persist a name,
a CURP or a photograph of a document, and if any of it lands beside `person_id`
the model collapses at once rather than gradually.

The rule, fixed now rather than after the integration: **an identity check
yields claims and discards its inputs.** No raw credential is written to any
table, log, queue or object store, not even transiently "pending review". The
claim ids the design already declares are the whole permitted output.

**`curp_hash` is already peppered, and that is load-bearing here.** A CURP is
derived from name, birth date, sex and state - all guessable - so a bare hash of
one is enumerable offline, which would make the invariant false the moment the
database leaked. mubEZ decided and built this before us: CD-1 specifies
`HMAC-SHA256(pepper, domain ‖ normalized_input)` with a server-held secret, and
`src/services/curpHash.ts` implements it, key id embedded so the pepper can
rotate. Nothing to do; recorded because this decision rests on it.

### 2. `civic` keeps its own key; it does not merge with `anonymous`

The intent behind "the civic identity should be anonymous by default" is granted
in full, but not by collapsing the two derived keys into one.
`OD-2-PROOF-OF-POSSESSION.md` §6.5 calls *"the ballot identity must never sign"*
the single most important review point, and `isMatrixIdentityLabel` enforces it
by allowing only `public` and `anonymous`. Merging would make the key that votes
the same key that authenticates to Matrix, and the chat server would then hold
it. That is a different leak, to a different party, and it is one the layer
boundary forbids absolutely.

**Instead: `civic` owns the pseudonymous profile people browse.** One persona
for the user; two keys underneath, and the one that votes still authenticates
nowhere. "Anonymous by default" becomes a property of the civic identity rather
than a merge of key material. What changes is which identity owns the visible
profile - not the derivation.

### 3. Selective disclosure is where the pseudonym actually erodes

The votes are not what identifies someone under this model; the profile is.
Barrio plus party plus an age range is usually enough to name a person in a
community of a few hundred, and each attribute looks harmless on its own.

This is the one part left open, and it is bounded: **which profile attributes
may be shown together.** It wants a rule of the same shape as the aggregate
floor - a combination that narrows below a threshold is refused at the point of
publication, not left to the person to reason about. Deciding it is R&D, not a
sitting.

### What this takes off the near-term critical path

If a browsable pseudonymous history is accepted, then Pedersen commitments,
range proofs and CLSAG rings are not required to ship civic voting. §5b becomes
a 2027 deliverable in earnest rather than a blocker. The work that replaces it
is data minimisation - smaller, cheaper, and far easier to audit, which is the
right trade for a pilot.

**It also softens §5d.** A cabildeo ballot being "public and attributable" means
attributable to the civic pseudonym, not to a legal name. The notice the client
shows before casting already says *your public identity* rather than *your
name*; once this lands, that wording should be checked again deliberately rather
than by luck.

**Recorded as a decision in mubEZ.** This section states the reasoning; the
enforceable form lives where the schema does, as **CD-11** in
`mubEZ/docs/CRYPTO_DECISIONS.md`. Whoever replaces `ineSimulation.ts` will be
working in that repo and has no reason to read this one.

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
- [x] Recorded as a CD in `mubEZ/docs/CRYPTO_DECISIONS.md`, superseding
      `IDENTITY_DERIVATION.md`'s registration contract by name — **CD-9**
      (2026-09-18). CD-9 records the general registration contract (public key +
      PoP, stored standalone, no session linkage) and explicitly excludes the
      ballot identity per Reading A; the ballot-specific binding-proof mechanism
      below stays open.
- [x] The ballot freeze enforced rather than described: `FROZEN_BALLOT_COLLECTIONS`
      refused at PDS write and at AppView indexing, with deletes and sequencer
      replay exempt (§5c).
- [x] `com.para.civic.vote` decided (2026-09-20): cabildeo ballots stay public,
      and `com.para.civic.vote` is narrowed to cabildeo ballots so the condition
      is enforced rather than assumed (§5d).
- [ ] `CabildeoDetailScreen` tells the voter, before they cast, that the ballot
      is published under their DID permanently (§5d).
- [x] Quadratic voting reclassified as a gated experiment rather than canonical
      product surface, behind `para:quadratic_voting:enable` (§5e).
- [ ] QV-LD extracted to its own package, scoped by function rather than by the
      `qvl` prefix - deferred until there is a ballot to feed it (§5e).
- [x] Deliberation given a schema, an index and a served read, and decided
      unweighted: positions are counted, never weighed (§5f).
- [ ] The -3..+3 control still writes nowhere. Either give it a destination or
      retire it from the feed and RAQ, where it currently discards what people
      tell it (§5f).
- [x] Privacy target set: votes bind to the civic pseudonym, and m8 holds no
      legal identity to join them to (§5g).
- [ ] `person_roots.id` unlinkability written as an enforced invariant, with a
      test, before the real INE integration replaces `ineSimulation.ts` (§5g.1).
- [x] `curp_hash` peppered against offline enumeration - already decided and
      built as mubEZ CD-1 (§5g.1).
- [x] The apparent conflict with `IDENTITY_DERIVATION.md` resolved: the rule
      stands, `person_aliases` is the defect (mubEZ CD-12).
- [x] `ensureSessionAlias` deleted, `session_id`/`alias_did` dropped from
      `civic_vote_nullifiers` and `person_aliases`, and the client stopped
      sending `agent.session.did` - §5a.4 closed (mubEZ migration 034).
- [x] One person, one vote made true: person roots are filed under
      `HMAC(pepper, 'person-root' ‖ curp_hash)` rather than the session, which a
      second session could mint afresh (mubEZ migration 035). It did not hold
      before this.
- [ ] The last hop: the person is still discoverable from the session through
      `proof_artifacts.session_id`. Needs CD-10's per-request proof of
      possession on the vote path (§6).
- [ ] The civic identity given the pseudonymous profile, without merging its key
      into `anonymous` (§5g.2).
- [ ] Rule chosen for which profile attributes may be shown together (§5g.3).
- [ ] `com.atproto.repo.importRepo` decided: what an import should do with a
      frozen record in incoming history (§5c.3).
- [ ] `IDENTITY_DERIVATION.md` registration contract rewritten: the ballot
      identity registers **without** proof of possession, and the ballot proof -
      not a signature - is what authorises a vote.
- [ ] `M8CivicVoteProof` binds commitments to ballot content and credit spend
      without exposing the underlying signal or budget (§5a.1).
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
