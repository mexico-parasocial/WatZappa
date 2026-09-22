---
"@atproto/bsync": patch
"@atproto/bsky": patch
"@atproto/dev-env": patch
---

Restore the bsync dataplane client and the dependencies bsky's source imports, both lost in merges, and make dev-env's Ozone seeding idempotent so it can run against persistent storage.
