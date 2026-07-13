---
'@atproto/bsky': minor
'@atproto/api': minor
'@atproto/ozone': patch
---

Add `com.para.feed.getMemes` endpoint for media-hydrated meme feeds

- New XRPC lexicon `com.para.feed.getMemes` returning `postView` + `postMeta`.
- Dataplane `GetParaMemes` RPC and SQL route filtering `para_post` by `postType = 'meme'`.
- AppView handler using `@atproto/lex` schema registration and `hydratePosts` for embeds.
- Refactor `com.para.social.getPostMeta` output into a reusable `#postMeta` object definition.
