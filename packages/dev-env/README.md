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

## Local PARA development

Run `make run-dev-env` from the repository root for everyday development.
It keeps the PDS, PLC, blobs, and bridge cursor together in `.dev-env-data`
and uses the `para_local` PostgreSQL namespace. Do not mix these with another
profile's database. The existing `run-dev-env-persistent` target is an alias.
The full demo seed does not run in this profile.

Use `make run-demo-env` only for a disposable full demo. It starts a fresh PDS
and does not start the Matrix bridge, so its demo communities do not create
rooms in the durable Synapse stack. Demo accounts have no civic eligibility
proof: the seed skips cabildeo votes and delegations instead of reporting
rejected writes as successes.

## Image memes for PARA UI development

The persistent profile imports images from `assets/memes/` into `alice.test`
at startup. Add `.jpg`, `.jpeg`, `.png`, or `.webp` files there and restart
to populate the Memes screen with your own images.
Stopping it releases the PDS and bridge ports; the durable PostgreSQL and
Redis containers stay up so their volumes remain available.

The persistent demo accounts `alice.test`, `bob.test`, and `carla.test` use
`para-test-pw`; internal service accounts keep their own passwords. A fresh
profile creates Alice with `para-test-pw` for these fixtures. The optional
`make seed-memes-persistent` target refreshes the images without restarting.
For the disposable demo, `seed:memes` still defaults to `hunter2`.

The persistent launcher checks account signing keys against the local PLC and
verifies the migration order before starting. It repairs the known PDS account
migration `008` gap after saving an SQLite backup under `.dev-env-data/backups/`;
other unexpected orders stop with an error. Keep the PDS, PLC, and bridge data
together. Previously used `~/.paramx-demo` data is not part of this profile.

For the disposable `make run-demo-env` profile, or to refresh images without
restarting the persistent profile, run this from the package directory while
the PDS is running:

```sh
pnpm run build
pnpm run seed:memes
```

The command signs in as `alice.test` (`hunter2` by default) on
`http://127.0.0.1:2583`,
uploads images from `assets/memes/`, and upserts `com.para.post`
records with `postType: meme` and matching metadata. Repeating the command
updates the same records. To use another development account, set
`SEED_PDS_URL`, `SEED_IDENTIFIER`, and `SEED_PASSWORD`.

The full PARA demo seed includes these images automatically. After changing
backend code, restart the dev environment to load the compiled changes.
Refresh the Memes screen in board mode, then select deck mode. Clear active
compass filters to see the unscoped demo memes. Add images to `assets/memes/`
and restart to see them in the persistent profile.

## License

This project is dual-licensed under MIT and Apache 2.0 terms:

- MIT license ([LICENSE-MIT.txt](https://github.com/bluesky-social/atproto/blob/main/LICENSE-MIT.txt) or http://opensource.org/licenses/MIT)
- Apache License, Version 2.0, ([LICENSE-APACHE.txt](https://github.com/bluesky-social/atproto/blob/main/LICENSE-APACHE.txt) or http://www.apache.org/licenses/LICENSE-2.0)

Downstream projects and end users may chose either license individually, or both together, at their discretion. The motivation for this dual-licensing is the additional software patent assurance provided by Apache 2.0.
