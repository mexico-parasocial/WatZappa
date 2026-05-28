# Testing Guide

This project uses `pnpm` workspaces, Jest, and Docker-backed services (Postgres + Redis) for integration tests.

## Prerequisites

- Node.js 22 (recommended via `nvm`)
- `pnpm` (via `corepack`)
- Docker running

## Setup

```bash
make nvm-setup
make deps
make build
```

If `nvm` is already installed, ensure Node 22 is active:

```bash
nvm use 22
node -v
```

## Run All Tests

```bash
make test
```

## Common Package-Level Test Commands

### PDS

```bash
pnpm --filter @atproto/pds test
```

### Bsky AppView

```bash
pnpm --filter @atproto/bsky test
```

## Para-Specific Test Commands

### PDS read-after-write coverage

```bash
pnpm --filter @atproto/pds test -- tests/proxied/para-read-after-write.test.ts
```

### PDS para record constraints

```bash
pnpm --filter @atproto/pds test -- tests/crud.test.ts
```

### Bsky para API/view coverage

```bash
pnpm --filter @atproto/bsky test -- tests/views/para-feed.test.ts
```

### Bsky para dataplane query coverage

```bash
pnpm --filter @atproto/bsky test -- tests/data-plane/para-queries.test.ts
```

## Troubleshooting

### Native module mismatch (`better-sqlite3` / ABI error)

If Node version changed, rebuild native modules under the repo Node version from `.nvmrc`:

```bash
nvm use
pnpm install --frozen-lockfile
pnpm --filter @atproto/pds rebuild better-sqlite3
```

### Tests not picking up source changes

Some test flows execute compiled workspace packages. Rebuild affected packages first:

```bash
pnpm --filter @atproto/pds build
pnpm --filter @atproto/bsky build
```

## Helpful Make Targets

```bash
make help
make run-dev-env
```
