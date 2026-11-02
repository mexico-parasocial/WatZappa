---
"@atproto-labs/opentelemetry-node": patch
"@atproto/lex-server": patch
"@atproto/lex-client": patch
"@atproto/lex-rpc": patch
"@atproto/crypto": patch
---
Restore XRPC telemetry method extraction and explicit 400 responses for invalid
request encodings or GET bodies. Align SDK regression tests with the existing
LexServerAuthError, plain LexError status and strict number parser contracts;
fix crypto type imports to pass the integration lint gate.
