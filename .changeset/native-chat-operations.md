---
'@para/matrix-bridge': minor
---

Verify the claimed SDK device exists for the proven Matrix account before recording its attestation.

Keep native Matrix account creation and session authority in MAS. Finish matching OAuth and compatibility sessions before deleting a Synapse device, so access and refresh tokens both stop working. Restrict appservice login and server-minted push credentials to explicit legacy deployments.

Persist idempotent community provisioning jobs with bounded leases and retries. Expose a separate private chat operations listener with independent operator permissions, availability and ingestion status, safe device responses, audited retries and device revocation. Verify both SQLite and PostgreSQL using disposable integration fixtures.
