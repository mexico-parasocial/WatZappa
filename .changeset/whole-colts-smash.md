---
"@atproto/crypto": minor
"@atproto/space": minor
"@atproto/pds": minor
---
Update Spaces to the shared-secret KEM/MAC protocol from upstream #5706. Add
P-256 ECDH and full HKDF, request MAC headers and STAR verification, account KEM
key provisioning and leased alpha-account backfill. Preserve PARA's owner-only
OAuth access and disabled public/shared credential endpoints. This changes the
alpha commit schema and HKDF API; peers must update together.
