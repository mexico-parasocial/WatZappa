---
'@atproto/space': minor
'@atproto/api': minor
'@atproto/crypto': patch
'@atproto/syntax': patch
---

Move the Spaces alpha to bluesky-social/atproto PR #5187 at `5b95b2f2`, the commit vlpds 1.1.0 tracks: HTTP message signatures replace DPoP, credentials are revocable (`space.notifyCredentialRevoked`), and `simplespace.addMember` becomes `putMember`. `verifySignature` takes a `format` option to require compact or DER signatures, and `isValidDid` accepts any value.
