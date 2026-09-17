# Port upstream PRs #5518, #5521, #5522 + #5523 (APP-2941 known-followers sampling) into this fork

The fork is at the exact pre-PR state for all involved files, so the changes apply by hand cleanly. I'll make **4 commits, one per upstream PR**, in upstream order, so each commit mirrors an upstream-tested state. Unrelated dirty working-tree files (matrix-bridge work) will not be staged or touched.

## Commit 1 — upstream #5518 (sampling infra behind gate)
1. `packages/bsky/proto/bsky.proto` (edits at local lines ~1583 and the Graph section of `service Service` ~2625):
   - `GetFollowsFollowingRequest`: add `int32 limit = 3;` + `string cursor = 4;`; `FollowsFollowing`: add `string cursor = 3;`
   - Add `SampleFollowsFollowingRequest { actor_did, repeated target_dids, int32 limit }`, `SampledFollowsFollowing { target_did, repeated dids, int32 total_known = 3 }`, `SampleFollowsFollowingResponse`; add `rpc SampleFollowsFollowing` under `// Graph`
2. Regenerate proto: `pnpm --filter @atproto/bsky codegen:buf` (generated `src/proto/*.ts` are committed in this fork). Inspect the regen diff for unrelated churn before staging — the fork's proto has 167 RPCs including custom civicTree/postSubscription ones, but those regions are untouched.
3. `packages/bsky/src/data-plane/server/routes/follows.ts`: rewrite `getFollowsFollowing` (destructure `limit, cursor`, `Promise.all` over subjects, new file-level `getKnownFollowers` helper using `countAll` (exists at `db/util.ts:32`) + `TimeCidKeyset`/`paginate` with `tryIndex: true`) and add `sampleFollowsFollowing`.
4. `packages/bsky/src/feature-gates/gates.ts`: add `KnownFollowersSamplingEnable = 'known_followers:sampling:enable'`.
5. `packages/bsky/src/hydration/actor.ts` (~line 502): add `opts?: { sample?: boolean }` to `getKnownFollowers` with the sampled branch (`sampleFollowsFollowing`, `limit: 5`, 100 ms timeout, `count = totalKnown || followerDids.length`) and the existing path as fallback; fail-open catch unchanged.
6. `packages/bsky/src/hydration/hydrator.ts` (~line 374): pass `sample: ctx.features.checkGate(ctx.features.Gate.KnownFollowersSamplingEnable)` (no DID override yet — that's #5522).
7. `packages/bsky/src/api/app/bsky/graph/getKnownFollowers.ts`: pass `limit`/`cursor` to the dataplane call, stop slicing locally, return `result?.cursor` through skeleton → presentation.
8. `packages/bsky/tests/views/known-followers.test.ts`: add the #5518 version of the 'getKnownFollowers: paginates' test.
9. Changeset `.changeset/known-followers-rankedfollows.md` (`'@atproto/bsky': patch`).

## Commit 2 — upstream #5521 (cursor coercion + fillPage refactor)
1. `packages/bsky/src/api/util.ts` `fillPage`: `result.cursor || undefined` in both spots.
2. `getKnownFollowers.ts`: wrap the pipeline call in `fillPage({ cursor, limit, fetch, items })` (import from `../../../util.js`).
3. Remove `|| undefined` cursor coercion in 12 skeletons: `bookmark/getBookmarks.ts`, `contact/getMatches.ts`, `graph/{getBlocks,getFollowers,getFollows,getList,getListBlocks,getListMutes,getMutes,getStarterPacksWithMembership}.ts`, `notification/{listActivitySubscriptions,listNotifications}.ts`.
4. Tests: replace the pagination test with 'getKnownFollowers: filters viewer-blocked followers' + the 11-follower pagination test (page 2 ends with `undefined` cursor).
5. Changeset (cursor-coercion fix, patch).

## Commit 3 — upstream #5522 (gate evaluated with viewer DID)
1. `hydrator.ts`: add `{ did: ctx.viewer }` as second arg to that `checkGate` call (local signature already supports `userContextOverrides`).
2. Tests: add 'evaluates sampling for the viewer DID' (spies on `network.bsky.ctx.featureGatesClient.scope`, asserts `checkGate` called with `Gate.KnownFollowersSamplingEnable, { did: dids.base_view }`).
3. Changeset (patch).

## Commit 4 — upstream #5523 (release: sampling unconditional)
1. `gates.ts`: remove `KnownFollowersSamplingEnable`.
2. `hydration/actor.ts`: drop the `opts` param — `sampleFollowsFollowing({ actorDid: viewer, targetDids: dids, limit: 5 }, { signal: AbortSignal.timeout(100) })` becomes the only path.
3. `hydration/hydrator.ts`: revert the knownFollowers call to `.getKnownFollowers(opts?.knownFollowersDids ?? dids, ctx.viewer)` (nets back to today's code).
4. `known-followers.test.ts`: remove the gate-evaluation test from commit 3.
5. Snapshots: known-followers sampling changes follower ordering (most-recent-first) — update `packages/bsky/tests/views/__snapshots__/profile.test.ts.snap` and `packages/pds/tests/proxied/__snapshots__/views.test.ts.snap` by running the affected suites with `vitest -u`, using the upstream diff as the expected shape (safer than hand-applying `.snap` hunks given fork drift).
6. Changeset (patch).

## Verification
- `cd packages/bsky && pnpm run build` (prebuild runs `codegen:buf`), plus `pnpm exec eslint --fix` + `prettier --write` on changed files (per-file, not repo-wide).
- Run (needs Docker for dev-env): `packages/bsky` `tests/views/known-followers.test.ts` and `tests/views/profile.test.ts`, plus `packages/pds` `tests/proxied/views.test.ts`. Also run the 12 refactored endpoints' suites where cheap (e.g. graph/follows tests) since #5521 touches them.
- Report honestly if Docker-dependent suites can't run in this environment.

## Caveats
- Local proto codegen emits **TypeScript** (`bsky_pb.ts`) and is committed — the regen diff will be larger than upstream's (which ignored generated files); only stage what's legitimately derived from the `.proto` edit.
- Upstream #5523's pds snapshot hunk shows profile field/record renumbering that is really knownFollowers reordering — snapshot regen via `-u` handles it.
- Nothing in `services/`, docker, or the matrix-bridge work is touched; existing dirty files stay untouched.