---
'@para/matrix-bridge': minor
---

Restore MAS session revocation: revoking a device finishes its matching MAS OAuth and compatibility sessions before deleting the Synapse device, so access and refresh tokens both stop working. Keep native account creation in MAS (identity probes no longer pre-provision accounts) and restrict appservice login and server-minted push credentials to legacy deployments (`MATRIX_ALLOW_APPSERVICE_LOGIN`). Verify the claimed device exists before recording an attestation. Add an opt-in private chat operations listener with operator permissions, a durable audit, device revocation and retries of the existing provisioning queue. None of this runs with chat off.
