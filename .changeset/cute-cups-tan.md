---
"@atproto/dev-env": patch
"@atproto/bsky": patch
---

Seed valid demo lists and image memes without frozen ballots or unverified delegations; hydrate PARA posts using their own schema.

Order the pending notification migration after existing September migrations and remove stale priority preference reads and writes so the dev environment can upgrade and start. Fix notification pagination to use its single-key cursor.
