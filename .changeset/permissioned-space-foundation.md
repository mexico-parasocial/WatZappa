---
'@atproto/common': patch
'@atproto/oauth-provider': patch
'@atproto/pds': patch
'@atproto/bsky': patch
---

Add dormant permissioned-space storage, the PARA policy projection and resolver,
pinned-key signed projection intake with fail-closed stream invalidation,
a dormant AppView policy publisher, transactional Postgres outbox with ordered
leases and acknowledgements, and cross-service compatibility tests,
durable verified policy-fault watermarks and exact-receipt reconciliation for lost acknowledgements,
client-attestation verification, a draft M8 assurance verifier with fixed public
test vectors, durable single-use M8 challenges with atomic replay receipts, and
replay foundations required for the manual port. No space
credential or record XRPC route is enabled.
