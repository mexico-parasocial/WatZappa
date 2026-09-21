---
'@atproto/common': minor
'@atproto/bsky': minor
'@atproto/pds': minor
---

Enforce the PARA ballot policy instead of describing it.

`com.para.community.vote` and `com.para.community.intensity` were marked DEPRECATED — *do not write this record* — in their lexicons, but the PDS still accepted a ballot carrying `voter` and `signal` into the author's own repo, where it is signed by their DID and sequenced to the firehose permanently. They are now frozen: the PDS refuses to prepare a create or an update for one (covering `createRecord`, `putRecord`, `applyWrites` and the `com.para.*` write endpoints, and unaffected by `validate: false`), and the AppView refuses to index one, so a ballot written by any other PDS is not aggregated into a queryable who-voted-what table here either.

`com.para.civic.vote` stays writable, because a cabildeo ballot being public and attributable has been accepted (OD-7 §5d) — but only as a cabildeo ballot. A write is refused unless `subjectType` is `"cabildeo"` and `selectedOption` is set, and refused outright if it carries `signal` (a -3..+3 position) or a non-empty `delegatedFrom` (the delegation graph). Its lexicon description now states the publicness the data model always had.

Deletes are not refused at either layer, and sequencer recovery passes a `replay` flag so re-emitting already-committed history still works.
