# Demo seed

- Demo lists and list items require TID keys; use `seedTid` for stable fixture keys.
- Never seed proofless civic votes or delegations, or frozen `proposalAnswer` ballots.
- `pnpm seed:memes` upserts images from `assets/memes/` into a running PDS (defaults to `alice.test` on port 2583). `SEED_PDS_URL`, `SEED_IDENTIFIER`, and `SEED_PASSWORD` override the target. The full PARA demo seed also calls this helper.
- The persistent local profile is `.dev-env-data`: keep its PDS, PLC, blobs, AppView schema, and bridge cursor together. On startup, upsert memes and civic trees, provisioning only missing fixture accounts and open demo communities; existing Alice/Bob/Carla accounts use `para-test-pw`.
- A persistent PDS must retain its rotation and recovery keys across restarts. Check its account signing keys against the local PLC before serving traffic.
- Before PDS startup, repair only the known missing account migration `008` gap after backing up SQLite; reject any other unexpected migration order.

- The full demo seeds personal and approved community civic trees from `assets/demo-content/` after memberships are indexed. PARA’s `seed:demo-content` uses this same engine and fixture set; keep symbolic source references resolved to actual repo URIs/CIDs and book author/year fields intact.
