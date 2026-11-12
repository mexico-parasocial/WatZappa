---
'@atproto/api': minor
'@atproto/bsky': minor
'@atproto/dev-env': patch
'@atproto/ozone': patch
---

Retire live cabildeo rooms. `com.para.civic.putLivePresence`, the `liveSession` view on `com.para.civic.listCabildeos` and `getCabildeo`, and the `cabildeoLive` hydration of actor profiles are removed, along with the data-plane presence RPC, its proto messages and the `cabildeo_live_session` and `cabildeo_live_presence` tables (dropped by migration). `listCabildeos` orders by recency alone. The demo seed no longer creates live sessions.
