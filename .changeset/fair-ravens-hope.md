---
'@atproto/common': patch
'@atproto/pds': patch
'@atproto/bsky': patch
---

Require issuer verification of public cabildeo authorization bound to the author,
subject, nullifier and selected option before writing or indexing a ballot.
Fail closed without a verifier, including direct record writes and foreign PDS
records. Refuse civic delegations carrying a private intensity signal.
