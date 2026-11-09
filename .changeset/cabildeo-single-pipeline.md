---
'@atproto/bsky': minor
'@atproto/api': minor
'@atproto/pds': patch
---

First step of making the cabildeo the only proposal / deliberation / decision pipeline. All additive.

- `com.para.civic.cabildeo` gains an optional `protectedAction` (`com.para.community.defs#protectedAction`): the community action its assembly is asked to decide. `getCabildeo` serves it when well formed (a DID subject) and drops it otherwise. It is a claim only and grants no authority.
- `com.para.civic.position` accepts the stance `question`. A question is not counted for, against or per option.
- `com.para.community.deliberationVote` may now weigh a `com.para.civic.position` as well as a legacy `com.para.community.deliberation`; a reaction to any other record is not indexed. `listCabildeoPositions` serves `agreeCount`, `disagreeCount`, `passCount` and the requesting viewer's own `viewerDirection`, as `listDeliberations` already does.
