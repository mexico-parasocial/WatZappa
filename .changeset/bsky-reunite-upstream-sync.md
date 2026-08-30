---
'@atproto/bsky': patch
---

Fix type errors introduced by an incomplete upstream sync. Restore the `IrisFeed`, `OpThreadMetadataEnable`, and `KnownLikersFeedEnable` feature gates (alongside the local `TrendingTopicsV2`), the `irisFeedUris` config getter, moderation-tag and scoped-mute hydration, and the upstream `bsky.proto` additions (OpThread, MuteInfo, SearchTypeaheadParams, op-thread and mute-scope fields) while keeping all PARA messages and `cabildeo_live_json`. Expose the temporary off-Lexicon `opThreadPostIndex`/`opThreadPostCount` feed view fields, and serialize gallery embed views under `media` as defined by the local `app.bsky.embed.gallery` lexicon.
