---
'@atproto/pds': patch
'@atproto/oauth-scopes': patch
'@atproto/syntax': patch
---

Spaces repo host, alpha, behind `PDS_SPACES_ENABLED`: an account can write and read its own space repos (`com.atproto.space` createRecord, putRecord, deleteRecord, applyWrites, getRecord, listRecords, listRepoOps, getLatestCommit, getRepo), only in spaces it governs, only over OAuth with a matching `space:` grant, and without blobs. Every other Spaces method answers 501 and is never proxied or granted service auth. `oauth-scopes` parses and enforces `space:` permissions; `syntax` validators accept any value.
