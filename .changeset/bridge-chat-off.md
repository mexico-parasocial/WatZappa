---
'@para/matrix-bridge': patch
---

Add a chat-off mode (`MATRIX_CHAT_ENABLED=false`): the bridge serves governance (constitution, proposals, sortition, moderation, badges) with no homeserver. Matrix settings become optional, no admin client, sync poller, Matrix retry jobs or membership-lease sweep start, and chat routes answer 503 `CHAT_DISABLED`. Communities created meanwhile keep a governance-only space-map row and are queued for room provisioning once chat is on. The periodic jobs (proposal state transitions, badge recompute, expired-sanction lifting, event-log pruning and, with chat on, the membership-lease sweep) now actually run: they were scheduled after the firehose's never-returning `start()`.
