# PARA Matrix Homeserver

Self-hosted Matrix for community deliberation. Runs alongside the atproto stack on the same 5950X bare-metal box.

## Is a homeserver sufficient?

**Yes. Absolutely.** "Enterprise grade" from Element just means a support contract and managed hosting. The software is identical. Your 5950X + 128GB RAM is massive overkill for any homeserver software.

| Server       | RAM    | Users   | Your Hardware    |
| ------------ | ------ | ------- | ---------------- |
| Continuwuity | < 1 GB | ~500    | 0.8% of your RAM |
| Synapse      | 4–8 GB | ~5,000+ | 6% of your RAM   |

Capabilities **are** hardware-related, but only at extreme scale (tens of thousands of concurrent federated users). For civic communities in the hundreds-to-low-thousands range, even a Raspberry Pi could run Continuwuity. Your machine can run **both simultaneously** without stress.

## Which server to choose?

### Synapse (Python) — Recommended

- **Maturity:** 7+ years in production, used by matrix.org
- **Features:** Full Matrix spec coverage, best bridge support, E2EE, spaces, threads
- **Resource use:** 4–8 GB RAM, grows with federation
- **Best for:** You want zero surprises and full compatibility

### Continuwuity (Rust) — Lightweight alternative

- **Maturity:** Younger but stable for small-to-medium instances
- **Features:** Core Matrix + E2EE + federation. Missing some edge-case federation features
- **Resource use:** < 1 GB RAM, tiny disk footprint
- **Best for:** You want the absolute minimum resource overhead

**Our recommendation:** Start with **Synapse**. Your hardware has 128 GB RAM. The difference between 1 GB and 8 GB is meaningless to you, but the difference in maturity and ecosystem support is meaningful.

## Quick start

### 1. Add environment variables

In your `WhatZatppa/.env`:

```bash
# Matrix
MATRIX_SERVER_NAME=matrix.para.social
MATRIX_DOMAIN=chat.para.social
MATRIX_DB_NAME=matrix
```

### 2. Run setup

```bash
./WhatZatppa/deploy/matrix/setup.sh
```

This generates:

- `synapse/homeserver.yaml` — Synapse configuration
- `element-config.json` — Element Web client config
- Federation well-known snippets

### 3. Add Caddy config

Append `WhatZatppa/deploy/matrix/Caddyfile.matrix` to your `/etc/caddy/Caddyfile`, then reload Caddy:

```bash
systemctl reload caddy
```

### 4. Start the stack

```bash
docker compose -f WhatZatppa/docker-compose.matrix.yaml up -d
```

### 5. Create the first admin user

```bash
docker exec -it para-matrix-synapse \
  register_new_matrix_user \
  -c /data/homeserver.yaml \
  -a \
  http://localhost:8008
```

### 6. Open Element Web

Navigate to `https://chat.para.social` and log in with the admin user.

## Security Model (PARA-Only)

**Federation is disabled.** This is a closed, non-federated homeserver:

- `federation_domain_whitelist: []` — No external servers can connect
- `enable_registration: false` — Only the bridge can create users via Admin API
- `allow_public_rooms_over_federation: false` — Rooms are not discoverable
- `allow_public_rooms_without_auth: false` — Authentication required

This keeps community deliberation within PARA's trust boundary. See `GUIA_ADMIN_ES.md` for operational details.

## Integration with PARA Communities

The **matrix-bridge** service (`WhatZatppa/services/matrix-bridge/`) automatically syncs PARA community membership to Matrix spaces:

```
PARA community "Comunidad XYZ"
    └── Matrix Space #comunidad-xyz:matrix.para.social
```

The bridge:

1. Consumes `com.atproto.sync.subscribeRepos` firehose
2. Creates Matrix spaces for new `com.para.community.board` records
3. Invites/kicks users based on `com.para.community.membership` state
4. Sets power levels: owners=100, moderators=50, members=0

See `../../services/matrix-bridge/README.md` for bridge documentation.

## Backups

Synapse data lives in Docker volumes:

- `synapse_data` — config, media, keys
- `matrix_postgres_data` — message history

Add to your backup script:

```bash
docker run --rm -v para-matrix-synapse:/data -v $(pwd):/backup alpine \
  tar czf /backup/matrix-synapse-backup.tar.gz -C /data .

docker exec para-matrix-db pg_dump -U pg matrix > matrix-db-backup.sql
```

## Resource Monitoring

On your 5950X, the entire Matrix stack will use approximately:

| Component            | RAM         | CPU               |
| -------------------- | ----------- | ----------------- |
| Synapse              | 2–4 GB      | 1–2 cores at peak |
| Postgres             | 512 MB–1 GB | minimal           |
| Element Web (static) | ~0          | ~0                |
| Bridge               | ~100 MB     | minimal           |
| **Total**            | **~3–5 GB** | **negligible**    |

## Guides

- 🇪🇸 **Guía de Usuario** (Clientes): [`GUIA_USUARIO_ES.md`](./GUIA_USUARIO_ES.md)
- 🇪🇸 **Guía de Administración** (DevOps): [`GUIA_ADMIN_ES.md`](./GUIA_ADMIN_ES.md)
