# Demo seed

- Demo lists and list items require TID keys; use `seedTid` for stable fixture keys.
- Never seed proofless civic delegations or frozen `proposalAnswer` ballots.
- `pnpm seed:memes` upserts eight local image fixtures into a running PDS (defaults to `alice.test` on port 2583). `SEED_PDS_URL`, `SEED_IDENTIFIER`, and `SEED_PASSWORD` override the target. The full PARA demo seed also calls this helper.
- The persistent local profile is `.dev-env-data`: keep its PDS, PLC, blobs, AppView schema, and bridge cursor together. Do not auto-run the full demo seed there; its existing Alice/Bob/Carla accounts use `para-test-pw`.
- A persistent PDS must retain its rotation and recovery keys across restarts. Check its account signing keys against the local PLC before serving traffic.
