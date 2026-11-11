# OD-8 — Should ballots live in permissioned spaces?

Ballots are public, permanent records in the voter's repo (OD-7 §5c–5d). The repo
already carries the protocol for permissioned data, `com.atproto.space.*`. This
document states what spaces would and would not buy for voting, a proposed
shape, and what must be true before building it. It does not decide.

**Status:** proposed, 2026-10-30. Nothing here is implemented. No code in
`packages/pds/src` or `packages/bsky/src` uses spaces today. Upstream is an
alpha whose own announcement says not to run production code against it (§2a),
so this is a spike-only track until that changes.

---

## 1. The idea

A voter's ballot is **private by default**. The voter may choose to share how
they voted. A **global count** exists regardless of that choice.

Two things are easy to conflate and must stay separate:

- **Sharing** is visibility: who can see _how this person voted_.
- **Counting** is integrity: every eligible ballot is in the tally.

If counting depended on sharing, the tally would only reflect people who opted
in, and would be biased. Sharing never feeds the count; the count always reads
the private ballot.

## 2. What exists today, verified

- `lexicons/com/atproto/space/*` and `lexicons/com/atproto/simplespace/*` define
  permissioned repos. Each member writes records into their own repo, scoped to
  a space (`space-ref`). Reads require a **space credential**: a delegation token
  from the user's PDS (`getDelegationToken`) exchanged at the space authority
  (`getSpaceCredential`), bound with DPoP.
- `simplespace` access policy is one of: public, member list, or a **managing
  app** asked via `checkUserAccess` at credential-mint time. App access is open
  or an allow-list of attested OAuth client IDs.
- Sync is `registerNotify` → `notifyWrite` → `listRepos` / `getRepo` (CAR, with
  a signed commit over an LtHash state). `listRepos` enumerates **writers only,
  never readers**.
- `packages/space` (`@atproto/space` 0.0.1) is the library: credentials, DPoP,
  LtHash, repo commits, sync. Its only git history here is the matrix-v2 WIP
  commit `d9ec84547`.
- **Correction, 2026-10-31.** The two bullets above describe the branch this
  document was written on (`chore/upstream-sync-2026-10`), which is 44 commits
  behind `origin/main`. On `origin/main` (PR #21) the PDS already has:
  space storage (actor-store migrations 002–005), `space.*` and `simplespace.*`
  routes registered behind `PDS_SPACES_ENABLED`, `readPolicy`/`writePolicy`/
  `putMember`, and a rewritten `@atproto/space` (KEM, MAC and `star`
  modules instead of `dpop.ts`, `ikm` and `sig`). Space writes go through the
  shared `prepareWrite` with an optional `space`, so the ballot gate applies to
  them. Everything in this section and §9 about the library and "what a PDS
  must implement" must be re-checked against `origin/main`.
- No other `docs/*.md` file mentions spaces.

## 2a. Upstream status, checked 2026-10-30

Sources: the [Atproto Spaces alpha announcement](https://atproto.com/blog/atproto-spaces-alpha)
(2026-08-20) and proposal 0016 in `bluesky-social/proposals`. Both were read via
a summarizing fetch, not line by line, so check the wording before quoting them.

- **Alpha, explicitly unfit for production.** The announcement says not to run
  production code against it, that it has had no security review, that data may
  be lost with no recovery, and that the protocol, SDKs and schema are not final.
  The proposal calls itself "a proposal, not the final specification". The
  reference implementation is on a development branch and may differ from
  published packages.
- **Access control, not confidentiality.** Records are not encrypted. PDSes and
  authorized applications can read what they handle. Space hosts see write
  metadata and writer lists but do not store record data.
- **Credentials are short-lived.** Default 10 minutes, maximum 60. Revocation is
  mainly by expiry, so access can outlast a revocation by up to the remaining
  lifetime.
- **Deniable by design.** Commits and records are not signed. The syncer and the
  repo host derive a shared secret and the host returns an HMAC, so the syncer
  could have produced that MAC itself and cannot prove authorship to anyone
  else. Records "should not carry proof of authorship that survives a leak".
- **Deletion is weaker than "can be deleted".** There is no repo-deletion
  operation, only `clearRecords`. Deleting a space does not delete members'
  records; they stay in the member's repo and become readable again if the
  authority recreates a space with the same type and key. Syncers are notified
  to delete their copies on a best-effort basis.
- **The writer set is the authority's claim.** `listRepos` is not
  authoritative, and the authority can remove writers.
- **No audit trail.** The operation log is a transport optimization that hosts
  may compact or drop.

Not checked: whether the lexicons vendored under `lexicons/com/atproto/space/`
match the current upstream development branch.

## 3. What it fixes

OD-7's open problem is that a ballot written to the repo is signed by the
voter's DID, sequenced to the firehose, and cannot be unpublished. A ballot in
a space is not on the firehose, can be removed by its author with
`deleteRecord`, and is readable only by credential holders. Copies held by a
syncer (our tally table) are removed only if we honor the delete or space-deleted
notification, which upstream treats as best-effort (§2a).

It also gives two blocked items a destination:

- **The -3..+3 control** "still writes nowhere" (OD-7 §5f, §7). A signal in a
  space is not public; §5g already accepts the pseudonym's votes being visible
  to the operator.
- **`delegatedFrom`**. §5b names the delegation graph as more re-identifying
  than the ballots. It could live in a space instead of a public record.

## 4. What it does not fix

1. **The tallier sees everything.** To count, a service holds a credential for
   every voter's ballot. That is the trust m8's `civic_vote_nullifiers` already
   asks for, with the ballots stored in users' PDSes instead of an operator
   table. Public → operator-only, not anonymous. Do not describe it as
   anonymous voting; `AGENTS.md` already says the MAC authorization is not.
2. **Participation is visible.** `listRepos` reveals the writer set to the
   authority and syncers: turnout, not choices.
3. **Public verifiability drops.** Today anyone can recompute a tally from
   public ballots. With private ballots they cannot. Mitigations: publish the
   nullifier set; add designated auditors as members. Neither is free.
4. **Live aggregates leak.** Counts that update per ballot let a differencing
   observer recover individual choices. This is the same concern behind
   `BallotPrivacyUnavailable` in `quadratic-voting-gate.ts`.
5. **It is a second write path.** `ballotWriteRefusal` (in
   `packages/common/src/para-ballot-freeze.ts`) is enforced in
   `packages/pds/src/repo/prepare.ts` for public repo writes. A `signal` or
   `delegatedFrom` written through `com.atproto.space.createRecord` bypasses it
   unless the rule is applied there too.
6. **Deniability does not extend to our ballots.** Spaces avoid proof of
   authorship on purpose, but `verifyPublicBallotProof` sends `actorDid`, the
   nullifier and the m8 authorization together, and the MAC binds the vote
   value. A leaked ballot is therefore checkable by anyone holding the verifier.
   Do not claim spaces make a ballot deniable or coercion-resistant.
7. **Auditing is not provided by the protocol.** Records carry no signature a
   third party can check, and the operation log may be dropped. Any audit
   guarantee has to come from m8 proofs and a published nullifier set, which we
   would build.
8. **A space authority can suppress writers.** Discovery runs through
   `listRepos`, which the authority controls. If the authority is not the
   operator tallying the votes, it can hide ballots from the tally.

## 5. Proposed shape

**One space per election or policy.** Owner: the community (or election).
Members: eligible voters. Policy: managing app, so PARA asks m8 for eligibility
in `checkUserAccess` at mint time.

**Write.** The voter writes a ballot record into their own repo-in-space on
their PDS. It carries the same m8 proof as today.

**Gate.** Before a space ballot is accepted or indexed it passes
`verifyPublicBallotProof` (`packages/common/src/para-cabildeo-proof.ts`). With
`PARA_CIVIC_VOTE_VERIFIER_URL` absent or unavailable it fails closed; it never
falls back to account-only deduplication (`AGENTS.md`). The existing
box rules (OD-7 §5h) apply unchanged: frozen fields stay refused inside spaces.

**Tally.** The AppView registers as a syncer, fetches ballots with a space
credential, verifies, and indexes into its own tally table. It publishes
**aggregates only**: at close, or in batches above a minimum size. Not live per
ballot.

**Share.** Sharing is a second, explicit write of a copy to a community space
(members see how you voted) or to a public record. The voter chooses. The
tally never reads the copy.

## 6. Alternatives

| Option                                    | Gets you                                                                              | Costs                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **Spaces** (above)                        | Ballots held in the user's PDS, deletable, portable, standard sync and access control | Unimplemented server side; 0.0.1 upstream; second write path to police   |
| **Private XRPC procedure to the AppView** | The same operator-only visibility; no repo write at all                               | Ballot lives only in the operator DB; not portable or user-held; bespoke |
| **Status quo + commitments** (OD-7 §5b)   | Strongest privacy; tally opened only in aggregate                                     | Large cryptographic build; scheduled for 2027                            |

Spaces and commitments compose: a space can hold a Pedersen commitment and its
opening. Choosing spaces now does not foreclose §5b.

## 7. Open questions

Recommendations are proposals for sign-off, not decisions.

- **Granularity.** _Recommend one space per election or policy._ It matches
  `checkUserAccess` eligibility and lets space deletion double as the retention
  policy. Always create it with a fresh `skey` (the default TID), never reuse a
  deleted space's key: recreation makes surviving member records readable again
  (§2a). Cost: space count grows with elections.
- **Authority.** _Recommend a PARA service DID, not the community's DID._ The
  authority runs the access policy, answers `listRepos`, and can suppress
  writers (§4.8), so it should be the party that tallies. A community DID would
  also add key custody per community.
- **Turnout visibility.** _Accept for public cabildeo and policy ballots_, which
  are already attributable (OD-7 §5d). A community that marks a vote _secret_ is
  out of scope: spaces do not provide that (§4.1, §4.6).
- **Aggregate floor.** Open. Whether it reuses the floor from OD-7 §5g.3 is
  undecided because that floor is itself unspecified.
- **Import analogue.** Open. Upstream has no repo deletion, only
  `clearRecords`, so "what to do with a frozen record in imported history" has
  no clean answer yet. Revisit with OD-7 §5c.3.
- **The library.** `@atproto/space` is already in-tree as a workspace package,
  so the question is divergence, not vendoring. _Recommend keeping it in-tree,
  unpublished, with the vendored lexicons refreshed through `pnpm lex:update`_
  once the upstream branch is identified.

## 8. Before building

- [x] Confirm the upstream status of `com.atproto.space.*` and the commit
      scheme's properties; record what was found (§2a, 2026-10-30).
- [x] `@atproto/space` repaired: its CAR imports pointed at `@atproto/common`,
      which no longer exports them, and 17 of 100 tests failed. Fixed to import
      from `@atproto/car`.
- [ ] Sign off §7's granularity and authority recommendations.
- [ ] Diff the vendored `lexicons/com/atproto/space/` against the upstream
      development branch.
- [ ] **Gate:** no binding vote is stored in a space until upstream leaves alpha
      and has had a security review. Everything before that is a dev-env spike.
- [x] One shared write gate: `ballotWritePolicyRefusal` in `@atproto/common`
      composes the freeze, narrowing, reaction and m8 proof checks, and
      `prepareWrite` calls it (unit-tested in `para-ballot-policy.test.ts`;
      `ballot-freeze.test.ts` still passes).
- [ ] Call that gate from the space write path when one exists, with a PDS
      test pinning it as `ballot-freeze.test.ts` pins the repo path. The gate
      cannot be bypassed by a path that does not exist yet, so this stays open
      until Phase 2.
- [x] Spike one round trip: member write → authority credential → syncer
      fetch → `verifyPublicBallotProof` → aggregate (§9). Done in memory with
      `@atproto/space`, not against a real PDS or dev-env.
- [ ] State the privacy claim in the lexicon and client copy as "private from
      the public, visible to the operator", not "anonymous".
- [ ] Schedule against [QUARTER_PLAN_2026Q4.md](./QUARTER_PLAN_2026Q4.md); this
      is not in the pilot queue today.

## 9. Spike results, 2026-10-31

> **Stale base.** The spike ran against the pre-`origin/main` `@atproto/space`
> (signature, `ikm` and DPoP) and will not run on main's rewritten package; its
> test was removed when `origin/main` was merged (recover it from `f9dd0edb5`).
> Findings 4–6 concern our own syncer logic and still apply. Findings 1–3 and 7,
> the "library covers the cryptography" claim, and the conclusion's estimate of
> PDS work are unverified against main, which already ships PDS space storage
> and routes (§2).

The removed `packages/space/tests/ballot-spike.test.ts` (9 tests, throwaway) models the
three roles in memory with the real `@atproto/space` primitives, the real
`ballotWritePolicyRefusal`, and an HTTP stand-in for the m8 verifier. It
exercises: gated write, delegation token → DPoP-bound credential, CAR fetch and
commit verification, re-gating on sync, nullifier dedupe, delete, and an
aggregate withheld while open or below a floor of 3.

**What held up.**

- The library covers the cryptography for all three roles. Nothing needed a
  change to `@atproto/space` beyond the earlier CAR import fix.
- The Phase 1 gate dropped into a space write path unchanged, and it refused the
  same things the repo path refuses: a frozen collection, `delegatedFrom`, a
  rewritten option (the proof no longer matches), and an unreachable or
  unconfigured verifier (fails closed).
- A host that alters stored bytes is caught: the set hash no longer matches the
  signed commit and `verifyRepoCar` rejects the CAR.
- A credential presented with a different DPoP key, for a different space, or
  replayed is refused; an ineligible requester gets no credential.
- A leaked ballot still verifies for its author and fails for any other DID.
  Spaces' deniability does not apply to our ballots (§4.6).

**What the spike found.**

1. **Library TTL disagrees with the spec.** `createSpaceToken('credential')`
   defaults to 7200 s and does not cap it. Upstream says default 10 minutes,
   maximum 60. Our authority must pass `expiresInSec` explicitly and enforce
   the cap itself.
2. **Replay protection is the caller's job.** `verifyDpopProof` "checks
   everything but replay" and delegation tokens are single-use. The spike used
   in-memory sets. A real PDS and authority need a shared store with expiry.
3. **A service syncer needs an account.** Delegation tokens are signed by a
   user key and served by that user's PDS, so the AppView tally needs a DID with
   a resolvable signing key. The spike used `did:plc:tally`. Whether upstream
   intends this for service syncers is unverified.
4. **A recast is ambiguous.** Two records with the same nullifier and different
   options both pass the gate. Which one counts is whatever the syncer iterates
   last. The fix is a deterministic rkey per voter and subject, so a recast is an
   overwrite, plus a rule for what the tally does with duplicates.
5. **One bad repo can wedge a naive syncer.** The tamper test makes the whole
   sync throw. A real syncer must isolate failures per repo, or one hostile PDS
   or voter can block the tally.
6. **The gate runs twice.** Once at write, once per sync per ballot (the test
   counts 5 calls for 5 ballots). The syncer should cache "verified" by record
   CID and ask m8 only about new CIDs.
7. **Commits are signed per read.** Each reader gets a distinct `ikm`, so the
   host signs on every `getRepo`. The user's signing key is on the read path.

**Not exercised, so not estimated.** HTTP/XRPC handlers and OAuth scopes;
persistent storage (actor-store tables, the 2 KB LtHash state per repo); DID
document resolution and key-rotation refresh; `notifyWrite` delivery,
registration expiry and `listRepos`; space deletion and `clearRecords`; large
repos; the aggregate publication endpoint; the AppView indexing path.

**Conclusion.** Feasible with the library as it stands, with no cryptographic
blocker. The real cost is the parts the spike skipped: PDS storage and
endpoints, the authority's state, and a syncer that survives hostile hosts. That
cost is not worth paying while upstream is an alpha with no security review
(§2a). The private-XRPC alternative in §6 remains the shippable option for the
pilot; revisit spaces when upstream stabilizes.
