---
'@atproto/api': minor
'@atproto/lex': minor
'@atproto/xrpc-server': minor
'@atproto/ozone': minor
'@atproto/pds': patch
'@atproto/dev-env': patch
'@atproto/tap': patch
---

Make the full build green after the sync restoration: add chat conversation
report subjects (`chat.bsky.convo.defs#convoRef` / `#messageRef`) to
moderation report and emit-event subject unions, add `recommendedPolicies` to
ozone queue views, export `extractUrlNsid` and add `asUnknown$TypedObject`,
hydrate `authFactorType` on PDS actor accounts, and align tap with the new
ws-client API.
