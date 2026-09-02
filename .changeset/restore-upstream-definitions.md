---
'@atproto/bsky': minor
---

Restore upstream-side definitions lost during syncs: feature gates (IrisFeed, OpThreadMetadataEnable, KnownLikersFeedEnable), op-thread feed metadata, scoped mutes (mutedOnlyReposts/Quoteposts), search moderation tags, and SearchTypeaheadParams. bsky.proto gains the matching messages/fields while keeping all PARA additions; PostsFilters.languages is renumbered to field 10 because PARA filters occupy fields 7-9 (dataplane must read field 10).
