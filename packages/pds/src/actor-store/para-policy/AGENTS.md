# PARA policy boundary

- Resolve the immutable space's authority DID before selecting an actor store.
- Load policy inputs and authorize writes in the same authority-store transaction.
- Route incoming signed projections through `ParaPolicyIntake` with operator-pinned public keys and exact issuer/audience/space/source bindings. Storage validates payloads but does not verify signatures; never call it with user-authored membership claims.
- Commit verified ordering/chain/epoch faults as `stale` before rejecting them. Never invalidate state for unauthenticated input or older replays. Stale intake is latched until a separately reviewed authenticated recovery protocol exists; ordinary snapshots cannot clear a known gap.
- Preserve independent maximum verified source-version and policy-epoch floors, including later messages received while stale, with signed evidence for each. They are recovery constraints, never accepted membership state.
- `getAcceptedReceipt` is delivery reconciliation data, not an access grant. Expose it only through authenticated transport; stale/deleted/source-mismatched projections return no receipt.
- Stale recovery goes through `ParaPolicyCheckpoint` only: a single-use challenge bound to the accepted version/digest, both fault floors, and the exact trust bindings. Issues challenges only for a live stale or ready-but-lagged projection (an expired undelivered head must not deadlock the stream); install verifies signature, type, bindings, freshness, unchanged state and floors — so a concurrent ordinary delta invalidates the challenge — then consumes the challenge and installs the full snapshot in one transaction. A failed write rolls the consumption back.
- Never re-issue installed checkpoint bytes: a consumed challenge rejects them. After a lost response, reconcile through `getCheckpointReceipt`, which only reports the checkpoint while it is still the accepted projection.
- Publishers retry the original signed envelope byte-for-byte; the projection digest includes that envelope. Bootstrap permission and signing-key rotation require explicit trusted configuration.
- Preserve structured role assignment precedence and inclusive-start/exclusive-expiry semantics. Active membership is a separate prerequisite.
- Keep all exchange/record routes disabled until signed intake, durable challenges, and assurance-to-policy integration tests exist. See `docs/PERMISSIONED_DATA_PORT.md`.
