# Upstream Sync Tracking

> Purpose: WatZappa's git history is squash-synced and shares **no merge-base** with
> `upstream` (bluesky-social/atproto), so git cannot compute 3-way merges. This file is
> the manual record of where we stand. **Update it every time you sync with upstream.**

## Current state (verified 2026-07-20)

| Item | Value |
|---|---|
| Upstream base commit | `a9ff2da83` — "Version packages (#5216)" (`@atproto/pds` 0.5.17) |
| Upstream tip at last check | `0af78cf2b` — upstream/main, 2026-07-17 (`@atproto/pds` 0.5.19) |
| Commits behind at last check | 20 |
| Cherry-picked into HEAD before 2026-07-20 | #5247 S3/R2 socket leak (`@smithy/core` override in `pnpm-workspace.yaml` + changeset) |
| Applied 2026-07-20 (uncommitted, in working tree) | #5233 AWS SDK ^3.1073.0 + `socketTimeout` semantics fix (`packages/aws`, lockfile regenerated) |

## Remaining upstream commits to review at next sync (as of 2026-07-20)

- `#5076` / `#5083` — Ozone custom queues + conversation-report routing (**wanted for community moderation**)
- `#5185` — Rework `service`/`labellers` XRPC client options
- `#5244` — `searchStarterPacksV2`; `#5219` — trending-topics gating
- `#5236` — entryway-matching `PDS_SERVICE_HANDLE_DOMAINS`
- `#5234` — `includeTakedowns` on internal `getProfiles`
- `#5193` — handle-resolver `onError` hook
- `#5224` — pnpm 11.11.0 bump (already aligned), version-bump/chore/test commits

## Sync procedure

1. `git fetch upstream` and identify the new tip.
2. Review `git log --oneline <base-recorded-above>..upstream/main` — cherry-pick or full-sync.
3. After syncing, update the table above: new base commit, tip, date, and what was applied.
4. Prefer cherry-picks of security/ops fixes between full syncs; do not let drift exceed ~4 weeks.

## Known local deviations to preserve during syncs

- All `com.para.*` lexicons, `packages/bsky/src/api/com/para/**`, para DB migrations.
- `services/matrix-bridge/`, `services/caddy/`, `deploy/`.
- `packages/pds/src/lexicon/` (committed generated tree carrying para types — slated for
  migration to upstream's `@atproto/lex` codegen flow; see `backend-lexification` skill).
- `PDS_PARA_COMMUNITY_CREATOR_DIDS` config and the `com.para.post` case in the PDS record reader.
