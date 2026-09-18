---
'@atproto/bsky': patch
---

Add the governance-authorized policy materializer: inside the same Postgres
governance transaction that enqueues or prepares a policy artifact,
`materializeGovernanceMembers` validates the community board (exact source
binding, known governance mode) and derives the member snapshot from the
AppView membership index with PARA's state semantics (active, left/removed/
blocked tombstones, pending omitted, unknown states fail closed,
deterministic DID ordering for stable retries). No roles are materialized:
membership records are member-self-authored and the governance record's
authority lists are not persisted, so snapshots grant admission only while
PARA role rules remain in the PDS resolver. Route-disabled; tested Postgres
to SQLite through the real publisher, intake and resolver.
