# WatZappa

WatZappa is the TypeScript backend for PARA, built as an AT Protocol fork. It contains the TypeScript PDS plus the AppView, sync, moderation, Matrix bridge and IdP services. Those shared services also run with the native Rust PDS in the sibling VLPDS repository.

## Repository Structure

- `services/` contains deployable service wrappers and container entrypoints.
- `packages/` contains shared packages and AT Protocol implementation modules.
- `lexicons/` contains the API schemas used by the services and generated clients.
- `deploy/` contains deployment assets for bare-metal, Matrix, and reverse-proxy setups.
- `tsconfig/` contains shared TypeScript configuration.

## Requirements

- Node.js 22 or newer
- pnpm 11.11.0
- Docker, for local infrastructure and containerized services

## Getting Started

```bash
pnpm install
pnpm build
```

For local configuration, copy the example environment file and fill in the required values:

```bash
cp .env.example .env
```

Do not commit `.env` or other local secret files. They are intentionally ignored.

## Common Commands

```bash
pnpm lint
pnpm test
pnpm build
pnpm codegen
```

## Services

- `services/pds`: Personal Data Server wrapper.
- `services/bsky`: AppView service wrapper.
- `services/bsync`: Sync service wrapper.
- `services/ozone`: Moderation service wrapper.
- `services/matrix-bridge`: Matrix bridge for civic/community workflows.

## Deployment

The TypeScript deployment track uses `deploy/`, `ansible/` and the root Docker Compose manifests. The Rust PDS platform is operated from the sibling `vlpds/para` directory; see [VLPDS integration](docs/VLPDS.md). Environment-specific secrets should be supplied outside git through `.env` files or the deployment platform's secret manager.

## Documentation

Start with the [documentation index](docs/README.md) for implementation scope and the current guides. The [delivery roadmap](docs/QUARTER_PLAN_2026Q4.md) owns release gates; the [lexicon catalog](docs/LEXICONS.md) links every shared PARA contract to its canonical JSON. Native Rust operations and migration procedures are maintained in the VLPDS repository rather than duplicated here.

## Security

See `SECURITY.md` for the security policy. Report sensitive issues privately; do not open public issues containing secrets, credentials, or exploit details.
