# CI on the fork

Workflows live in `.github/workflows/`. Upstream's are kept so syncs stay a
merge; the ones that publish artifacts as Bluesky stay disabled on this repo.

## What gates a merge

`Repository CI` (`repo.yaml`) runs on every PR and on every push to `main`:

| Job           | Runs                                                                               |
| ------------- | ---------------------------------------------------------------------------------- |
| Changeset     | `changeset status` against the PR base (PRs only)                                  |
| Build         | `pnpm build` (codegen, `tsc --build`, `build:ui`), uploads `dist`                  |
| Test (1..8/8) | `.github/ci/run-tests.mjs`, every package's tests, sharded                         |
| Verify        | `pnpm verify`: eslint, prettier, `import '@atproto/{bsky,pds}'`                    |
| Matrix bridge | `@para/matrix-bridge` typecheck and tests, SQLite and a Postgres service container |
| Para IdP      | `@para/para-idp` typecheck and tests                                               |

Node comes from `devEngines.runtime` (`^22.23.4`, a patched release). Do not
widen it to make a tool or a local machine pass. On an older 22, install a
current one (`nvm install 22`). The `pnpm_config_runtime_on_fail=ignore`
override works but makes pnpm rewrite `devEngines.runtime.onFail` in
`package.json`; run `git checkout package.json` before you commit.

## Known-failing tests

`pnpm --recursive test` stops at the first failing package, so one broken
suite hid every package after it. `.github/ci/run-tests.mjs` runs all of them
and compares the failing test files with `.github/ci/known-failing-tests.json`
(`file -> why`; `pkg:<dir>` for a package whose runner never reached its tests).

- A failing file that is not listed turns CI red.
- A listed file that ran and passed also turns CI red: delete the entry in the
  change that fixes it. The list only shrinks.
- Do not add an entry to get a PR green. Add one only for a failure that
  already exists on `main`, with the reason and where it is tracked.

Run it locally the same way CI does:

```bash
node .github/ci/run-tests.mjs --only packages/bsky --maxWorkers=1
```

## Images and publishing

The `build-and-push-*-{aws,ghcr}.yaml`, `publish.yaml` and `sync-internal.yaml`
workflows are guarded by `github.repository == 'bluesky-social/atproto'` and
stay that way.

- `*-aws` need Bluesky's AWS roles, `publish.yaml` publishes `@atproto/*` to
  npm and `sync-internal.yaml` pushes to Bluesky's internal repository. None of
  them can or should run here.
- `*-ghcr` would work under `ghcr.io/mexico-parasocial/watzappa`, but they push
  an unsigned image per commit to `main`, with moving tooling (`checkout@v3`,
  buildx v2) and Dockerfiles that are still being reworked for the fork's
  deployment. That is not the signed, reproducible release candidate the pilot
  plan (P4) asks for. Image publishing belongs in a release workflow that
  builds by digest from a tag, signs it and records the provenance; until then
  deployments build their images from the tagged commit.

If you only want to know that the images still build, add a PR job that runs
`docker build` per `services/*/Dockerfile` without pushing, once those
Dockerfiles settle.

## Branch protection for `main`

Settings, Branches, rule for `main`:

- Require a pull request before merging; require the branch to be up to date.
- Required status checks: `Changeset`, `Build`, `Test (1/8)` .. `Test (8/8)`,
  `Verify`, `Matrix bridge`, `Para IdP`.
- Do not allow bypassing for administrators once the checks are green on `main`.
- Block force pushes and deletion.

A skipped required check counts as passing. That is how draft PRs and
Dependabot PRs (no `Changeset` run, so no `Build`) get through, and GitHub does
not let a draft PR merge anyway. Dependabot PRs do not get the full gate.
