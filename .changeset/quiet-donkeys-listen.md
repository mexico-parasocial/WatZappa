---
"@para/matrix-bridge": patch
---

Stop the firehose consumer from silently indexing nothing. `PDS_FIREHOSE_URL` was configured as a full subscription URL while the consumer appends `/xrpc/com.atproto.sync.subscribeRepos` itself, doubling the path so the PDS 404'd every upgrade and `@atproto/ws-client` retried forever without a single log line (connection errors only surface through `onReconnectError`, which was never wired). The config now accepts both shapes by stripping a trailing subscription path, all documented defaults are service-base-only, the dev launcher exports `PLC_URL`, and reconnect attempts log loudly.
