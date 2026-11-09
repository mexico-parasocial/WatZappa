---
'@para/matrix-bridge': minor
---

Remove the bridge's proposal engine. Proposals, votes and decisions are cabildeos, tallied by the AppView; the bridge no longer consumes `com.para.community.proposal` / `com.para.community.vote`, runs the 10-minute state machine, announces results in Matrix, or serves `GET /api/proposals` and `GET /api/decisions` (they now answer 404). The `proposal.state` SSE event is gone. The constitution record is still stored and served (`GET /api/constitution`, `constitution.updated`). The `proposals`, `votes` and `decisions` tables are left in place (no destructive migration).
