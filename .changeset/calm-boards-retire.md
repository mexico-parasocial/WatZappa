---
'@atproto/pds': patch
'@atproto/bsky': patch
'@atproto/dev-env': patch
---

OD-9 phase 5, stage 1: the PDS stops producing the records a community chain replaced. `createRecord`, `putRecord` and `applyWrites` refuse a new `com.para.community.board`, `membership`, `governance`, `roleAcceptance`, `authorityEvent`, `relation` or `sharedContentAction` record (`LegacyCommunityRecord`; deletes still work). `createBoard`, `join`, `leave`, `acceptDraftInvite`, `removeSharedContent`, `restoreSharedContent` and the PDS's own `getBoard` and `listBoards` are gone, along with the community-name uniqueness check; a community is founded with `community.create` and changed with `community.act`. `shareContent` takes a community account's profile URI and checks a hosted community's membership on its chain. The dev-env helpers and demo seed found community accounts. The AppView fixes found by porting the fixtures: a community account resolves by slug, a chain event re-tallies open cabildeos, an account's stewards read from its chain, and activities name account communities.
