# WatZappa

WatZappa is the backend for PARA social app, it's an AT Protocol fork. This repository includes the PDS, AppView, sync, moderation, and Matrix bridge components needed to run the service stack.

## Repository Structure

- `services/` contains deployable service wrappers and container entrypoints.
- `packages/` contains shared packages and AT Protocol implementation modules.
- `lexicons/` contains the API schemas used by the services and generated clients.
- `deploy/` contains deployment assets for bare-metal, Matrix, and reverse-proxy setups.
- `tsconfig/` contains shared TypeScript configuration.

## Requirements

- Node.js 22 or newer
- pnpm 8.15.9
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

Production deployment files live under `deploy/` and the Docker Compose manifests at the repository root. Environment-specific secrets should be supplied outside git through `.env` files or the deployment platform's secret manager.

## Security

See `SECURITY.md` for the security policy. Report sensitive issues privately; do not open public issues containing secrets, credentials, or exploit details.
