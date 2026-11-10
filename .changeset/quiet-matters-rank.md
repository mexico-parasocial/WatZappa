---
'@atproto/bsky': patch
---

`com.para.actor.getSuggestedUsers` now ranks authors by posts carrying any of the requested matter flairs (case-insensitive, `para_post_meta.flairs`) or legacy tags, instead of requiring every tag at once.
