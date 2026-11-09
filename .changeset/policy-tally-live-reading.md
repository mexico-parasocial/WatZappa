---
'@atproto/bsky': minor
'@atproto/api': patch
'@atproto/pds': patch
'@atproto/ozone': patch
---

A policy tally is a live reading, not a decision (OD-10 §7.6): a policy never closes, and anything binding goes through a cabildeo. `state` now takes `passing`, `failing`, `split` or `noQuorum`, read from `outcome`; the old values (`draft`, `voting`, `passed`, `failed`, `official`, and the unlisted `civicTree`) are deprecated and no longer returned. `official` is deprecated and always false: it came from the author's own post metadata, so any author could make their policy "certified". `certified` is deprecated and now means only that `outcome` is `passed` or `strong_passed`. Both stay required for one version and will then be removed.
