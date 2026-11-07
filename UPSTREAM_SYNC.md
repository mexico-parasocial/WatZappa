# Upstream Sync Tracking

The fork shares a merge base with `upstream` (bluesky-social/atproto) since
`be2b1b4a` recorded one, so syncs are ordinary 3-way merges. **Update the table
below every time you sync.**

## Current state (2026-11-02)

| Item                 | Value                                                          |
| -------------------- | -------------------------------------------------------------- |
| Last merged upstream | `ee68c938` — upstream/main on 2026-11-02, merged in `1d8f35e9` |
| Landed on fork main  | `f3c838ae` (#26)                                               |

## Sync procedure

1. `packages/dev-infra/sync-upstream.sh --check` lists conflicts without
   merging; without `--check` it merges into a new `sync/upstream-<date>`
   branch. The weekly `Upstream sync` workflow runs the same script and opens a
   PR, or a tracking issue on conflict.
2. After the merge, `make check-fork` (fork-owned files and hook anchors) and
   `pnpm run build`. When fork code moves, update the tables in
   `packages/dev-infra/check-fork-surface.sh` in the same change.
3. Prefer cherry-picks of security/ops fixes between full syncs. The quarter
   plan caps routine sync work at one day per sprint.

## Known local deviations to preserve during syncs

- All `com.para.*` lexicons, `packages/{pds,bsky}/src/api/com/para/**`, PARA
  DB migrations, and the PARA indexing plugins registered in
  `packages/bsky/src/data-plane/server/indexing/index.ts`.
- PDS hooks in upstream files, enumerated as anchors in `check-fork-surface.sh`.
- `packages/space` follows its own pin (`packages/space/SOURCE`), not upstream.
- `services/matrix-bridge/`, `services/para-idp/`, `services/caddy/`, `deploy/`.
