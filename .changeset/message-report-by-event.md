---
"@para/matrix-bridge": patch
---

Report a chat message by room and event. `POST /api/moderation-report` now accepts a message report with `matrixRoomId`, `matrixEventId` and a reason from a fixed set, resolves the sender's DID from ingested events and minted sessions instead of trusting the client, and rejects a client-supplied `reportedDid` that does not match the event's sender (previously anyone could file a report against any DID). Free-text reasons are refused on message reports so they cannot carry the reported text (F4, D2). Member reports without an event are unchanged.
