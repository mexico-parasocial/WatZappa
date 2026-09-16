---
'@atproto/pds': patch
'@atproto/bsky': patch
---

Add the dormant authenticated PARA policy checkpoint-recovery protocol: bounded
single-use PDS challenges bound to the accepted projection and both verified
floors (fault maxima, or the accepted state's own version/epoch when a
ready-but-lagged receiver catches up after an expired undelivered head),
atomic challenge consumption plus full-snapshot installation in
the authority actor store (migration 005), an independently encoded checkpoint
signer path, outbox checkpoint reservation above publisher head and receiver
floors with pending/lease fencing and exact receipt confirmation or
reconciliation, and Postgres-to-SQLite recovery tests proving lost revocations
stay denied. No credential or record XRPC route is enabled.
