# VLPDS: Rust PDS integration

**Scope: the PARA native Rust fork in the sibling `vlpds` repository.**
Reviewed 2026-10-14. This page routes WatZappa developers to that implementation;
deployment commands, protocol details and recovery procedures are maintained in
[`vlpds/para`](../../vlpds/para/README.md).

## What runs where

| Concern             | TypeScript PDS in WatZappa                                      | Native Rust PDS in VLPDS                                                                            |
| ------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| PARA commands       | `packages/pds/src/api/com/para`                                 | `src/xrpc/para`; build the PARA fork and enable `VLPDS_PARA`                                        |
| Before-write policy | Common policy and PDS preparation                               | Native policy before commands and generic create/put/applyWrites; `validate: false` cannot waive it |
| Read models         | WatZappa AppView and its indexers                               | The same TypeScript services; foreign-PDS indexing checks remain required                           |
| Durable PDS state   | Local SQLite/account state and key files; configured blob store | Bucket log, SlateDB and blobs; local disk is cache                                                  |
| Consumer transport  | Direct PDS subscription in the traditional setup                | VLPDS → patched rsky relay → TypeScript consumers                                                   |
| Account iM8 factor  | Existing TypeScript account/M8 implementation                   | Independent, purpose-bound wallet challenge; capability `authFactorMode: wallet-v1`                 |
| Alpha state         | Account database                                                | Private durable rows, atomic quotas and single-use invites                                          |
| Recovery            | PDS local state plus the remaining services                     | Bucket and offline keys plus relay, Postgres, identity, Matrix and client key recovery              |

The shared [lexicons](LEXICONS.md) are contracts. VLPDS-specific operator
commands (`vlpds.para.*`) are documented with the Rust implementation, not in
WatZappa's `com.para.*` schema catalog. The upstream VLPDS image does not contain
the native PARA handlers. An environment flag alone does not add them.

## Why there is a relay

VLPDS sequences events with `unix_micros × 256 + writer`, requiring exact 64-bit
integers. WatZappa's current sync consumers validate sequences as safe JavaScript
integers and reject those values. The traditional TypeScript PDS uses small
consecutive sequences that those consumers can read directly. This is a cursor
compatibility issue, independent of custom PARA writes.

The current platform uses the **patched rsky Rust relay**, replacing Indigo.
It consumes the exact upstream cursors and publishes durable sequences within
the JavaScript safe range. It is restricted to the configured PDS and retains
its own replay/checkpoint state. Use the pinned source and PARA patch from the
[rsky relay guide](../../vlpds/para/docs/RSKY-RELAY.md), not an unpatched image.
Indigo and rsky cursors are separate namespaces; consumer checkpoints cannot be
reused when switching relays.

Removing the relay would require exact integers throughout CBOR decoding,
validation, storage, query serialization, checkpoints and reconnect behavior
in every consumer. Merely changing one TypeScript field to `bigint` is
insufficient. That migration has not been completed.

## Native writes and release status

The fork implements community creation/membership, briefing packs, shared
content and civic voting. Founder acceptance writes only the invitee's repo;
the creator signs invitations and finalizes activation at nine accepted
founders. All founders must use the same PDS service, including its cluster
nodes. Clients must handle `requiresCreatorFinalization`.

iM8 factors use an independent wallet approval without requiring an M8 broker
session. Alpha administration requires operator credentials; quotas and invite
redemption commit atomically. Public repository imports require an operator
review of the exact CAR, source signing key and destination head; private alpha
state has a separate reviewed import. Repository CARs do not migrate passwords,
authentication factors, identity rotation keys or Matrix state.

**Existing-user production migration remains NO-GO.** Native implementations,
regressions and the local Linux wallet smoke passed in the preceding backend
work; this documentation cleanup does not rerun or extend that evidence. Full
client flows, physical wallets, authentication-protocol review, real-service
integration, recovery and a reviewed migration rehearsal remain required.
Upstream or mixed-version rollback cannot enforce enrolled native wallet factors.

## Canonical VLPDS guides

| Topic                                                      | Source in the Rust repository                                                                                         |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Native commands, policy, verification and reviewed imports | [Native PARA writes](../../vlpds/para/docs/NATIVE-PARA-WRITES.md)                                                     |
| Wallet factor, enrollment, login and recovery              | [iM8 wallet protocol](../../vlpds/para/docs/IM8-WALLET-FACTOR.md)                                                     |
| Relay pins, build, replay, backups and Indigo migration    | [rsky relay](../../vlpds/para/docs/RSKY-RELAY.md)                                                                     |
| Local platform and smoke                                   | [Development](../../vlpds/para/docs/DESARROLLO.md)                                                                    |
| Deployment and configuration                               | [Deployment](../../vlpds/para/docs/DESPLIEGUE.md), [configuration](../../vlpds/para/docs/CONFIGURACION.md)            |
| Incidents and recovery                                     | [Runbook](../../vlpds/para/docs/RUNBOOK.md), [backups](../../vlpds/para/docs/RESPALDOS.md)                            |
| TypeScript deployment snapshots                            | [Traditional profile](../../vlpds/para/docs/tradicional/README.md); historical context, not current Rust instructions |

Spaces is an alpha capability, separate from these public-repository writes.
Do not assume it is enabled or provides end-to-end encryption. Personal-data
policy and hosting decisions remain in [PERSONAL_CIVIC_TREE.md](PERSONAL_CIVIC_TREE.md).

El ensayo persistente de chat, comandos y criterios de aceptación viven en
[CHAT-STAGING de VLPDS](../../vlpds/para/docs/CHAT-STAGING.md). Incluye el
recorrido nativo de aprobación del IdP y la comprobación del device real;
las pruebas en teléfono y la migración de usuarios conservan sus gates.
