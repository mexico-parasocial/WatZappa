---
'@atproto/api': patch
'@atproto/bsky': patch
'@atproto/pds': patch
---

Restore `cursor` in the `app.bsky.feed.getTimeline` output: adding `startCursor` replaced it, so the lexicon no longer described the cursor the AppView returns for paging. The AppView's data plane no longer filters notifications by the `priority` request field the proto removed, and `getNotificationsV2` pages the same way as `getNotifications`. `com.para.community.authorityEvent` indexing validates against its lexicon and skips events whose action or basis authority does not define. Fixes the type errors that broke `pnpm build`.
