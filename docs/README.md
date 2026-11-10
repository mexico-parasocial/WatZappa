# WatZappa documentation

Reviewed against the local checkouts on **2026-10-14**. WatZappa contains the
TypeScript PDS and the shared AppView, bsync, Ozone, Matrix bridge and IdP.
The alternative Rust PDS and its platform deployment live in the sibling
`vlpds` repository. A document's scope below tells you which implementation it
describes; shared schemas do not imply identical endpoint behavior.

## Start here

| Document                                                          | Scope                                        | What to use it for                                                                     |
| ----------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------- |
| [Delivery roadmap](QUARTER_PLAN_2026Q4.md)                        | Shared platform and clients                  | Current dependencies, remaining work and release gates; no expired sprint promises     |
| [Lexicon catalog](LEXICONS.md)                                    | Shared API contracts                         | Find the canonical JSON for every `com.para.*` schema                                  |
| [Governance](GOVERNANCE.md)                                       | Shared policy; TypeScript reference and lab  | Public ballots, verification, freezes, synthetic contract and dated test evidence      |
| [Ballot identity decisions](OD-7-BALLOT-IDENTITY-REGISTRATION.md) | Shared identity policy                       | Accepted decisions and the unresolved private-voting design; preserve decision history |
| [Personal civic data](PERSONAL_CIVIC_TREE.md)                     | Shared data boundaries; TypeScript AppView   | Owner-only exports, permissioned storage and limits of public records                  |
| [Matrix architecture and decisions](MATRIX_V2.md)                 | Shared Matrix services                       | CD-M1–CD-M6, findings, identity boundaries and residual linkage                        |
| [Matrix operations and recovery](MATRIX_BACKUP.md)                | WatZappa Compose; shared acceptance evidence | Local setup, backup coverage, restore limitations and the incomplete device drill      |
| [VLPDS](VLPDS.md)                                                 | Rust fork and its platform                   | Native writes, rsky transport, migration limits and canonical deployment/runbooks      |

## Choose the deployment first

For the **TypeScript PDS**, start with the [repository setup](../README.md),
[Ansible guide](../ansible/README.md) and [Matrix security runbook](../deploy/matrix/RUNBOOK_SECURITY_ES.md).
`make run-dev-env` uses WatZappa's PDS; `make run-demo-env` is the disposable
demo. Root Compose files and Ansible assets describe this deployment track.

For the **Rust PDS**, use [VLPDS](VLPDS.md) and the sibling
[platform entry point](../../vlpds/para/README.md). Run its commands from
`vlpds/para`, not from WatZappa. WatZappa still builds its TypeScript consumers
and Matrix services for that platform. Cross-repository links assume the
checkouts share a parent directory.

Detailed service contracts stay with their code:
[Matrix bridge](../services/matrix-bridge/README.md),
[client integration](../services/matrix-bridge/docs/CLIENT_INTEGRATION.md),
[bridge acceptance checklist](../services/matrix-bridge/TEST_CHECKLIST.md),
[IdP](../services/para-idp/README.md) and [upstream synchronization](../UPSTREAM_SYNC.md).

## Keeping this directory useful

Update the guide that owns the topic. Keep dated observations with their scope;
an old passing test is not current deployment evidence. Record accepted security
decisions by their stable IDs, and link operational procedures to their owning
repository. Regenerate the single lexicon catalog instead of maintaining a page
per schema. Git history retains superseded reviews and schedules.
