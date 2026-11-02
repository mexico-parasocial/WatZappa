---
'@atproto/common': patch
'@atproto/pds': patch
---

Compose the ballot write policy (freeze, narrowing, reaction rules and m8 proof
checks) into one `ballotWritePolicyRefusal` in `@atproto/common`, and have
`prepareWrite` call it. Behavior is unchanged; any other path that writes a
ballot-shaped record can now share the same gate.
