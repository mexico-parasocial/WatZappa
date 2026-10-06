# Trusted community authority — execution and rollout record

Updated 2026-10-06. Local development integration is complete;
release selection and staging/deployment remain open.
Execution order stays in [QUARTER_PLAN_2026Q4.md](./QUARTER_PLAN_2026Q4.md).

## Candidate revisions

Current development integration: `d11fa24f1` on
`feat/books-unique-names-and-civic-work` in
`/Users/mlv/Desktop/Home/macserver/WatZappa`. The four existing P0 changes were
cherry-picked as `6601c590a`, `8fdbed7da`, `2c7079c52` and `5d0f052b4`;
`d11fa24f1` completes deployment credential wiring and import lint.
The active checkout now contains the trusted-role implementation. No remote
main merge, push, running-service upgrade or staging acceptance was performed.

Original tested candidate, retained as source history:

Integrated branch `fix/bridge-self-declared-roles`, code revision `7f485158b`,
worktree `/Users/mlv/Desktop/Home/WatZappa-bridge-roles`:

- `067c13f28`: bridge verified-authority resolver, state repair and live refresh.
- `16725660b`, `49e6f3dbe`: prior AppView role/governance and board-summary fixes.
- `7f485158b`: scoped service read, verifier hardening, historical grant replay,
  candidate sanitization and dev-env credential configuration.

AppView source branch `fix/community-role-forgery`: `f033b8d36`, following
`84bf20bf9` and `ef3974492`. Its committed AppView/dev-env files match the
integrated candidate. No push, PR merge or deployment is established here.

## Implemented behavior

The bridge reads `com.para.community.getAuthorization` for a specified member
using a dedicated service credential. Ordinary AppView users remain bound to
their own DID, regardless of a requested subject. The service header is redacted,
responses are not cached, and the bridge rejects an older server that does not
acknowledge the scoped service contract. Decoded responses are size bounded;
HTTPS is required except loopback development HTTP.

Self-authored owner/moderator/delegate/observer membership roles grant no bridge
powers. Verified member/moderator/owner grants drive room power levels, moderation
flags and room visibility. No implicit creator ownership remains in the bridge.
Delegate self-nomination can appear as a candidate label; it is not an office or
sortition permission. Delegate/observer powers require their own verified grant
protocol. Assembly decisions cannot establish their own authority through a
public `verifiedAt`; protected grants remain closed until trusted tally
verification exists. Private voting remains frozen independently.

The AppView refuses self-issued expiry grants, repeated founding grants after
handover and removed-member self-reactivation through open admission. Migration
`20261005T130000000Z` replays the derived authority index under the tightened
verifier, dropping invalid grants and appointments made by invalid issuers.
Valid founder/member/moderator/owner chains survive the tested replay.
It does not rewrite PDS records or restore unsafe authority on rollback.

The bridge repairs every persisted membership before serving. Authority events,
a 60-second sweep, joins, resource authorization, room/unread reads, SSE delivery,
native interaction and retry refresh authority. Verified moderators/owners can
review both chambers; demotion removes that room-list visibility. Verification
failure clears cached roles, suspends membership and invokes existing device
revocation and room bans. Recovery reprojects verified membership; revoked
devices require fresh login/attestation. This availability tradeoff needs staging
acceptance with actual clients/homeserver behavior.

## Validation

Run with repository Node 22.22.1 and pnpm 11.11.0. PostgreSQL/Redis test fixtures
were local; the bridge PostgreSQL container/schema were disposable.

- Bridge `pnpm typecheck`, `pnpm build`: pass.
- Bridge `pnpm test:postgres`: **261 passed / 26 files**, SQLite and PostgreSQL.
- Integrated candidate bridge typecheck plus four focused files: **66 passed**.
- AppView `pnpm build`, dev-env `pnpm build`: pass.
- AppView scoped-credential, role-forgery/remediation and delegation-candidate
  suites: **30 passed**. The local feed suite adds 21 passes but depends on a
  separate uncommitted fixture edit; that file is excluded from this candidate.
- Broader notification suites: **150 passed, 7 failed**. Failing cases cover
  empty/terminal cursors, seen/read state and activity-subscription pagination.
  These are recorded under P4; this is not a full AppView acceptance pass.
- Changed-file ESLint: no errors; two bridge `pino` import warnings. Prettier,
  `git diff --check`, shell syntax and changeset validation pass.

AppView build compatibility repairs follow the existing upstream-sync changes
at `7131b165d` (obsolete BackgroundQueue generic and notification priority field),
plus typed authority-event schema registration. The broader notification results
above remain visible instead of being treated as build success.

## Exact next steps

1. Select and publish a clean release revision from the integrated development
   branch. Do not repeat the completed local integration or role-source audit.
2. Identify the staging AppView, bridge and homeserver. Stop the old bridge during
   the authority migration/upgrade; do not run the forgeable writer as fallback.
3. Deploy the paired AppView revision/migration and bridge. Set a dedicated shared
   32–512 character `PARA_AUTHORITY_SERVICE_TOKEN` on both; set bridge
   `BRIDGE_AUTHORITY_APPVIEW_URL`. Never reuse Matrix admin/appservice or M8 tokens
   or expose the secret to clients. The local dev wrapper generates an ephemeral
   shared credential and the dev AppView reads it from the environment.
4. Seed an ordinary member with all four forged roles: no elevated Matrix power,
   cross-chamber visibility, moderation or sortition processing. Test a verified
   moderator grant/revoke and owner handover; inspect actual room power levels.
5. Seed old cached forged authority, restart, and prove startup remediation.
   Exercise authority-source outage, expiry/indexing lag and recovery, including
   MAS-native and minted-session clients. Record fresh-login requirements.
6. Keep delegate/observer and assembly grants closed until their verification
   contracts exist. Record this supported-role scope explicitly.
7. Attach staging URLs, exact revisions, observed results and operator evidence.
   Only then close P0. While staging inputs are pending, proceed with P1's
   existing M8 broker exchange contract; do not repeat this source audit.

## Development integration and validation (2026-10-06)

- Kept the active branch's community-region migration before the new authority
  migrations. Kept its current authority-event schema and explicit known
  action/basis narrowing, feeding the tightened verifier. Retained current
  public cabildeo proof instructions; the unrelated policy-ballot branch was
  not imported as part of the four P0 commits.
- All nine pre-existing Ozone code/test files were preserved byte-for-byte.
  Its separate uncommitted AGENTS instruction was restored and remains outside
  the P0 commits. Shared dev-env builds used the existing working tree; this is
  local integration evidence, not a clean signed release build.
- `pnpm build` passes in AppView, dev-env and matrix-bridge;
  `pnpm typecheck` passes in matrix-bridge.
- Bridge's four focused files pass **59 tests**: `community-authority`, `authz`,
  `firehose` and `matrix-projection`. AppView scoped-credential, role-forgery /
  remediation and delegation-candidate suites pass **30 tests in 3 files**.
  These are the results of this run; the earlier 261/66 results above remain
  historical evidence. No broader notification suite was rerun.
- The current Vite 8 config bundler failed with `sourcemapPathTransform` before
  executing tests. Both suites passed through their normal package scripts
  with `--configLoader runner`; AppView still used its disposable PostgreSQL /
  Redis wrapper, which cleaned up its own test containers afterward.
- AppView's old per-package `node_modules/.bin/tsc` resolved TypeScript 4.5.2,
  causing parser/config errors. Removed only that stale generated shim after
  backing it up outside the repository; package builds now resolve the root
  TypeScript 7.0.2 compiler. No dependencies or tsconfigs were changed.
- Resolved-file ESLint, Prettier and `git diff --check` pass.
- Production Compose now explicitly passes `PARA_AUTHORITY_SERVICE_TOKEN` to
  AppView. Platform `d6c23de` passes the same variable to the bridge and defaults
  its authority source to `https://appview.PARA_DOMAIN`. Rendered the complete
  platform Compose configuration with a test-only credential: both services
  receive identical values and the bridge uses HTTPS. No containers were started
  by this configuration check and no real credential was generated or changed.
- Local PDS, broker and bridge health URLs respond with HTTP 200. Health does
  not prove which authority revision/configuration their running processes use;
  those processes were not restarted or reconfigured by this integration.

Repeat only the relevant checks after a new code change. Commands used from
each package directory with repository Node 22.22.1:

```sh
# services/matrix-bridge
pnpm typecheck
pnpm build
pnpm test --configLoader runner src/community-authority.test.ts \
  src/__tests__/authz.test.ts src/__tests__/firehose.test.ts \
  src/__tests__/matrix-projection.test.ts

# packages/bsky; rebuild before running service integration tests
pnpm build
pnpm test --configLoader runner \
  src/api/com/para/community/getAuthorization.test.ts \
  tests/para-community-role-forgery.test.ts \
  tests/para-delegation-candidate-roles.test.ts

# packages/dev-env
pnpm build
```
