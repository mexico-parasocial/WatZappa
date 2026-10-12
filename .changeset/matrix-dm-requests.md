---
"@para/matrix-bridge": patch
---

Direct messages by consent. `POST /api/dm-requests` asks for a DM with a DID, proving the requester's MXID with an assertion for the new audience `para-matrix-bridge/dm.v1`; `GET` lists incoming (requester DIDs only) and outgoing requests with their status; `/accept` hands the requester's MXID to the recipient once and marks the request accepted with the MXID blanked; `/decline` removes it. At most 20 pending per requester, 14-day TTL.
