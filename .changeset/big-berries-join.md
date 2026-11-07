---
'@para/matrix-bridge': minor
---

Return explicit verified membership roles for chat moderation clients. Limit community access removal to that community's rooms and propagate incomplete bans for durable retry, rechecking current authority on every retry without a five-attempt cutoff. Explicit device revocation now persists its intent before contacting MAS/Synapse, returns HTTP 202 while pending, retries across restarts and marks completion only after upstream confirmation. Pending devices cannot be re-attested or reused for legacy login; successful revocation updates all attestations of that device without touching other devices.
