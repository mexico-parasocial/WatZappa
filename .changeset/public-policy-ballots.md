---
'@atproto/common': minor
'@atproto/pds': patch
'@atproto/bsky': patch
---

Accept public policy ballots. A `com.para.civic.vote` with `subjectType: "policy"` and an integer `signal` from -3 to +3 is now written and indexed like a cabildeo ballot: public, attributable to the identity that casts it, and only with an m8 `m8:policy:v1` authorization whose MAC binds the signal. `verifyCabildeoProof` becomes `verifyPublicBallotProof` and verifies both kinds; a cabildeo authorization cannot stand in for a policy one or the reverse. `delegatedFrom` stays refused. The AppView keeps one policy row per person and subject (by nullifier), so voting again from another identity replaces the ballot.
