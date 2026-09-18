---
'@atproto/pds': patch
'@atproto/bsky': patch
---

Add the authenticated service-to-service policy transport (implemented,
unwired): a standalone PDS router that verifies single-use publisher-signed
request envelopes (pinned keys, audience, freshness, durable jti
anti-replay in actor-store migration 903) and answers with PDS-signed
responses bound to the request identifier; and on the AppView side a client
that refuses any response not signed by the pinned PDS key plus a delivery
coordinator that claims, delivers over HTTP, and only acknowledges after
the authenticated receipt confirms the exact version and digest — with
checkpoint recovery and lost-confirmation reconciliation over the same
transport. Bounded rejection of oversized deliveries. Nothing mounts the
router outside tests; no scheduler, worker or public route exists.
