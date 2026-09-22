---
"@atproto/sync": patch
---

Expose `onReconnectError` on `FirehoseOptions`. The option already flowed through to the underlying `Subscription`, but was untyped, so consumers wiring it (to see connection failures, which never reach `onError`) failed to compile.
