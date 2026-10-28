---
"@atproto/syntax": patch
---
Restore the 13 canonical syntax conformance fixtures accidentally emptied in
2cef5e61c from their exact versions immediately before that commit. This
restores test coverage without changing protocol validation behavior.
