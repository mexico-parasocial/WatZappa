---
'@atproto/bsky': minor
'@atproto/api': minor
'@atproto/ozone': patch
---

Retire the legacy community proposal / deliberation / decision records; `com.para.civic.cabildeo` is the only pipeline.

- Removed the lexicons `com.para.community.proposal`, `deliberation`, `decision` and the query `listDeliberations`, with the AppView route, the `GetParaDeliberations` dataplane RPC and the indexer for deliberation statements. A repository that still holds such a record keeps it; the AppView no longer reads or serves it.
- `com.para.community.deliberationVote` is indexed only when it weighs a `com.para.civic.position`. Reactions to the retired `deliberation` record are no longer indexed.
- The `para_deliberation_statement` table and its rows are left in place (no destructive migration); only Influence still reads them.
- `com.para.community.membership#ratifiedBy` now names only a `com.para.civic.cabildeo`.
