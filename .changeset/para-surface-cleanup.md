---
'@atproto/bsky': patch
---

Remove the orphaned, never-registered `com.para.discourse.getSentiment`
handler, remove the unimplementable `getDeliberationClusters` test calls, and
add a lexicon↔handler parity test (with `lexicon-exceptions.json`) plus a
`com/para` README documenting the full PARA XRPC surface and its callers.
