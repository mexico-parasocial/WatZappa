---
'@atproto/bsky': patch
---

Serve every `com.para.*` AppView route from the generated `@atproto/lex` schemas with `server.add()`. The `com.para` lexicons are installed from the repo-root `lexicons/` through `lexicons.json`; the frozen legacy route registry (`src/lexicon/`) and the hand-written `LexiconDoc`s it needed are removed. NSIDs, params, outputs, error names, auth and viewer gating are unchanged. Two observable differences: `com.para.collection.applyOps` now enforces the `uri` / `at-uri` / `cid` formats its lexicon declares on `updateItem` patches, and an unrouted XRPC method answers `501 MethodNotImplemented` (as upstream does) instead of falling through to a 404.
