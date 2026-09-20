---
"@para/matrix-bridge": minor
---

Make Matrix ingestion atomic across event metadata, participation and durable unread invalidations. Recheck room access for SSE delivery, replay all retained batches, and disconnect slow consumers. Persist forward reconciliation cursors and stop retaining unused passwords.

Require dedicated ownership handover for owner mutations, create institutions with server-generated identifiers, and disable unproven public chat-account links. Report unsupported MAS appservice login explicitly without substituting administrative credentials. Add SQLite/PostgreSQL regression coverage and an isolated Synapse smoke test.
