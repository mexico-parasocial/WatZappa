---
'@para/matrix-bridge': patch
---

PostgreSQL: widen `sync_cursor.cursor` to `BIGINT` (existing tables are altered on start) and convert int8 counters and cursors through a safe-integer check, so relay cursors above 2^31 survive and counts are numbers rather than strings; `getDeviceSession` returns the camelCase contract. The firehose consumer now refuses a seq above 2^53 (a raw vlpds stream) instead of silently dropping every frame. `joinUser` accepts a join that a concurrent verified request completed first.
