---
'@atproto/pds': patch
---

Do not serve permissioned-space blobs through the public `sync.getBlob` route:
a blob with no public repo record referencing it now answers `BlobNotFound`,
while bytes shared with a public record remain available until that record is
deleted (space reachability still protects them). Manual port of upstream
907f41a7b, adapted with a route-level test that builds this worktree's PDS.
