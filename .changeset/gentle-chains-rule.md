---
'@atproto/common': patch
'@atproto/bsky': patch
---

OD-9 phase 5, stage 2: the AppView answers for a community from its chain alone. The indexers and tables for `board`, `membership`, `governance`, `relation`, `authorityEvent` and `sharedContentAction` records are gone (a migration drops the tables); `getAuthoritySnapshots`, the board list and views, delegation candidates, vote eligibility, civic trees, RAQ, briefing packs, relations and shared content serve community accounts only. `@atproto/common` no longer exports `deriveEffectiveAuthority`, `CommunityAuthorityEvent`, `EffectiveAuthority`, `AuthorityAction` or `AuthorityBasis`. Delegate self-nomination, governance flair lists, officials and deputies have no account equivalent yet.
