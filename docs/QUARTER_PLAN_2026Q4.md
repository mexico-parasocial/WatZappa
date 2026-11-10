# Delivery roadmap and release gates

**Scope: the shared PARA platform and its clients, with explicit PDS variants.**
Re-baselined against the local checkouts on **2026-10-14**. This is the canonical
pilot queue; the filename remains stable for existing links. The September
sprint calendars and competing Matrix/frontend schedules are superseded.
Implementation, directed tests and production acceptance are separate states.

The outcome remains one community using real civic data, governed chat access
and moderation, with accurate encryption/privacy disclosure and a demonstrated
recovery path. Assume one engineer and a serial critical path. Keep the first
pilot to one community until authorization/revocation is proven in the deployed
configuration. Do not infer dates or capacity from closed implementation work.

## What is implemented, and what remains

| Area                      | Groundwork in the checkouts                                                                                                      | Required next evidence                                                                                                                                             |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Matrix identity and joins | CD-M1/CD-M4/CD-M6, bridge authorization, IdP/MAS and proof-bearing client helpers exist.                                         | Full approved login → actual MAS-device attestation → room join → role change/removal, on supported clients.                                                       |
| PARA chat                 | Native encrypted-chat adapter/OIDC/recovery code now exists in the current client; web has its own OIDC path.                    | Multi-device verification/recovery, encrypted web policy, unread/reconnect and moderation acceptance. The old claim that the native feature is absent is obsolete. |
| M8 client login           | Explicit DID-bound login candidate and broker handoff are documented in the client.                                              | Paired broker migration/configuration and real-provider/staging acceptance; see [M8 login](../../PARA/docs/M8_LOGIN.md).                                           |
| Governance                | Public ballot verification, frozen legacy ballots/read APIs and a synthetic G1 engine.                                           | Remaining G1 product rules/UI evidence, then atomic synthetic G2; private voting has separate protocol/publication gates.                                          |
| Native VLPDS writes       | Founder invitations/finalization, independent iM8 factors, alpha quotas/invites and reviewed public/private imports implemented. | Client adoption, physical-wallet/protocol review, real AppView/Matrix/M8 behavior and recovery/cutover rehearsal. Existing-user migration remains NO-GO.           |
| VLPDS firehose            | Patched, pinned rsky relay replaces Indigo and adapts exact 64-bit sequences.                                                    | Coherent relay/database restore and reviewed checkpoint/source migration for a real deployment.                                                                    |
| Operations                | Compose/Ansible, diagnostics and backup tooling exist.                                                                           | Verify the running topology, complete backup coverage, monitoring/alerts, TLS and restore/rollback. Tool availability is not deployment evidence.                  |

Architecture and security detail belong in [Matrix](MATRIX_V2.md),
[governance](GOVERNANCE.md), [personal civic data](PERSONAL_CIVIC_TREE.md) and
[VLPDS](VLPDS.md). The detailed client rollout and its device ledger stay in
[PARA's Matrix plan](../../PARA/docs/MATRIX-COMMUNITY-CHAT-IMPLEMENTATION.md) and
[device acceptance record](../../PARA/docs/MATRIX-CHAT-DEVICE-ACCEPTANCE-2026-09-26.md).

## Active execution queue

1. **Choose and identify the target configuration.** Record source revisions,
   image digests, PDS variant and real public URLs. Existing users stay on the
   TypeScript PDS until the Rust migration gates below pass. Rust staging must
   use the native PARA image, compatible nodes and the pinned rsky patch.
2. **Complete authentication and client acceptance.** Exercise M8 login and
   Matrix IdP return, attest the actual MAS device, approve wallet proofs on a
   device and complete creator-authorized founder flows. Never substitute an
   install UUID for a MAS device or an M8 session token for a native PDS wallet
   approval. Keep those two authentication protocols distinct.
3. **Complete Matrix lifecycle and recovery.** Prove current member/moderator
   entitlements, demotion/removal, replay/reconnect, unread state, cross-device
   decryption and wrong/lost-key handling. Check the supported web experience
   before enabling encryption for shared rooms. Retest the dated acceptance
   blockers rather than assuming the old process/fixture still exists.
4. **Rehearse operations and migration.** Restore an isolated copy of the real
   topology; validate data and consumer checkpoints, not just health endpoints.
   Use the matching PDS runbook. For Rust, separately migrate private alpha,
   authentication/identity and Matrix obligations after reviewing the public CAR.
5. **Issue a scoped pilot release decision.** Record full builds, service/device
   evidence, runtime limits, rollback and remaining exclusions. Keep private
   elections closed; public reactions and ballots must disclose attribution.

Governance laboratory work can continue with synthetic identities, but shares
this capacity. Its G1–G5 work and contract live in [GOVERNANCE.md](GOVERNANCE.md).
G2 was estimated at 8–12 engineering days after rules are fixed, with low
confidence; this is sizing context, not a production commitment. Do not add
parallel work or a new calendar merely because earlier dates passed.

## Release gates

| Gate                  | Evidence required before release                                                                                                                                                                                                       |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Privacy disclosure    | Each client explains its actual room encryption state. Unencrypted rooms expose content to the operator; an encryption event alone does not prove working client decryption. Public civic ballots remain attributable.                 |
| Matrix access         | Member/moderator authorization, actual-device attestation, session revocation, lease re-entry and role projection pass against real services. Revocation cannot erase content/keys already copied.                                     |
| Recovery              | Synapse signing key, Synapse/MAS/bridge/identity data, media, credentials and client key recovery are included and independently restored. The legacy Matrix archive alone does not cover this topology.                               |
| Rust migration        | Original source signing key pinned from DID history; exact CAR and destination head reviewed; private alpha/auth state validated; required iM8 re-enrollment and client flows completed; larger-than-64-MiB CARs have a reviewed path. |
| Relay change          | Consumer checkpoint namespaces reviewed, retained history/replay verified, relay and database recovery coordinated. Indigo checkpoints cannot be reused as rsky checkpoints.                                                           |
| Governance            | Public proof verification fails closed in PDS and AppView, including foreign repos; private/QV APIs remain closed until their own complete protocol and publication review.                                                            |
| Production operations | Real TLS/.well-known, backup shipping/retention, monitoring/alerts, load limits, immutable images and a compatible rollback are demonstrated.                                                                                          |

For native wallet factors, an upstream or mixed-version PDS rollback is unsafe:
those binaries do not enforce the private factor state. A CAR is a public
repository snapshot, not a backup of the whole account or platform.

## Standing decisions and deferred scope

- **OD-3 and OD-4:** founding-community decisions on third-party LLM policy and
  identity labels remain open. Keep `OPENAI_API_KEY` unset until policy is
  approved; per-author consent machinery does not approve provider use. The
  `civic` key remains excluded from Matrix/signing flows.
- **Media:** decide and verify storage/encryption for the actual topology.
  WatZappa's standalone Matrix media is a local volume; a SeaweedFS design in
  another profile does not encrypt that volume. See [Matrix operations](MATRIX_BACKUP.md).
- **Personal spaces:** resolve hosting, OAuth client readiness and source
  migration; public visibility fields cannot provide access control.
- **Deferred:** a different homeserver, broad multi-community rollout,
  app-store polish, map expansion and new private-voting cryptography are
  outside this pilot's release scope. Encryption rollout requires the client
  acceptance above rather than an expired timeboxed-spike schedule.
- **INE:** real institutional integration is an external dependency; keep
  preview behavior and data-minimization rules explicit.

Record new evidence in the owning guide and remove a queue item only when its
acceptance is met. No production deployment or migration was performed by this
documentation consolidation.
