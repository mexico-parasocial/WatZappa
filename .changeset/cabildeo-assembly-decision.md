---
'@atproto/common': minor
'@atproto/bsky': minor
'@atproto/api': patch
'@atproto/pds': patch
'@atproto/ozone': patch
---

Voter eligibility has one definition, and `@atproto/common` carries the fixed rules for counting an assembly decision.

- `@atproto/common` exports `ASSEMBLY_DECISIONS`, `assemblyQuorumTarget` and `evaluateAssemblyVote`. Quorum, threshold and the 72-hour minimum voting window (`ASSEMBLY_MIN_VOTING_MS`) are fixed there, not read from a record a community's owner publishes. Nothing grounds a community chain event in them yet: a cabildeo's `protectedAction` stays a claim.
- `cabildeo_close_policy` gains a nullable `recordCid`, the record version voting opened in, which a decision that rests on a cabildeo must still match.
- Cabildeo ballots are admitted, tallied and delegated by the community account's chain (`filterActiveMembers`). A voter removed since casting a ballot no longer counts.
- A policy's quorum is the cabildeo's, capped at its electorate.
