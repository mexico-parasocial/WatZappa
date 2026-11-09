# OD-9 — Blind-token ballots: m8 knows who may vote, the box knows what

OD-8 concluded that spaces move a ballot from public to operator-only, and no
further. This document proposes the step that does go further without the full
encrypted-ballot build: split eligibility from the ballot, so that no single
service sees both the person and the choice. It also settles how a voter
changes their vote, and how the client avoids emitting the values a person
passes through on the way to the one they mean.

**Status:** proposed, 2026-11-03. Nothing here is implemented. It does not
replace public cabildeo and policy ballots (OD-7 §5d); it is the path for a
vote a community marks _secret_, which OD-8 §7 left out of scope.

---

## 1. What is wrong today, in one paragraph

A policy ballot is a public `com.para.civic.vote` in the voter's repo, on the
firehose, attributable to the casting DID. Before it is written, m8 sees the
session, resolves the person, and MACs `actorDid ‖ subject ‖ signal ‖ nullifier`
(`mubEZ/src/services/civicVoteIdentityService.ts`, `policyProofMac`). So m8
holds person → choice at issuance even though it stores only
`(person_id, subject)`, and the verifier sees `actorDid ‖ choice` on every
check. The MAC is symmetric: whoever holds `proofSecret` can mint a valid
ballot for anyone, and nobody but m8 can check one. Spaces would not change
any of this (OD-8 §4.1).

## 2. The proposal

Three roles, two of which must not be the same operator for the privacy claim
to hold:

| Role             | Knows                                        | Must not know         |
| ---------------- | -------------------------------------------- | --------------------- |
| **m8 (issuer)**  | that a person received a token for a subject | the token, the choice |
| **Box (tally)**  | each token's current choice                  | which person holds it |
| **Voter client** | its token, its recast key, its choice        | -                     |

### 2a. Issuance

1. The client generates a fresh random **token serial** `s` and a **recast key
   pair** `(rk, RK)` for this subject (§3).
2. It blinds `m = H('para:ballot-token:v1' ‖ subjectUri ‖ s ‖ RK)` and sends the
   blinded message to m8 with its session.
3. m8 checks eligibility exactly as now, and the existing
   `UNIQUE (person_id, subject_type, subject_uri)` row is the one-per-person
   guard: a second request for the same subject is refused, not re-issued.
   m8 blind-signs and returns. It never sees `s`, `RK` or the choice.
4. The client unblinds to a signature `σ` on `m`.

**Scheme: RSA blind signatures, RFC 9474** (the publicly verifiable Privacy
Pass issuance, RFC 9578 type 2). The box verifies with m8's public key alone,
so it holds no secret that could mint tokens. A VOPRF (RFC 9497) is privately
verifiable and would put the minting key in the box; blind Schnorr on
ristretto255 is attractive for the curve but has concurrent-session (ROS)
attacks unless carefully restricted. Recommend RFC 9474 and one m8 key per
election, published before the vote opens.

**When to issue.** Not when the person votes. If m8 issues at vote time, the
issuance timestamp and the box's submission timestamp line up and a colluding
or careless pair of operators can join them. Issue for every open secret
subject when the person becomes eligible or opens the community, in batches,
whether or not they will vote. m8 then learns eligibility, not turnout.

### 2b. Casting

The client sends to the box, over a transport that does not identify it (§5):

```
{ subjectUri, s, RK, σ, signal, seq: 0, recastSig }
```

`recastSig` is a signature by `rk` over `subjectUri ‖ s ‖ signal ‖ seq`. The box
checks `σ` against m8's election key, checks `recastSig` against `RK`, and
stores `s → (RK, signal, seq)`. A second `s` it has seen is a recast (§3), never
a second ballot.

### 2c. Tally and publication

- While the vote is open the box publishes nothing per ballot. No live counts:
  that is the differencing leak `BallotPrivacyUnavailable` already guards.
- At close it publishes the aggregate, subject to the floor (OD-7 §5g.3, still
  unspecified), and the **ballot list**: `(H(s), signal)` for every final
  ballot, plus the number of tokens m8 says it issued for the subject.
- A voter checks that `H(s)` is present with their choice. Anyone checks that
  ballots ≤ tokens issued and recomputes the aggregate from the list.

Publishing the list is what turns "trust the box" into "the box can be caught
dropping or altering a ballot". It reveals the distribution of choices, which
the aggregate already does; under the floor it is withheld with the aggregate.

## 3. Changing your vote

**Yes, and until close.** A recast is the same token with a higher `seq`:

```
{ subjectUri, s, signal', seq: n+1, recastSig' }   // signed by rk
```

The box keeps the highest `seq` per `s`. It does not need `σ` again and learns
nothing new about the person. The count always reads the latest value, so
changing your vote never adds weight.

**Why a recast key and not a new token.** m8 issues one token per person per
subject; that is what makes one-person-one-vote hold. Re-issuing on request
would give a second token, which is a second ballot. So the authority to
change a ballot has to travel with the first token, and `RK` inside the signed
message is how it does.

**Losing the device.** Derive `rk` deterministically so it is recoverable:
`rk = KDF(ballot_seed, 'para:recast:v1' ‖ subjectUri)`, with `s` derived the
same way. A restored seed recovers the ability to recast without m8's help.

- This touches OD-7 Reading A ("the ballot identity never signs"). `rk` is not
  the `civic` identity key and signs nothing that authenticates a person; it is
  a per-subject key unlinkable to `identity_pub_civic`. It needs an explicit
  sign-off against OD-2 §6.5 before it is built, and its derivation label must
  be outside the allowlist that `isMatrixIdentityLabel` guards.
- The seed must be the one the person already keeps (iM8), not a new secret to
  back up.

**When recasting stops.** At the subject's close. Cabildeo ballots already stop
being indexed after the deadline (`cabildeo-vote.ts`, `closePolicy.deadline` /
`phaseDeadline`); a secret subject needs the same, enforced by the box. I did
not find an equivalent close for public policy ballots.

**What recasting buys and what it does not.** Someone who watched you vote
cannot tell whether you changed it afterwards, which is the useful kind of
coercion resistance. Someone who holds your unlocked phone can recast for you;
that is not defended.

## 4. Not emitting while the person is still adjusting

The -3..+3 control is stepped, so reaching +3 passes through +1 and +2. Only
the value the person stops at should ever leave the device.

### 4a. What the client does today, verified by reading (not run)

- `PolicyBallotControl` debounces: each step resets a timer, and a ballot is
  cast only after `SETTLE_MS` (1200 ms, with the public-ballot notice) or
  `CAST_SETTLE_MS` (600 ms, without). Policy screens pass `showNotice={false}`
  (`PolicyCard.tsx`, `PolicyDetailsScreen.tsx`), so there the window is 600 ms
  with no confirmation. Taps on the arrows accumulate correctly inside it.
- **Swipes do not accumulate.** In `VotingButton.tsx` the pan computes
  `initialVote + delta` with `delta` clamped to ±1, and `initialVote` is the
  committed ballot, not the live value. A second swipe up before the first is
  cast still yields `committed + 1`. By swiping alone you cannot get from 0 to
  +3 without the control casting +1 and +2 on the way: it is stuck exactly as
  described.
- **Every intermediate is public and permanent.** Each cast is an m8 issuance,
  a `createRecord` and a delete of the earlier record (`removeEarlierBallots`).
  The delete removes it from the repo; the firehose already carried it, and
  anyone archiving the firehose keeps +1, +2 and +3 with their timestamps.
- **Concurrent casts race.** The vertical `VotingButton` is not disabled while
  a cast is in flight (the horizontal one is). Two overlapping casts each run
  `removeEarlierBallots` against a listing that may include the other's new
  record, so either can delete the ballot that should survive. The AppView
  upserts by nullifier and deletes by URI (`cabildeo-vote.ts`), so the survivor
  can be the older value or none, while the client shows the newer one.

### 4b. Required behaviour, for public and secret ballots alike

1. **The draft is local.** Steps, taps and swipes change a draft value on the
   device. Nothing is sent per step, and the pan accumulates from the draft,
   not from the committed ballot.
2. **One commit per settle.** A commit happens on an explicit confirm, or after
   the person stops adjusting for the settle window. For policy screens that
   skip the notice, 600 ms is short for a stepped control on a phone;
   recommend at least the 1200 ms the notice path uses, and commit on leaving
   the screen.
3. **One in flight, latest wins.** Commits are serialized. A draft that changes
   during an in-flight commit is queued, replacing any earlier queued value, and
   sent after the first finishes. Never two concurrent writes for one subject.
4. **Recast in place.** Public ballots: a deterministic rkey per voter and
   subject so a recast is `putRecord` over the same record rather than
   create-then-delete (OD-8 §9 finding 4 asked for the same). Secret ballots:
   the same `s` with a higher `seq` (§3). Either way there is one record per
   voter per subject, so there is nothing to delete and nothing to race.

Item 4 does not make intermediate values private for public ballots: a
`putRecord` is still a commit on the firehose. Items 1-3 are what keep them
from being emitted at all.

## 5. What this does not fix

1. **m8 and the box colluding** can join issuance to submission by timing and
   network metadata. Batched issuance (§2a) and a submission delay help; only
   operational separation ends it. If both run under one operator the claim is
   "private from the public, and from each service alone", not "anonymous".
2. **The box sees the network.** Submissions must not carry the PARA session
   or account credentials, and should go through an Oblivious HTTP relay
   (RFC 9458) run by a third party. A box that logs IPs defeats §2.
3. **m8 can mint tokens.** It holds the signing key. The published issued-token
   count bounds it only if m8 is honest about the count; a dishonest m8 can
   cast ballots for eligible people who did not vote. Detecting that needs
   per-person issuance receipts, which this document does not provide.
4. **Choices are plaintext at the box.** The box sees every ballot's value;
   it just cannot attribute it. Hiding values from the box is the encrypted
   ballot (threshold ElGamal, OD-7 §5b), which this composes with: a later
   version sends a ciphertext and a validity proof in place of `signal`.
5. **Delegation is not covered.** A token is a direct vote. `delegatedFrom` stays
   refused (OD-7 §5d); liquid democracy over secret ballots is §5b's problem.
6. **Small electorates.** A list of five ballots in a community of five is not
   private however it was cast. The floor decides whether anything is shown.
7. **Quadratic budgets** span subjects while a token covers one. Out of scope;
   QV stays frozen (`quadratic-voting-gate.ts`).

## 6. How it fits what exists

- **The three boxes (OD-7 §5h).** A secret ballot is box 2 (its count decides
  something), redeemed by the blind token rather than the MAC. It is never
  written to a repo, so no repo path needs a new refusal; but the freeze must
  refuse a public `com.para.civic.vote` for a subject marked secret, or a
  modified client could publish one beside the token. That check belongs in
  `ballotWritePolicyRefusal`, on write and on index.
- **m8's table** keeps `(person_id, subject)` as the issuance guard and stops
  receiving the choice. `policyProofMac` is not called for secret subjects.
- **The verifier** (`verifyPublicBallotProof`) is unchanged for public ballots;
  the box verifies tokens itself with a public key.
- **Spaces** are not needed for confidentiality here. If ballots should be
  user-held, the box could read them from a space; OD-8's alpha gate still
  applies to that.

## 7. Open questions

Recommendations are proposals for sign-off, not decisions.

- **Who runs the box.** _Recommend a service operated apart from m8_, even if
  both are PARA at first, with separate keys, logs and databases, and no shared
  request identifiers.
- **`rk` and Reading A.** Needs OD-2 §6.5 sign-off (§3).
- **Publishing the ballot list.** _Recommend yes at close_, under the floor.
- **Recast window.** _Recommend until close, no rate limit beyond the box's
  ordinary abuse limits._ A long-open policy may need a close it does not have.
- **Lexicon.** A box procedure (working name `com.para.ballot.submit`) and a
  close-time `getBallotList`. Names are placeholders.

## 8. Before building

- [ ] Sign off §7: box operator, `rk` against OD-2 §6.5, ballot list.
- [ ] Fix the client per §4b for public ballots now. It does not depend on
      anything else here.
- [ ] Specify the floor (OD-7 §5g.3); the box cannot publish without it.
- [ ] Choose the OHTTP relay operator.
- [ ] A secret-subject marker on cabildeo/policy, and the public-ballot refusal
      for it in `ballotWritePolicyRefusal`, with a test pinned like
      `ballot-freeze.test.ts`.
- [ ] Schedule against [QUARTER_PLAN_2026Q4.md](./QUARTER_PLAN_2026Q4.md); this
      is not in the pilot queue today.
