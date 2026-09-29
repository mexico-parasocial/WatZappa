# @atproto/dev-env: Local Developer Environment

A command-line application for developers to construct and manage development environments.

[![NPM](https://img.shields.io/npm/v/@atproto/dev-env)](https://www.npmjs.com/package/@atproto/dev-env)
[![Github CI Status](https://github.com/bluesky-social/atproto/actions/workflows/repo.yaml/badge.svg)](https://github.com/bluesky-social/atproto/actions/workflows/repo.yaml)

## REPL API

The following methods are available in the REPL.

### `status()`

List the currently active servers.

### `startPds(port?: number)`

Create a new PDS instance. Data is stored in memory.

### `stop(port: number)`

Stop the server at the given port.

### `mkuser(handle: string, pdsPort?: number)`

Create a new user.

### `user(handle: string): ServiceClient`

Get the `ServiceClient` for the given user.

## Image memes for PARA UI development

The disposable `make run-dev-env` keeps its demo seed and uses a fresh Matrix
bridge database on every run. For sessions that must survive restarts, use
`make run-dev-env-persistent` from the repository root. It uses the coherent
`.dev-env-data` PDS, PLC, blob store, and a separate bridge database and
PostgreSQL namespace. It does not run the full demo seed at startup.
Stopping it releases the PDS and bridge ports; the durable PostgreSQL and
Redis containers stay up so their volumes remain available.

The persistent demo accounts `alice.test`, `bob.test`, and `carla.test` use
`para-test-pw`; internal service accounts keep their own passwords. Run
`make seed-memes-persistent` to upsert the image fixtures into Alice's account.
Repeating that target updates the same eight records. For the disposable mode,
the `seed:memes` command below still defaults to `hunter2`.

The persistent launcher checks account signing keys against the local PLC
before starting. If it reports missing DIDs, check that the PDS and PLC came
from the same data directory; do not point the bridge at a different profile's
SQLite database. Previously used `~/.paramx-demo` data is not part of this
profile.

With the local dev environment running, from this package directory:

```sh
pnpm run build
pnpm run seed:memes
```

The command signs in as `alice.test` (`hunter2`) on `http://127.0.0.1:2583`,
uploads bundled images from `assets/`, and upserts eight `com.para.post`
records with `postType: meme` and matching metadata. Repeating the command
updates the same records. To use another development account, set
`SEED_PDS_URL`, `SEED_IDENTIFIER`, and `SEED_PASSWORD`.

The full PARA demo seed includes these images automatically. After changing
backend code, restart the dev environment to load the compiled changes.
Refresh the Memes screen in board mode, then select deck mode. Clear active
compass filters to see the unscoped demo memes. Edit `src/seed/para-memes.ts`
to change the captions and local image filenames.

## License

This project is dual-licensed under MIT and Apache 2.0 terms:

- MIT license ([LICENSE-MIT.txt](https://github.com/bluesky-social/atproto/blob/main/LICENSE-MIT.txt) or http://opensource.org/licenses/MIT)
- Apache License, Version 2.0, ([LICENSE-APACHE.txt](https://github.com/bluesky-social/atproto/blob/main/LICENSE-APACHE.txt) or http://www.apache.org/licenses/LICENSE-2.0)

Downstream projects and end users may chose either license individually, or both together, at their discretion. The motivation for this dual-licensing is the additional software patent assurance provided by Apache 2.0.
