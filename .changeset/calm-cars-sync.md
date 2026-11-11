---
'@atproto/space': patch
---

Import the CAR reader and writer from `@atproto/car`. `@atproto/common` no
longer exports them, which broke repo serialization and verification.
