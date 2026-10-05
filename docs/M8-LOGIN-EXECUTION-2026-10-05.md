# M8 login — implementation and remaining acceptance

Updated 2026-10-05. This records P1 evidence for
[the canonical pilot queue](./QUARTER_PLAN_2026Q4.md); it is not a second roadmap.

## Revisions and status

| Repository | Local candidate | Status |
| --- | --- | --- |
| PARA | `b303625db`, `feat/personal-civic-tree-revamp` | Committed; focused local checks pass. Full-app type checks remain blocked by separate working-tree edits. |
| mubEZ | `061dc23`, `feat/nullifier-v2` | Committed; broker build and focused tests pass. |

No push, release-branch integration, staging deployment, live PDS login or
native-device acceptance was performed. PARA's unrelated Map/Messages/tree,
AtCard, OTA, native-screen patch and dependency edits remain outside this commit.
WatZappa's unrelated Ozone changes remain outside this documentation update.
P0's role candidate and rollout status are unchanged. PARA's implementation
commit is `798cf7e78`, followed by credential-read serialization at `b303625db`;
broker implementation `ff47821` is followed by immutable code binding and its
upgrade migration at `061dc23`.

## Implemented

- Explicit Connect uses the signed-in PARA DID. Native browser auth returns to
  `para://m8-auth`; web returns to the origin's `/m8-auth`. Both exchange the
  callback code automatically. The old free-form account entry/manual status
  check has been replaced. Background hooks do not launch real OAuth.
- The handoff binds DID, exact callback, attempt, expiry and PKCE S256 verifier.
  PARA validates returned bindings; the broker verifies the requested DID and
  does not consume codes with a wrong attempt/verifier. Codes retain their
  verifier requirement independently of audit-row cleanup. The strengthened fields
  are additive for existing iM8 clients; new PARA requires the updated broker.
- Web initialization completes the grant after restoring the persisted account,
  removes the callback query before exchange, and restores a safe internal route
  before mounting the router. Native cancellation/timeout, malformed callbacks,
  stale accounts and credential-write failures do not save a new session.
- Account transitions and logout invalidate in-flight work. Refresh saves both
  rotated tokens with one shared refresh request. Old broker/bridge responses
  cannot refresh, retry or clear the new account's session.
- Native release credentials require SecureStore. Web bearer tokens stay in
  memory; only the temporary callback binding/error lives in that tab's
  sessionStorage. Legacy persisted web bearer keys are removed. Reloading the
  web page requires reconnecting; persistent web M8 sessions are not delivered.
- Broker logout revokes the presented refresh credential's replacement chain
  within its authenticated session, preserving other devices. Concurrent refresh
  has one winner and cannot issue a replacement after revocation. Existing
  access JWTs remain valid until expiry; offline logout cannot confirm server
  revocation. Incoming OAuth provider query/error details are excluded from
  handoff redirects.

Contract and configuration:
[broker rollout notes](/Users/mlv/Desktop/Home/macserver/mubEZ/docs/PARA_OAUTH_HANDOFF.md),
[PARA login notes](/Users/mlv/Desktop/Home/macserver/PARA/docs/M8_LOGIN.md). Broker migrations
`040_oauth_exchange_binding.sql` and `041_oauth_code_binding_retention.sql` must
be deployed before the new client. The latter backfills existing bindings and
invalidates outstanding codes whose prior attempt is missing.

## Local validation

- PARA: **60 tests passed in 8 files**: grant, native browser adapter, web callback,
  web credential storage, PKCE vector, legacy/dev session binding, wallet and
  Matrix bridge client regression suites. Fetch/browser/window/native storage
  use test doubles; these results are not device/browser/provider acceptance.
- Login core type checks pass with iOS, Android and web module resolution.
  Temporary configs extended the repository's corresponding platform config,
  included grant/webGrant/ensureSession/authorization/credentialStorage and
  their imports, and pointed `typeRoots` at PARA's installed `node_modules/@types`.
- Changed production TypeScript files: oxlint has no errors. Three pre-existing
  App/session warnings remain (state naming/destructuring and `ax` dependency).
  PARA's commit hook also ran oxlint and prettier successfully.
- PARA web server: `go test ./cmd/bskyweb -run '^$'` passes compilation; no tests
  were selected by that command. Serving a deployed `/m8-auth` still needs QA.
- Broker: **26 distinct focused tests passed** across sessions, OAuth-gated start,
  exchange-code service, handoff URLs PARA exchange/logout integration, and populated-schema binding migration.
  Completed OAuth sessions were seeded; no successful live-provider grant was
  used. A real HTTP provider-error callback test proves the sanitized redirect.
- Broker TypeScript/build pass via `node ace build`; migrations 040–041 are included
  in the build output. The callback fixture emits the existing OAuth library's
  missing-lock warning; multi-worker OAuth concurrency remains unaccepted.

PARA full-app `tsconfig.check.ios.json`, `.android.json`, and `.web.json` were
attempted and are **not green**. At validation time, separate uncommitted edits
reported unresolved `#/components/icons/Attie`, unresolved `#/lib/at-card`,
`useOTAUpdates.ts:521` possibly undefined (native), and missing
`revertToEmbedded` in `Settings.tsx:399`. None of the reported errors were in
this login implementation. Resolve the relevant release edits and rerun the
full checks; a focused core check does not substitute for a release build.

Focused test commands, from their respective repository roots with Node 24.18.0:

```sh
# PARA; explicit paths avoid tests in nested .claude/worktrees checkouts.
NODE_ENV=test ./node_modules/.bin/jest --runInBand --forceExit \
  --modulePathIgnorePatterns='\.claude/worktrees/' --runTestsByPath \
  src/lib/im8/ensureSession.test.ts src/lib/im8/grant.test.ts \
  src/lib/im8/authorization.test.ts src/lib/im8/webGrant.test.ts \
  src/lib/im8/wallet.test.ts src/lib/im8/credentialStorage.web.test.ts \
  src/lib/im8/exchangeBinding.test.ts src/lib/matrix/bridge.test.ts

# mubEZ; use a free nonzero port, sequential files and loopback to avoid
# collisions with the existing local broker. Port zero fails env validation.
NODE_ENV=test HOST=127.0.0.1 PORT=25437 ./node_modules/.bin/tsx \
  --test --test-concurrency=1 --test-force-exit \
  tests/unit/oauth-handoff.test.ts tests/unit/oauth-exchange-codes.test.ts \
  tests/unit/oauth-code-binding-migration.test.ts \
  tests/integration/para-oauth-exchange.test.ts \
  tests/integration/oauth-gated-start.test.ts tests/integration/sessions.test.ts
```

## Next work; do not repeat this audit

1. Select the paired release revisions and resolve full-app release build
   blockers. Establish the actual staging broker/PARA/Matrix/bridge origins;
   the previously checked production DNS did not establish a working target.
2. Back up and migrate the broker; set effective handoff on, dev bootstrap off,
   exact native/web callbacks, HTTPS service/metadata origin and web CORS origin.
   Build PARA with the selected broker origin and confirm the SPA callback route.
3. Run fresh real-provider login on iOS, Android and the supported web client.
   Record cancellation/back, expired/replayed code, wrong account, account switch,
   refresh, local/remote logout and SecureStore behavior. Confirm the configured
   access JWT TTL rather than describing refresh revocation as immediate logout.
4. Confirm whether reconnecting M8 after web reload is acceptable for the pilot.
   If persistence is required, implement and accept an appropriate web-session
   design before closing P1. Do not put bearer tokens back into localStorage.
5. Record configuration, exact revisions and observed results here. Close P1
   only with supported-client evidence, then use the real session for P2's
   existing Matrix grant/join checks. P0's trusted-role rollout still has to pass.

Rollback: revert the paired application revisions as needed; the optional
migration columns can remain. Keep legacy iM8 callbacks when supported. Do not
roll back by enabling dev bootstrap or demo break-glass on production.
