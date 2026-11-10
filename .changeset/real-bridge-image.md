---
'@para/matrix-bridge': patch
---

Include service TypeScript configurations in Docker build contexts so the Matrix bridge compiles its own project instead of falling back to the monorepo test graph.

Return bounded PostgreSQL counters as numbers, preserve relay cursors beyond 32 bits, and expose community-space fields consistently to Matrix routes. Verify the PostgreSQL implementation with disposable database integration tests.
