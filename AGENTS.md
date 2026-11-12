# AGENTS.md

## Repository overview

This is the TypeScript reference implementation of [AT Protocol](https://atproto.com), the decentralized social media protocol behind Bluesky. It is a pnpm monorepo (runtime floor Node.js ≥22; local dev is pinned to the 22 major via `.nvmrc` and `devEngines`, upstream's own `.nvmrc` is 24) containing client libraries, schema/codegen tooling, and the two main service implementations: the Personal Data Server (PDS) and the `app.bsky` AppView.

Workspace layout (see [pnpm-workspace.yaml](./pnpm-workspace.yaml) and [tsconfig.json](./tsconfig.json)):

- [packages/\*](packages/) — top-level libraries: `api`, `common`, `crypto`, `identity`, `lexicon`, `repo`, `syntax`, `xrpc`, `xrpc-server`, `pds`, `bsky`, `bsync`, `ozone`, `dev-env`, `dev-infra`, etc.
- [packages/lex/\*](packages/lex/) — the modern type-safe Lexicon SDK family (`@atproto/lex`, `lex-builder`, `lex-cbor`, `lex-client`, `lex-data`, `lex-document`, `lex-json`, `lex-resolver`, `lex-server`, `lex-schema`, `lex-installer`, `lex-password-session`). New service code should use this in preference to the older `@atproto/api` / `@atproto/lexicon` / `@atproto/xrpc` / `@atproto/lex-cli` stack — see the `lex-*` skills listed under [Codegen](#codegen).
- [packages/oauth/\*](packages/oauth/) — OAuth client/provider implementations and JWK helpers.
- [packages/internal/\*](packages/internal/) — `@atproto-labs/*` internal shared utilities (fetch, handle/identity/DID resolvers, simple-store, pipe, xrpc-utils).
- [services/{pds,bsky,bsync,ozone}](services/) — thin runtime wrappers; the actual implementation code lives in `packages/{pds,bsky,bsync,ozone}`.
- [lexicons/](lexicons/) — the canonical JSON Lexicon schemas for `com.atproto.*` and `tools.ozone.*` **only** (this repo is their source of truth), plus this fork's own `com.para.*`. Other namespaces (`app.bsky.*`, `chat.bsky.*`, …) are vendored per-package from the `bsky` repo or the network — see [Codegen](#codegen). [lexicons-overrides/](lexicons-overrides/) holds local override documents shared across packages.
- [interop-test-files/](interop-test-files/) — language-neutral protocol conformance fixtures, copied from [bluesky-social/atproto-interop-tests](https://github.com/bluesky-social/atproto-interop-tests/) (their canonical source, shared across SDKs). Don't edit unless changing protocol-level behavior; any edit must also be contributed upstream.

## Common commands

Whole-repo verification commands (from root):

```bash
# build:tooling → prebuild (codegen) → build:ts → build:ui
pnpm run build [--force]

# TypeScript-only build & typecheck
pnpm run build:ts [--force]

# force code generation (lexicons, protobuf, i18n, utils, etc.)
pnpm run codegen

# style + lint
pnpm run verify
pnpm run style:fix # Avoid, prefer per-file formatting & linting

# lint specific files only
pnpm exec eslint --fix <path>

# format specific files only
pnpm exec prettier --write <path>
```

Per-package work — **always run from inside the package directory**, not from the root:

```bash
cd packages/<pkg>
pnpm run build
pnpm run test
```

Every package ships a `tsconfig.build.json` (composite, with explicit `references` to its workspace deps), and nearly every package with tests adds a `tsconfig.test.json` for the test sources. A package with root-level config/script files (`vitest.config.ts`, `jest.config.cjs`, `lingui.config.ts`, `bin.js`, …) also adds a `tsconfig.config.json` so those files are type-checked — it extends [tsconfig/config.tsconfig.json](tsconfig/config.tsconfig.json) and `include`s the package's own `./*.{ts,js,cjs,mjs}`. When you add such a file to a package that has none, create `tsconfig.config.json` and reference it from the package `tsconfig.json` (`exclude` any root file that pulls `./src` or `./tests` into the program, e.g. a `jest.setup.ts`). The root `tsconfig.json` is a project-graph aggregator only.

Avoid `pnpm run style:fix` (whole-repo prettier) unless the user explicitly asks for a repo-wide formatting pass.

Run the formatter/linter once the work is complete: when about to commit, or when the user says the change is done, not after every small edit.

## Tests

For Ozone integration tests, verify state through existing endpoints (for example, `queryEvents` for appeal events and `queryReports` for report state). Use direct database access only for fixtures that cannot be created through an API, or for tests specifically exercising database behavior.

Before writing or extending any test, invoke the `testing` skill ([.agents/skills/testing/SKILL.md](.agents/skills/testing/SKILL.md)). It covers runner selection (vitest vs jest), file layout, and tsconfig setup. For browser-driven UI tests, or for demoing/debugging the OAuth flows or the Account Manager interface, invoke the `playwright` skill ([.agents/skills/playwright/SKILL.md](.agents/skills/playwright/SKILL.md)) instead.

## Codegen

The repo-root [lexicons/](lexicons/) holds the canonical `com.atproto.*` / `tools.ozone.*` schemas **only** — this repo is their source of truth. (This fork also keeps its `com.para.*` schemas there; `pds` and `bsky` resolve them with the same `directory` resolver.) Every other namespace (`app.bsky.*`, `chat.bsky.*`, `site.standard.*`, …) is vendored **per package**: each package lists the NSIDs it needs and where to resolve them (the root `lexicons` directory, the `bsky` GitHub repo, the network, or the shared [lexicons-overrides/](lexicons-overrides/)) in its own committed `lexicons.json`. A package's `prebuild` runs `lex install --ci` (resolving JSON into its gitignored `./lexicons`) then `lex build` (generating the gitignored `./src/lexicons` TypeScript tree that code imports). **Full how-to: the ["Working with lexicons"](CONTRIBUTING.md#working-with-lexicons) section of CONTRIBUTING.md and the `lex-setup` skill.**

- **Add/refresh an external lexicon in a package:** `cd packages/<pkg> && pnpm lex:install <nsid>` (adds it plus transitive deps); `pnpm lex:update` refreshes installed ones.
- **Edit a canonical lexicon:** change it under [lexicons/](lexicons/), then run `pnpm lex:update-local` from the repo root to propagate the new CID into every dependent package's `lexicons.json`. (After editing a `.proto` file instead, run `pnpm codegen` from the root.)

For working with the generated SDK, invoke the focused skills under [.agents/skills/](.agents/skills/): `lex-setup` (lexicons.json / resolvers / codegen wiring), `lex-schema` and `lex-data` (schemas and values), `lex-client` (calls out), `xrpc-server` (defining server routes), and `lexification-client` / `lexification-server` (migrating off the legacy stack).

## Architecture notes

- **A community is an account; its old records are retired.**
  `assertCommunityRepoWrites` refuses new `board`, `membership`, `governance`,
  `roleAcceptance`, `authorityEvent`, `relation` and `sharedContentAction`
  records in every repo (deletes pass). Found a community with
  `com.para.community.create`, change it with `com.para.community.act`; fixtures
  use `packages/dev-env/src/seed/community-account.ts`, never raw records.

- A community's authority is its chain's alone: a member's own record never
  grants an office, and a record that changes what a community shows is
  replaced by a chain event (`CommunityEffect`). PDS routes ask the AppView's
  `getAuthorization` for offices, never a local record.
  `PARA_AUTHORITY_SERVICE_TOKEN` is a dedicated read credential for the
  bridge's specified-subject authorization query; redact its header, disable
  caching, and never reuse admin/M8 credentials. Voter eligibility everywhere
  (ballot indexing, tallies, delegations) goes through `filterActiveMembers`,
  which is the chain's active members, so no self-written record is a vote.
  Every community stays hierarchical (the owner appoints moderators). Assembly
  decisions ground no chain event yet: a cabildeo's `protectedAction` is a claim
  only, and the fixed quorum and threshold rules (`evaluateAssemblyVote`,
  `ASSEMBLY_DECISIONS` in `@atproto/common`) wait for a chain action that
  verifies a cabildeo's final tally, as `verifyAssemblyDecision` once did for
  authority events. Do not read quorum from a record the owner publishes.

- **`com.para.civic.cabildeo` is the only proposal, deliberation and decision
  pipeline.** Reactions to arguments are `deliberationVote` on a
  `civic.position` (no m8 proof, OD-7 §5h); a decision is a cabildeo's
  server-computed final tally, and its `protectedAction` is a claim only.
  `com.para.community.proposal`, `deliberation` and `decision` have no
  lexicon, route or indexer any more (their old `para_deliberation_statement`
  rows stay, read only by Influence): do not bring them back or add a second
  tally anywhere (the Matrix bridge decides nothing). A cabildeo that is to
  ground a chain event must name its community account, have exactly two
  options (the first approves), and still be the record version voting opened in
  (`cabildeo_close_policy.recordCid`).

- **OD-9 community accounts** ([docs/OD-9-COMMUNITY-ACCOUNTS.md](docs/OD-9-COMMUNITY-ACCOUNTS.md))
  replaced board records and authority events (phase 5); the AppView keeps
  neither their indexers nor their tables.
  A community repo is written only by its host's `com.para.community.act`;
  generic writes to it are refused. `act` and the AppView fold both decide
  with `applyCommunityEvent` (`@atproto/common`): never re-implement its rules.
  Each event carries its request proof and verifies alone, so the fold stays a
  pure function of the community repo: no `indexedAt`, no other repo's
  arrival. A fork, broken `prev` or rewritten event re-folds and freezes it.
  Read membership and offices only through `community-membership.ts` or
  `getAuthoritySnapshots`; a community is named by its URI (an account's is its
  `com.para.community.profile/self`), and any other URI has no members. Never
  query the member tables directly. Resolve accounts by URI, DID, handle or slug, never display name.
  An action that touches state outside membership (content, relations,
  briefing packs) returns it as a `CommunityEffect` in the policy's patch: the
  host ignores it and the AppView stores it. Serve those views for an account
  from `community-content.ts`, never from member-authored records. No chain
  sees a relation cycle across communities, so `accountRelationRows` sets
  aside every relation on one at read time; `listOpenOffers` shows a
  non-steward only the offers that name them.

- Pilot planning: read [docs/QUARTER_PLAN_2026Q4.md](docs/QUARTER_PLAN_2026Q4.md)
  and its evidence before auditing or scheduling work. It is the canonical
  remaining-work queue, re-baselined 2026-10-05; the old sprint calendars are
  superseded. Inspect only relevant changes, distinguish implemented/tested/
  merged/deployed, and remove closed actions from active roadmaps while retaining
  linked evidence. Status belongs in that plan, not here. Do not re-integrate the
  old worktrees or repeat the completed source audit.

- Public cabildeo and policy votes require `verifyPublicBallotProof` before PDS
  preparation and AppView indexing, including foreign repositories. A policy
  ballot's `signal` is bound by its `m8:policy:v1` authorization. `PARA_CIVIC_VOTE_VERIFIER_URL`
  is operator configuration; absent/unavailable verification must never fall
  back to account-only deduplication. This MAC authorization is not anonymous
  voting. `civic.delegation` carrying `signal` is also refused by the shared policy.
  Every path that writes a ballot-shaped record must go through
  `ballotWritePolicyRefusal` (`@atproto/common`); do not re-compose its checks
  inline.

- The dev-env seed (`packages/dev-env/src/seed/para-policies.ts`) adds policies
  filed under each of the six official matter groups and casts public policy
  ballots from the demo accounts, leaning by party. The proofs come from the
  dev-env verifier (`devPolicyVoteProof`), signed with a key that exists only
  there. A policy tally and `com.para.civic.getPolicyCommunityVotes` count only
  ballots from identities `filterActiveMembers` holds active in the policy's
  community when read (OD-10 §7.7), never a 0 signal (`isPolicySignal`, §7.5);
  the community view is gated to members of that community.

- `packages/bsky/src/governance-lab` is a synthetic reference only. Its
  `g1-follow-signal-v1` policy is provisional; never import it into production
  handlers or treat its publication threshold as an anonymity guarantee.
  PARA's local lab compiles this same source instead of copying tally formulas.

- Legacy QV ballot reads remain frozen independently of the experiment flag:
  `quadratic-voting-gate.ts` refuses enabled callers with `BallotPrivacyUnavailable`.
  Reopening requires the private publication path in OD-7, including protection
  against differencing aggregates. Delegation payloads must bind the delegator
  to the repository owner before indexing voting power.

- **Lexicons are the contract.** Lexicon schemas drive both client types and server route validation. Service packages don't hand-write XRPC method signatures — they import the generated definitions from their `src/lexicons/` directory (gitignored; regenerated from the package's `lexicons.json` — see [Codegen](#codegen)).
- **AppView `com.para` routes register generated schemas.** `packages/bsky` installs `com.para.*` from the root `lexicons/` through its `lexicons.json`, and every route calls `server.add(com.para.…, cfg)`. To serve a new method, `pnpm lex:install <nsid>` in that package; never hand-write a `LexiconDoc` or use `server.method()`. `server.add` passes undeclared query params through to the handler, so read only declared ones. Bind write-endpoint DIDs to `auth.credentials.iss`, never the payload.
- ([packages/pds](packages/pds)) — a single-tenant atproto server: account management, repo storage (kysely-over-sqlite), actor storage (kysely-over-postgres), email, OAuth provider, blob storage. Runtime entry point is [services/pds](services/pds); production code is in `packages/pds/src`.
- Outbound requests to a URL resolved from a DID document are untrusted. Make them with `ctx.safeClient(url).xrpc(…)`, never a bare `xrpc(url, …)`, which uses the global fetch and bypasses the https-only/unicast-only checks. (`ctx.proxyAgent` is a separate thing — an undici `Dispatcher` used by pipethrough.)
- ([packages/bsky](packages/bsky)) — read-side service for `app.bsky.*` queries (timelines, profiles, feed generators, hydration pipeline, GraphQL-like view composition). Talks to PDSes via XRPC and to `bsync` via Connect-RPC (protobuf in `packages/bsky/proto`). Runtime entry point in [services/bsky](services/bsky).
  - `app.bsky.feed.getFeed` forwards passthrough headers to a feed generator only when its record's service DID is in `bskyFeedgenDids`; Iris routing overrides do not grant permission.
- ([packages/bsync](packages/bsync)) — internal service for cross-AppView synchronization (mutes, notifications). Connect-RPC interface.
- ([packages/ozone](packages/ozone)) — moderation service for `tools.ozone.*`.
  - Design viewer queries for hundreds of millions of moderation events and tens of millions of reports. Batch hydration, bound returned rows, and check query plans against existing indexes before proposing new ones. Keep viewer projections explicit and test ownership and private-field isolation through the API.
- Large report-table backfills run in the daemon as bounded primary-key batches. Lock a `job_cursor` row and commit each batch; schema migrations should add nullable columns only. After legacy report writers have rolled off, run `UPDATE job_cursor SET cursor = NULL WHERE job = 'report_reporter_did_backfill'` for a catch-up sweep. Advance past rows with missing or invalid source events and log their counts so they cannot stall the worker.
- **Spaces is pinned, not forked.** Runtime source in `packages/space` and canonical space/simplespace lexicons follow [packages/space/SOURCE](packages/space/SOURCE). Advance the whole pin and adapt PDS callers together. Historical vlpds vectors include intentionally rejected legacy signatures; they do not establish current peer interoperability. A STAR stream's records are trusted only after complete consumption verifies the final set hash.
- **The PDS hosts only its accounts' own space repos** ([api/com/atproto/space](packages/pds/src/api/com/atproto/space)), behind `PDS_SPACES_ENABLED`. Their auth is `authVerifier.spaceAuthorization` (OAuth only, CD-P3); the handler checks the `space:` grant. Writes go only into spaces the writer governs and may not carry blobs. Any other `com.atproto.space.*` / `simplespace.*` method answers 501 in `pipethrough.ts` and is never proxied, and `getServiceAuth` refuses them. Space tables arrive by migration, so handlers call `actorStore.ensureLatestSchema` first. It also runs a simplespace host for spaces the account owns ([simplespace](packages/pds/src/simplespace)): member-list policy only, no members besides the owner until credentials exist.
- **Space-only collections** (`SPACE_ONLY_COLLECTIONS` in `packages/pds/src/repo/prepare.ts`, today `com.para.collection.record`) are refused in a public repo. Private PARA data gets a record lexicon in this set, never a visibility flag (CD-P2).
- ([packages/dev-env](packages/dev-env)) — boots a full PDS + AppView + bsync + plc + ozone constellation in-process for tests. `make run-dev-env` is the persistent PARA development profile; `make run-demo-env` runs the disposable full demo without Matrix provisioning. Most integration tests in `pds`/`bsky`/`ozone` use it as a fixture builder.

## Conventions

**Code style rules live in [STYLE_GUIDE.md](./STYLE_GUIDE.md)** — imports, typing, dependencies, change scope, and formatting. Read it before writing code. The rest of this section covers repository mechanics only.

- Node ≥22 runtime floor for published packages; **local dev is pinned to security-patched Node 22 releases** (`devEngines.runtime`, `onFail: error`), so `pnpm` refuses to run on any other major — `nvm use` picks it up from `.nvmrc`. CI changeset/build/verify/publish jobs read the range from `package.json`; compatibility tests require the same patched Node 22 minimum in `.github/workflows/repo.yaml`. Upstream also permits patched Node 24 and 26 releases; this fork's Node 22 pin is deliberate, so do not widen it to make a tool happy. Native modules are compiled per Node ABI: after switching versions, `pnpm rebuild better-sqlite3`, or the pds/bsky test suites fail to boot. Use `node --enable-source-maps` for production-style runs.
- **Service images build from upstream's root `Dockerfile`** (one target per service; compose files use the same targets). Its only fork deltas are the Node 22 base images and `pnpm fetch --ignore-scripts` (matrix-bridge's crypto library has no linux-arm64-musl build); keep it that close so syncs stay clean. `services/{pds,bsky,bsync,ozone}` follow upstream, plus the fork's `services/bsky/dataplane.ts`. `make check-fork` also fails on files upstream deleted that the fork still tracks.
- **`natural` is loaded on first use in `discourse-nlp.ts`, through `createRequire`. Keep it that way.** Its `SentimentAnalyzer` does `require('afinn-165')`, which is ESM-only: plain Node handles that from 22.12 on, but jest's registry cannot `require()` ESM before Node 24.9, so a top-level import made every suite that merely reaches that file fail to load — ozone's included, since its fixtures pull `@atproto/bsky` in through dev-env, and none of them call `analyzeDiscourse`. `createRequire` resolves through Node's own loader rather than the runner's, which is the one that supports `require(esm)` on the pinned Node 22. A plain top-level `import` there breaks the ozone suites again.
- TypeScript compilation uses the native TS7 `tsc` (the standard `typescript` package). There is no per-package `typescript` devDependency — it is hoisted at the root. Note TS7 has no stable programmatic API yet; tools needing one must pin TS6.
- **Every package touched by a change needs a changeset entry.** Add a file under [.changeset/](.changeset/) listing each modified package with an appropriate bump level (pre-v1 breaking changes are `minor` and everything else `patch`, post-v1 `major` for breaking changes, `minor` for new public API, `patch` otherwise). Dependency-only bumps are generated automatically — don't list them by hand. Create that file with `pnpm changeset`.
- **Never buffer an unbounded stream from outside the process.** Decoding or buffering a request/response body that did not originate locally requires an explicit size bound on the _decoded_ bytes — a wire-size cap does not bound a compressed payload. Pass `maxSize` (and `maxSizeError` for the caller’s error type) to `createDecoders` and pipeline the result, including for identity encoding (see `packages/xrpc-server/src/util.ts`); this bounds each decoding stage.

- **Do not hide a failing test to get CI green.** `.github/ci/run-tests.mjs` gates on the failing files listed in `.github/ci/known-failing-tests.json`; a new failure is red, and a listed file that passes is red until its entry is deleted, so the list only shrinks. See [docs/CI.md](docs/CI.md).

## Agent files

Agent files — this `AGENTS.md`, the skills under [.agents/skills/](.agents/skills/), and any package-level equivalents — are part of the codebase and must stay in sync with it.

- Keep working plans, handoffs, review reports, query-plan captures, and other session scratch files outside the repository, such as in the workspace directory containing the checkout. Do not add repository ignore rules for them. Never commit them. Before committing, inspect the staged file list for working documents; put only durable project guidance in tracked documentation.

- These files capture **important architectural patterns and conventions** — the non-obvious rules, invariants, and cross-cutting decisions an expert needs that are _not_ evident from reading the code itself. They are not a changelog of behavior, and must not restate anything a reader can infer directly from the code (a route's signature, a function's arguments, what a module exports). Most changes need no update: don't document a new route, metric, migration, or test that simply re-applies an existing pattern. Reach for an edit only when a change establishes, meaningfully alters, or removes such an architectural pattern, and prefer doing it when wrapping up rather than mid-task. If you do, update the file that owns it (repo-wide → this file or [STYLE_GUIDE.md](./STYLE_GUIDE.md); scoped to one package → that package's nested `AGENTS.md`; a workflow an agent follows → the relevant skill), and delete guidance a change makes obsolete in the same pass — stale guidance is worse than none. Reviewers check for drift as a backstop (see [.github/claude-review-prompt.md](.github/claude-review-prompt.md)).
- Keep them **as concise as possible**: only the minimal directives an expert needs. No tutorials, no restating what the code already says.

## Troubleshooting

- **Integration tests run stale service code.** `@atproto/dev-env` loads services through their package exports from `dist`. After changing service code, run `pnpm run build` inside that service package before rerunning its integration tests.
- **Stale codegen.** If the build fails due to a generated file in [packages/api](packages/api) being out of date, run `pnpm run codegen && pnpm run build` from that package, then re-run the build. This is only needed there because its `prebuild` step skips codegen as a performance optimization.
- **Codegen ran but produced stale output.** Codegen relies on `pnpm build:tooling` to build the `@atproto/lex-cli` and `@atproto/lex-builder` packages first. If you see a codegen failure, run `pnpm build:tooling` from the root, then re-run codegen.
- **End-to-end test fails with stale infra.** If docker containers persist across test runs, reset them with `cd packages/dev-infra && docker compose down --volumes`.
- **Nothing else worked.** `make clean` wipes every installed dependency (`node_modules`), build artifact (`dist`, `*.tsbuildinfo`), and prebuild/codegen output across all packages; follow it with `pnpm install && pnpm run build` to restore a clean state.

## Influence

- Influence counts indexed public reactions across authored content, never post
  metadata scores or identity-service Karma awards. Signed reactions override
  a legacy like by the same actor on the same subject; neutral cancels it.
- `getProfileStats` reads current totals and profile `revealInfluence` (default
  false). Owners can always read their score. Do not cache its response by actor
  alone: it withholds Influence and received totals from other viewers when hidden.
