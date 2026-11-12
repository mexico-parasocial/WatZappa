---
'@atproto/pds': patch
'@atproto/bsky': patch
'@atproto/common': patch
'@atproto/api': patch
---

Community profiles can carry a banner image. An owner uploads it into the community's own repo with `com.para.community.uploadBanner` and sets it with a `profile.update` action that names its CID; an update that leaves it out removes it. `getBoard` and `listBoards` return its URL as `banner`.
