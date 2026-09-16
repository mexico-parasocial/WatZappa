---
'@atproto/common': patch
'@atproto/repo': patch
'@atproto/space': patch
'@atproto/pds': patch
---

Adopt `@atproto/car` from main and retire the duplicated CAR implementations:
`@atproto/repo` now re-exports the car package surface in place of its local
car/block-map modules (which move out along with common's copy and the varint
shim), the vendored `@atproto/space` serializes and verifies through the car
package with a disposable reader bound to lazy record iteration, and
`importRepo` streams through `CarReader` with explicit disposal. MST and
write-record providers iterate block maps directly, and repo writes use the
BlockMap API shared by the built and source implementations.
