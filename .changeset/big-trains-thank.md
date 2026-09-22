---
'@atproto/bsky': patch
---

Keep legacy ballot reads closed even when the QV experiment flag is enabled,
including live aggregate statistics. Reject indexed community delegations whose
claimed delegator differs from the repository owner, and reject self-delegation.
