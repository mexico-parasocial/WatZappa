---
'@atproto/bsky': patch
---

Add conclusions: a steward's written summary of a cabildeo of kind `forum` or `persuasion`, which end without a vote. Stewards write `com.para.civic.conclusion` to their own repo; the AppView indexes it from anyone and serves it through `com.para.civic.getConclusion` only when its author is a current steward of the cabildeo's community and it names the board the cabildeo resolves to. The newest conclusion is shown and earlier ones are returned as history. Cited positions that do not belong to the cabildeo are dropped. The first version is kept (an edit is served as first written, flagged `edited`), and `createdAt` is committed with it. Adds the `GetParaConclusion` data-plane RPC and the `20261107T120000000Z-add-conclusion` migration.
