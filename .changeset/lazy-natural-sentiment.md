---
'@atproto/bsky': patch
---

Load `natural` on first use in `discourse-nlp.ts` instead of at import time.
Its `SentimentAnalyzer` does `require('afinn-165')`, which is ESM-only: plain
Node handles that from 22.12 on, but jest's module registry cannot `require()`
ESM before Node 24.9, so the top-level import made every suite that merely
reached this file fail to load — ozone's whole suite included, since its
fixtures pull `@atproto/bsky` in through dev-env and none of them call
`analyzeDiscourse`. Resolved through `createRequire`, which goes to Node's own
loader rather than the test runner's. Behaviour is unchanged; the analyzer,
the injected civic lexicon and the tokenizer are built once on first call.
