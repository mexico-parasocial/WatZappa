# WatZappa

WatZappa is the backend for the PARA social app and a fork of [Bluesky's AT Protocol TypeScript reference implementation](https://github.com/bluesky-social/atproto). It brings together a Personal Data Server (PDS), AppView, synchronization and moderation services, and a Matrix bridge for PARA's social and community features.

## About AT Protocol

The [Authenticated Transfer Protocol (atproto)](https://atproto.com/) is a decentralized protocol for social applications. It provides shared foundations for accounts, repositories, federated services, and applications such as Bluesky and PARA. Applications describe their records and APIs with [Lexicon schemas](https://atproto.com/specs/lexicon).

- [AT Protocol overview and guides](https://atproto.com/guides/overview)
- [Protocol specifications](https://atproto.com/specs/atp)
- [AT Protocol discussions](https://github.com/bluesky-social/atproto/discussions)

## Repository structure

- [`packages/`](./packages/) contains the TypeScript libraries and service implementations. See the [package overview](./packages/README.md).
- [`services/`](./services/) contains deployable service wrappers and container entrypoints.
- [`lexicons/`](./lexicons/) contains the canonical `com.atproto.*` and `tools.ozone.*` schemas, as well as PARA schemas maintained in this fork. Published `app.bsky.*` and `chat.bsky.*` schemas are maintained in [bluesky-social/bsky](https://github.com/bluesky-social/bsky) and vendored per package; copies here may lag their source. See [working with Lexicons](./CONTRIBUTING.md#working-with-lexicons) for source and code generation details.
- [`lexicons-overrides/`](./lexicons-overrides/) contains shared local schema overrides.
- [`deploy/`](./deploy/) contains deployment assets for bare-metal, Matrix, and reverse-proxy setups.
- [`tsconfig/`](./tsconfig/) contains shared TypeScript configuration.

For new AT Protocol clients, start with [`@atproto/lex`](./packages/lex/lex/README.md), which provides Lexicon-based types and an XRPC client. [`@atproto/api`](./packages/api/README.md) is the older client and remains in use in parts of this repository. The [`packages/oauth/`](./packages/oauth/) directory contains OAuth implementations for browser, Node.js, and Expo clients, plus the provider.

## Services

Service implementations live in `packages/<name>`, with runtime wrappers in `services/<name>`:

- [`pds`](./services/pds/): hosts repositories and account data. The upstream [PDS project](https://github.com/bluesky-social/pds) documents self-hosting.
- [`bsky`](./services/bsky/): an AppView implementing `app.bsky.*` APIs, with a PostgreSQL dataplane for testing. Bluesky's production `api.bsky.app` uses a different, closed-source dataplane.
- [`bsync`](./services/bsync/): synchronizes AppView state such as mutes and notifications.
- [`ozone`](./services/ozone/): implements moderation APIs in the `tools.ozone.*` namespace.
- [`matrix-bridge`](./services/matrix-bridge/): connects PARA community workflows to Matrix.

## Requirements

- Node.js 22, using a version compatible with the range in [`package.json`](./package.json). Run `nvm use` to select the major version in [`.nvmrc`](./.nvmrc).
- pnpm 11.11.0, as pinned in `package.json`.
- Docker and `jq` for local service infrastructure and integration tests.

## Getting started

```bash
pnpm install
pnpm build
```

For local configuration, copy the example environment file and fill in the required values:

```bash
cp .env.example .env
```

Keep `.env` and other local secret files out of git. For local development, `make run-dev-env` starts the persistent PARA stack; `make run-demo-env` starts a disposable demo without provisioning Matrix rooms. See the [developer quickstart](./CONTRIBUTING.md#developer-quickstart) and the [Matrix bridge README](./services/matrix-bridge/README.md) for more detail.

## Common commands

```bash
pnpm lint
pnpm test
pnpm build
pnpm codegen
```

Run package-specific builds and tests from that package's directory. Some integration tests require PostgreSQL and Redis; the test scripts manage them through Docker when available.

## Related projects

- [Bluesky Social app](https://github.com/bluesky-social/social-app): web and mobile client source.
- [bluesky-social/bsky](https://github.com/bluesky-social/bsky): Bluesky and chat Lexicons and `@bsky/*` TypeScript SDKs.
- [Indigo](https://github.com/bluesky-social/indigo): Go implementation, including the BGS service.

## Deployment and contributions

Production deployment files live under [`deploy/`](./deploy/) and in the Docker Compose manifests at the repository root. Supply environment-specific secrets outside git through `.env` files or the deployment platform's secret manager.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development and contribution guidance and [STYLE_GUIDE.md](./STYLE_GUIDE.md) for code conventions.

## Security and license

See [SECURITY.md](./SECURITY.md) for the security policy. Report sensitive issues privately; do not open public issues containing secrets, credentials, or exploit details.

Except where individual files say otherwise, the code is dual-licensed under [MIT](./LICENSE-MIT.txt) and [Apache 2.0](./LICENSE-APACHE.txt). See [LICENSE.txt](./LICENSE.txt).
