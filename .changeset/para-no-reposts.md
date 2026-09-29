---
'@atproto/common': minor
'@atproto/pds': minor
'@atproto/bsky': minor
'@atproto/dev-env': minor
---

PARA refuses reposts: the PDS rejects `app.bsky.feed.repost` writes and the AppView skips them on index, unless `PARA_REPOSTS_ENABLED=1`. A migration removes reposts indexed before the policy. dev-env stands in for m8 so seeds can write cabildeo votes and delegations.
