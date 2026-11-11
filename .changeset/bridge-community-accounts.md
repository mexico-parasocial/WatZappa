---
'@para/matrix-bridge': patch
---

OD-9 phase 5, stage 3: the bridge discovers communities as accounts. The firehose consumer follows a community's `com.para.community.profile` (provision its space, keyed by the profile URI, room alias from the DID) and its `com.para.community.event` chain (re-check the subject of membership and office events with the authority service). It no longer reads `board`, `membership` or `authorityEvent` records, and the stale `communities.json` is removed. Every community is unicameral until chambers have an account field.
