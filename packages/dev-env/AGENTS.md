# Demo seed

- Demo lists and list items require TID keys; use `seedTid` for stable fixture keys.
- Never seed proofless civic votes or delegations, or frozen `proposalAnswer` ballots.
- `pnpm seed:memes` upserts images from `assets/memes/` into a running PDS (defaults to `alice.test` on port 2583). `SEED_PDS_URL`, `SEED_IDENTIFIER`, and `SEED_PASSWORD` override the target. The full PARA demo seed also calls this helper.
- The persistent local profile is `.dev-env-data`: keep its PDS, PLC, blobs, AppView schema, and bridge cursor together. Auto-seed only the meme folder there; existing Alice/Bob/Carla accounts use `para-test-pw`.
- A persistent PDS must retain its rotation and recovery keys across restarts. Check its account signing keys against the local PLC before serving traffic.
- Before PDS startup, repair only the known missing account migration `008` gap after backing up SQLite; reject any other unexpected migration order.
