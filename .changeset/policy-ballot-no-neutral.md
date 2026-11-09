---
'@atproto/common': minor
'@atproto/bsky': patch
'@atproto/dev-env': patch
'@atproto/pds': patch
'@atproto/api': patch
'@atproto/ozone': patch
---

A policy ballot no longer carries a `signal` of 0 (OD-10 §7.5): there is no neutral ballot, and taking no stance means casting none. The new `isPolicySignal` in `@atproto/common` accepts -3..-1 and +1..+3 and is the one rule behind `ballotWriteRefusal` and `verifyPublicBallotProof`, so the PDS refuses such a write and the AppView refuses to index one from any origin. `getPolicyTally` and `getPolicyCommunityVotes` skip a 0 ballot indexed before the change and drop the 0 bucket from their breakdown. The dev-env seed treats a computed 0 as an abstention. The `com.para.civic.vote` lexicon says so in the description of `signal`, whose range cannot exclude 0.
