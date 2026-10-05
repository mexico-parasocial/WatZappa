---
"@para/matrix-bridge": minor
---

Require service-authenticated AppView authority for community membership and Matrix powers. Reconcile persisted grants before serving, refresh live authorization/retries, and revoke access when verification fails. Configure BRIDGE_AUTHORITY_APPVIEW_URL and a dedicated shared PARA_AUTHORITY_SERVICE_TOKEN before upgrading.
