---
'@atproto/api': patch
---

Correct the `voteNullifier` descriptions across the eight PARA ballot lexicons. They described the field as a "privacy-preserving one-person-one-vote nullifier"; m8 derives the value server-side from a stable person identifier and stores it beside that identifier, and each record is written to the voter's own public repo signed by their DID. The nullifier is an integrity mechanism, not anonymity, and the descriptions now say so (OD-7 §5a).

Also marks `com.para.community.vote` and `com.para.community.intensity` deprecated: both require `voter` and `signal`, so neither can carry a private ballot.

Also removes the `solidarity.social` / `matrix.solidarity.social` examples from `com.para.identity.linkedChat`, since integration with that provider is no longer planned; the examples now use `para.social`.
