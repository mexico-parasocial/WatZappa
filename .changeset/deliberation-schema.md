---
'@atproto/bsky': minor
'@atproto/api': minor
---

Give deliberation a schema, an index and a served read.

`com.para.community.deliberation` and `com.para.community.deliberationVote` were written by the PARA client but had no lexicon, no table, no indexer and a `listDeliberations` endpoint that returned an empty array — the records went into repos and stopped there. Both are now defined, `para_deliberation_statement` / `para_deliberation_vote` index them, and `listDeliberations` serves them with `agreeCount`, `disagreeCount`, `passCount` and the requesting viewer's own position — only theirs, never anyone else's.

Deliberation is deliberately **unweighted**: a position on an argument is for or against, with no magnitude, so nobody can press harder on an argument than anybody else. Changing your mind replaces your earlier position rather than adding another — by m8 nullifier when there is one, by author otherwise. Both indexers refuse a record whose `author`/`voter` does not match the repo it came from.

This is not a ballot: it confers no voting power over a proposal, and is therefore outside the ballot freeze (OD-7 §5c/§5f).
