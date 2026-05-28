# Para Lexicons and Collections (Backend Contract)

This document defines the `com.para` contract implemented in this repository: lexicon surface, record collection invariants, storage/indexing behavior, and read-after-write semantics.

## 1) Lexicon Surface

Source lexicons live under `lexicons/com/para/`.

### Query endpoints

- `com.para.feed.getTimeline`
- `com.para.feed.getAuthorFeed`
- `com.para.feed.getPosts`
- `com.para.feed.getPostThread`
- `com.para.social.getPostMeta`
- `com.para.actor.getProfileStats`

### Record collections

- `com.para.post`
- `com.para.status`
- `com.para.social.postMeta`

## 2) Collection Semantics and Invariants

### `com.para.post`

- Lexicon: `lexicons/com/para/post.json`
- Key type: `tid`
- Purpose: canonical Para post record.
- Important fields:
  - `text`, `createdAt` (required)
  - optional `reply`, `langs`, `tags`, `flairs`, `postType`, `embed`, `facets`

### `com.para.status`

- Lexicon: `lexicons/com/para/status.json`
- Key type: `literal:self`
- Purpose: per-account public Para status.
- Invariant: exactly one mutable status slot per repo, keyed at `self`.
- Enforcement points:
  - Lexicon key constraint.
  - PDS write-path constraint in `packages/pds/src/repo/prepare.ts`:
    - non-`self` rkeys are rejected.

### `com.para.social.postMeta`

- Lexicon: `lexicons/com/para/social/postMeta.json`
- Lexicon key type: `tid` (generic)
- Effective backend invariant in this repo:
  - record must reference a `com.para.post` URI in `post`.
  - referenced post must belong to the same repo (same DID).
  - metadata record rkey must match referenced post rkey.
- Enforcement points:
  - PDS write-path constraint in `packages/pds/src/repo/prepare.ts` (`assertParaPostMetaRkey`).

This effectively creates a 1:1 mapping between a post and its explicit Para metadata record.

## 3) PDS Layer Behavior

### API handlers

PDS handlers are implemented under `packages/pds/src/api/com/para/` and registered in `packages/pds/src/api/index.ts`.

- Feed handlers with read-after-write munging:
  - `feed/getTimeline.ts`
  - `feed/getAuthorFeed.ts`
  - `feed/getPosts.ts`
  - `feed/getPostThread.ts`
- Straight pipethrough handlers:
  - `actor/getProfileStats.ts`
  - `social/getPostMeta.ts`

### Read-after-write implementation

Read-after-write is driven by `pipethroughReadAfterWrite()` in `packages/pds/src/read-after-write/util.ts`, using local records newer than upstream repo rev (`Atproto-Repo-Rev`).

`LocalRecords` includes `paraPosts` (`packages/pds/src/read-after-write/types.ts`), populated from actor-store reads in `packages/pds/src/actor-store/record/reader.ts`.

Endpoint behavior:

- `getTimeline`: injects local `com.para.post` into upstream feed.
- `getAuthorFeed`: injects local posts only when requested actor DID is requester DID.
- `getPosts`: can add missing locally-created requested URIs if appview has not indexed yet.
- `getPostThread`: can splice local parents/replies and has a not-found fallback that can build an all-local thread response.

## 4) AppView Data Plane Storage

AppView stores/indexes Para data in dedicated tables.

### Tables and migrations

- `para_post`
  - Migration: `packages/bsky/src/data-plane/server/db/migrations/20260219T120000000Z-add-para-post.ts`
  - Indexes: `creator`, `sortAt`
- `para_post_meta`
  - Migration: `packages/bsky/src/data-plane/server/db/migrations/20260219T190000000Z-add-para-post-meta.ts`
  - Constraints: `postUri` unique (1:1 meta-per-post)
  - Indexes: `postUri`, `creator`
- `para_status`
  - Migration: `packages/bsky/src/data-plane/server/db/migrations/20260219T220000000Z-add-para-status-and-profile-stats.ts`
  - Constraints: `did` primary key, `uri` unique
- `para_profile_stats`
  - Migration: same as above
  - Indexes: `influence`

### Indexing plugins

- `para-post.ts` writes/deletes `para_post` and cascades meta cleanup on post delete.
- `para-post-meta.ts` writes/deletes `para_post_meta` and enforces same-repo check during index ingest.
- `para-status.ts` upserts `para_status` by DID.
- `para-profile-stats.ts` recomputes aggregates into `para_profile_stats`.

## 5) AppView Query Surface

AppView handlers live under `packages/bsky/src/api/com/para/`.

They read through data-plane methods implemented in:

- `packages/bsky/src/data-plane/server/routes/feeds.ts`
- `packages/bsky/src/data-plane/server/routes/threads.ts`
- `packages/bsky/src/data-plane/server/routes/profile.ts`

Notable query behavior:

- Timeline = followed accounts + self, deduped by URI.
- Post meta = explicit `para_post_meta` when present, fallback to post-derived values + `post_agg.likeCount`.
- Profile stats = precomputed aggregate row + optional status row.

## 6) Test Coverage

Current Para coverage includes:

- PDS read-after-write integration:
  - `packages/pds/tests/proxied/para-read-after-write.test.ts`
- PDS write-constraint coverage for status/postMeta:
  - `packages/pds/tests/crud.test.ts`
- AppView endpoint behavior:
  - `packages/bsky/tests/views/para-feed.test.ts`
- AppView data-plane query behavior:
  - `packages/bsky/tests/data-plane/para-queries.test.ts`

## 7) Practical Contract Summary

If you are building against this backend:

- write posts to `com.para.post` normally.
- write account status only at `at://<did>/com.para.status/self`.
- write post metadata to `com.para.social.postMeta` with:
  - `post` referencing your own `com.para.post` URI,
  - rkey equal to referenced post rkey.
- expect immediate read-after-write visibility for Para feed/thread/post endpoints through PDS proxy handlers.
