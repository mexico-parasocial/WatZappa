---
'@atproto/lex-builder': patch
---

Accept the `space-ref` string format in lexicon code generation. The runtime schema validator already supported `space-ref`, but the code generator rejected it with `Unknown string format: space-ref`, so lexicons using it could not be built.
