---
'@atproto/api': minor
'@atproto/bsky': patch
'@atproto/pds': patch
'@atproto/ozone': patch
---

OD-9 phase 5, stage 4: the lexicons a community chain replaced are retired. `com.para.community.board`, `membership`, `governance`, `roleAcceptance`, `authorityEvent`, `relation` and `sharedContentAction` records, and the `createBoard`, `join`, `leave`, `acceptDraftInvite`, `removeSharedContent` and `restoreSharedContent` procedures, no longer exist; `@atproto/api` drops their types and `agent.com.para.community` methods. Found a community with `com.para.community.create` and act in it with `com.para.community.act`. The regenerated client also carries the OD-9 methods and the follow-through lexicons it was missing.
