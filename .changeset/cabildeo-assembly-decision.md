---
'@atproto/common': minor
'@atproto/bsky': minor
'@atproto/api': patch
'@atproto/pds': patch
'@atproto/ozone': patch
---

A cabildeo's final tally can now ground an authority event, and voter eligibility has one definition.

- `assemblyDecision` authority events are no longer refused outright. The AppView indexes one only when its `evidence` is a `com.para.civic.cabildeo` that names this community by board URI, carries a `protectedAction` for the same subject and event, has exactly two options (the first approves), is still the record version in which voting opened, and closed with a final tally that meets the policy's quorum and threshold among members known from authority events. Only `membership.approve` (`member.activate`, gated communities) and `owner.recover` (`owner.grant` / `owner.revoke`) can be decided this way; one cabildeo grounds one event.
- `@atproto/common` exports `ASSEMBLY_DECISIONS`, `assemblyQuorumTarget` and `evaluateAssemblyVote`. Quorum and threshold are fixed there, not read from a community's governance record.
- `cabildeo_close_policy` gains a nullable `recordCid`. Cabildeos whose voting opened before it was kept never ground an authority event.
- Cabildeo ballots are admitted, tallied and delegated by authority-event membership (`filterActiveMembers`) rather than by the membership record the voter wrote. A voter removed since casting a ballot no longer counts.
- `com.para.civic.cabildeo` and `com.para.community.authorityEvent` document the contract in their field descriptions.
- `com.para.civic.getCabildeo` returns `assemblyDecision` for a resolved cabildeo that carries a `protectedAction`: the count (`evaluateAssemblyVote`), why it cannot ground an event, and the next link of the subject's chain to publish. It is computed by the same assessment the verifier uses (`assessCabildeoAssembly`), so a client never counts anything itself.
- Voting must have been open for at least 72 hours (`ASSEMBLY_MIN_VOTING_MS` in `@atproto/common`) before a cabildeo can ground an authority event; the window runs from `cabildeo_close_policy.openedAt`, which the AppView sets when it first sees the cabildeo in voting, to the close of the tally. Like the quorum it is fixed, not set by the community. A shorter vote reports `problem: 'too-short'` in `assemblyDecision`.
