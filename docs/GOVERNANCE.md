# Governance policy and laboratory reference

**Scope: shared PARA policy, enforced by the TypeScript PDS/AppView and the
native Rust fork; the synthetic laboratory lives in WatZappa.** Reviewed
2026-10-14 against the current policy source. Decision history is in
[OD-7](OD-7-BALLOT-IDENTITY-REGISTRATION.md); Rust-specific enforcement and
import procedures are in [VLPDS](VLPDS.md).

## Production boundary

Public cabildeo and policy ballots are implemented and attributable to their
repository author. Their authorization is not an anonymous-voting protocol.
Integrated private liquid/quadratic voting remains unavailable. The laboratory
is synthetic and must never be imported into production handlers or used with
real identities. Published records and copied histories cannot be made secret
by closing an AppView route.

The canonical TypeScript controls are
[para-ballot-freeze.ts](../packages/common/src/para-ballot-freeze.ts) and
[para-cabildeo-proof.ts](../packages/common/src/para-cabildeo-proof.ts).

| Record / path                                                                            | Current policy                                                                                                                                              |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `community.vote`, `community.intensity`, `raq.proposalAnswer`, `community.civicTreeVote` | Frozen on create/update and indexing. Deletes remain allowed.                                                                                               |
| `civic.vote`, cabildeo                                                                   | Public option ballot; M8 authorization binds actor, subject, nullifier and option.                                                                          |
| `civic.vote`, policy                                                                     | Public integer signal −3..+3; `m8:policy:v1` authorization binds the signal. This extension was accepted 2026-09-29.                                        |
| `civic.vote.delegatedFrom` / `civic.delegation.signal`                                   | Refused; public delegation registration does not authorize publishing a ballot graph or a signal.                                                           |
| `civic.openQuestionVote`, `raq.proposalVote`, `raq.axisVote`                             | Public reactions per account. New writes carrying M8 proof fields are refused; historical reactions remain indexable.                                       |
| `community.deliberationVote`                                                             | Public, unweighted position; no extra magnitude or quadratic budget.                                                                                        |
| Legacy QV read APIs                                                                      | `listVotes`, `listIntensities`, `getTallySimulation`, `getAuditTrail` remain closed with `BallotPrivacyUnavailable` even if the experiment flag is enabled. |

These are `com.para.*` collection names. Schema presence does not enable a
frozen record. PDS preparation applies policy independently of `validate: false`.
AppView also checks foreign PDS records before indexing. Its historical reaction
compatibility differs deliberately from the new-write refusal.

## Public ballot verification

The issuer binds content in a domain/versioned HMAC-SHA256 authorization.
A stable nullifier alone does not authorize a ballot. Clients propagate proof
issuance errors; the PDS and AppView each call the configured verifier before
accepting the record. Verification is repeatable, allowing both services to
check the same authorization; deduplication and replacement belong in the
counting database, not a destructive one-time proof exchange.

Configure `PARA_CIVIC_VOTE_VERIFIER_URL` in the PDS and AppView. The URL is
operator-controlled HTTPS, with loopback HTTP allowed for development only.
The TypeScript verifier has a three-second timeout, refuses redirects, forwards
no account credential and consumes only status: 204 accepts, 422 rejects;
missing configuration, timeout or other status fails closed. The Rust fork
uses its native counterpart with the same acceptance contract.

mubEZ's `CIVIC_VOTE_PROOF_SECRET` must be independent and durable. Rotating it
invalidates prior authorizations unless a compatibility/reindexing plan is
provided. Issuer, both consumers and the paired client must be released together.
Long verifier outages and consumer recovery still require integration evidence.

M8 issuance and operational metadata can correlate activity. Removal of alias
APIs or new ledger correlations does not sanitize old rows, backups or copies.
Evaluate the current broker migrations and retention policy in its own
repository before any real-data cleanup.

## Remaining governance work

| Area                   | Implemented evidence                                  | Open release requirement                                                                                                          |
| ---------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| G1 reference           | Pure engine, adapters and browser fixture walkthrough | Ratify election rules, especially follower budgets; integrate the synthetic PARA/ALF flow and validate accessibility/devices.     |
| Historical delegations | Repo-owner binding and read-only SQL diagnostic       | Run against an identified dataset; record counts, then rehearse reviewed reindexing/rollback.                                     |
| G2 admission           | Contract described below                              | Persistent authorized ledger; atomic budget, replacement, revocation, expiration, close and replay.                               |
| G3 private protocol    | Requirements in OD-7                                  | Select and independently review the complete eligibility/content/range/spend/delegation protocol and its trust model.             |
| G4 publication/UI      | Explicit privacy refusal                              | Versioned snapshots, protection against differencing/small groups, common API/UI results, receipts and operational privacy tests. |
| G5 release             | Directed tests and local demo                         | Full builds, load/recovery, historical migration and real web/iOS/Android acceptance.                                             |

Product must decide eligibility/padron, authoritative times, budget, what is
delegated, abstention, quorum, approval and ties. The provisional reference is
not adopted by silence. G2 can use synthetic identities while G3 is evaluated;
that does not approve its production format. No private-voting release date is
committed. [The platform roadmap](QUARTER_PLAN_2026Q4.md) owns sequencing.

## Dated local evidence

Observed **2026-09-21**, not rerun for this documentation cleanup:

| Location        | Reproducible command                                                                                                                                                                                 | Observed result                                               |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `packages/bsky` | `pnpm test src/governance-lab tests/governance-delegation-audit.test.ts src/api/com/para/community/quadratic-voting-gate.test.ts src/data-plane/server/indexing/plugins/para-qvl-delegation.test.ts` | 43 tests: engine 27, adapters 4, SQL 1, gate 8, delegation 3. |
| `packages/pds`  | `pnpm test:sqlite tests/ballot-freeze.test.ts --runInBand`                                                                                                                                           | 13 tests.                                                     |
| Sibling `PARA`  | `pnpm test src/lib/qvl-status.test.ts --runInBand`                                                                                                                                                   | 6 tests.                                                      |
| `packages/bsky` | Native compiler against `tsconfig.build.json` and `tsconfig.governance-lab.json`; ESLint on the lab and SQL test                                                                                     | Passed.                                                       |

The 62 directed tests did not certify the whole workspace. PARA's web typecheck
then had 111 errors; that is a historical observation, not the status of the
current client. WatZappa used Node 22.22.1/pnpm 11.11.0; PARA used Node
24.18.0/pnpm 11.21.0. Use each checkout's current runtime pin when reproducing.

Run the demo from PARA with `node scripts/governance-lab/serve.mjs`; it listened
on loopback port 8931. Browser state is memory-only, with no user sessions or
write API. The recorded walkthrough covered chains, direct override, overspend
refusal, revocation, close and withheld results, at desktop and 390px width.
HTTP checks observed GET 200, POST/foreign Host 403, unknown route 404, CSP
`connect-src 'none'`, `no-store` and `nosniff`. No screen-reader or WCAG
certification was performed, and screenshots were not retained as evidence.

The read-only historical diagnostic is
[scripts/governance-delegation-audit.sql](../scripts/governance-delegation-audit.sql).
The lab changeset is `.changeset/good-keys-attack.md`. Rust verification is
recorded separately in its [native implementation guide](../../vlpds/para/docs/NATIVE-PARA-WRITES.md).

## Synthetic contract: g1-follow-signal-v1

This is the executable hypothesis prepared 2026-09-21, not an approved election
policy. Code is [packages/bsky/src/governance-lab](../packages/bsky/src/governance-lab).
The sibling PARA demo compiles that engine rather than maintaining a second
algorithm. The following rules and vectors remain the laboratory contract.

### Reglas ejecutables

| Aspecto                  | Regla de esta versión                                                                                                                                                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Identidad de la elección | Configuración `mode: synthetic`, ID, comunidad, participantes y propuestas con prefijo `demo:`. Sin DIDs, sesiones, credenciales ni llamadas de red                                                                                                                      |
| Elegibilidad             | Padrón fijo, único, entre 1 y 1000 participantes. Una fila efectiva por participante y propuesta; límites de 100 propuestas y 10000 eventos                                                                                                                              |
| Intensidad               | Entero entre −3 y +3. Costo `signal²`, sin multiplicar de nuevo por √créditos ni descontar bloques por √N                                                                                                                                                                |
| Delegación               | Transfiere la selección de señal, no los créditos. Cada participante sigue a su destino y paga con su propio presupuesto por elección                                                                                                                                    |
| Prioridad                | Voto directo > delegación por propuesta > por tema > por comunidad. Un delegado también puede delegar. Dos mandatos vigentes del mismo actor y ámbito rechazan el estado como ambiguo                                                                                    |
| Abstención               | Cero es una señal explícita, cuesta cero, cuenta para participación/quórum y detiene la cadena. Retirar un voto directo permite volver a aplicar la delegación                                                                                                           |
| Cadenas                  | Ciclos, profundidad excedida o destino sin voto dejan esa unidad sin ejercer, con una razón explícita. Ningún peso se crea ni se asigna a otro destino implícito                                                                                                         |
| Presupuesto              | Suma de costos efectivos de todas las propuestas por individuo. Se rechaza el estado completo si alguien excede su presupuesto; no se reduce intensidad ni se eligen ganadores por orden de llegada                                                                      |
| Revocación               | Solo el actor que creó el mandato puede revocarlo, una vez. No emite una papeleta. Un mandato nuevo requiere retirar el anterior del mismo ámbito                                                                                                                        |
| Tiempo                   | Eventos con ID y secuencia únicos; tiempo de recepción monotónico dentro de `[apertura, cierre)`. No se confía en `createdAt`. El instante del cierre congela el estado inmediatamente anterior; un mandato que vence exactamente al cierre cuenta en el resultado final |
| Quórum                   | `ceil(padrón × quorumBps / 10000)`, por propuesta. Un registro sin representar no cuenta como participación                                                                                                                                                              |
| Conteos                  | La señal plana suma los signos de los votos efectivos; la señal de intensidad suma sus valores. Ambos parten de la misma población resuelta. No hay simulación de correlación                                                                                            |
| Resultado político       | Se devuelven magnitudes y quórum. No se declara una propuesta aprobada ni un ganador; umbrales de aprobación y desempate están pendientes                                                                                                                                |
| Estadísticas             | Contrato de publicación: retenido antes del cierre o si alguna propuesta no alcanza el mínimo. Después, agregados sintéticos sin IDs de participantes. La vista interna del laboratorio sí contiene trazas ficticias                                                     |

**Consecuencia que debe decidir producto:** un cambio de señal de un
representante puede exceder el saldo de alguien que lo sigue. Esta versión
rechaza ese estado, incluso si el representante conserva saldo suficiente.
No es aún una regla apta para producción: revela una dependencia con los
seguidores y puede permitir bloqueo estratégico. Alternativas como reservas
previas de créditos, mandatos con límites o reglas de no ejercicio necesitan
especificación y evaluación antes de elegir una. No se implementó agrupación
de créditos ni se la presenta como equivalente a esta regla.

### Frontera de admisión y almacenamiento

`evaluateElection` calcula un estado para un instante, verifica forma, autoridad
sintética, orden de recepción, ambigüedades y saldo de ese estado. No verifica
firmas, pruebas criptográficas ni que todo prefijo histórico fuese aceptable.
La demo evalúa cada modificación candidata antes de conservarla. En G2, la
admisión persistente debe validar cada transición de forma atómica, incluyendo
transiciones por expiración, cierre y revocación. Un log reescrito puede cambiar
la historia: el motor puro no reemplaza un ledger autorizado e inmutable.

Los eventos posteriores al instante consultado no alteran su resultado. Un
evento fuera del intervalo de la elección o con secuencia repetida se rechaza.
La reproducibilidad presupone el mismo padrón, configuración y log autorizado;
esta versión no firma ni hace hash del snapshot.

### Adaptadores de registros existentes

- QVL comprueba que `delegator` corresponda al propietario recibido en el
  contexto. Normaliza `proposal`, `topic`, `community` y `topicCommunity` dentro
  de una elección de comunidad única. No ensancha un ámbito desconocido.
- Civic admite destinatario activo explícito y propuesta o un único tema.
  Rechaza reglas pasivas, múltiples temas y mezcla ambigua de propuesta/temas.
  Las dos familias se normalizan por separado; sumar las dos como mandatos
  vigentes del mismo ámbito provoca rechazo, no peso duplicado.
- El contexto aporta tiempo de recepción y vencimiento explícitos. No se
  inventan fechas desde metadatos declarados por el cliente. Los campos de
  criterio público (`reason`, `signal`, `preferredOption`) no se convierten
  silenciosamente en una papeleta.
- Estos adaptadores son para fixtures sintéticos. No hay importación de usuarios
  o historiales reales al laboratorio.

### Vectores de aceptación

Padrón Ana, Bruno, Carla, Diego; presupuesto 10 por persona; quórum 50 %.
Ana delega a Bruno, Bruno a Carla; Carla vota +2 en parque y +1 en biblioteca.

| Escenario                                             | Parque                                                                          | Biblioteca                        | Saldo de Ana |
| ----------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------- | ------------ |
| Cadena inicial                                        | 3 representados, señal plana 3, intensidad 6, costo total 12                    | 3 representados, señal 3, costo 3 | 5            |
| Ana vota −3 en parque                                 | 3 representados, 2 directos y 1 delegado; señal plana 1, intensidad 1, costo 17 | Sin cambio                        | 0            |
| Ana intenta +2 en biblioteca después de lo anterior   | Se rechaza el cambio completo: costaría 9 + 4                                   | Permanece el estado anterior      | 0            |
| Ana retira su voto directo                            | Vuelve a seguir a Carla                                                         | Sin cambio                        | 5            |
| Ana revoca su delegación comunitaria sin voto directo | 2 representados                                                                 | 2 representados                   | 10           |
| Cierre con cadena inicial vigente hasta ese instante  | Mismos votos que inmediatamente antes del cierre                                | Mismos votos                      | 5            |

### Modelo de privacidad a resolver antes de producción

| Actor              | Qué ve hoy / en el laboratorio                                   | Requisito para el flujo privado                                                                                                        |
| ------------------ | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Otros usuarios     | Registros públicos legacy; datos ficticios en la demo            | No relacionar identidad, señal, créditos ni grafo; controlar publicaciones repetidas, filtros y grupos pequeños                        |
| Representante      | En esta hipótesis determina la señal heredada                    | Especificar qué información recibe y cómo impedir correlación o coerción; resolver el rechazo por saldo del seguidor                   |
| Emisor mubEZ       | Persona/emisión y metadatos; revisar el broker vigente           | Separar emisión y uso de credenciales, unicidad por persona y vinculación no reveladora; el laboratorio no demuestra estas propiedades |
| Recepción y conteo | La referencia resuelve todo en claro con IDs ficticios           | Verificar prueba ligada al contenido, elección, rango, gasto y mandato; definir confianza distribuida, gestión de claves y coaliciones |
| Operación          | Logs, tiempos, red, respaldos y versiones pueden correlacionarse | Política y pruebas sobre metadatos, retención, backups, telemetría y acceso interno                                                    |

El mínimo de participantes no constituye por sí solo anonimato: unanimidad,
conocimiento previo, diferencias temporales y varios agregados pueden revelar
una señal. No se eligió biblioteca ni protocolo criptográfico en esta entrega.
La selección debe demostrar elegibilidad única, contenido comprometido, prueba
de rango, costo cuadrático, conservación de mandatos y revocación privada; que
una biblioteca ofrezca una curva o compromisos no acredita esas propiedades.

### Inventario histórico de la prueba opcional

El inventario del 21 de septiembre observó consumidores de
`PARA/src/lib/api/vote-proof.ts` con prueba opcional. La política vigente de
boletas y reacciones se describe arriba; no usar este inventario como estado
actual del cliente. Sus
consumidores encontrados son cabildeo, RAQ (ejes/propuestas), preguntas abiertas
y deliberación. Publican registros atribuibles; ninguno debe convertirse en el
canal de voto privado por reutilización del helper.

En los indexadores revisados, varios `voteNullifier` se usan para localizar una
fila existente sin que ese paso demuestre quién controla la prueba. Antes de
exigir simplemente un string en la UI, G2 debe verificar autoridad, contenido y
duplicados en servidor. Convertir `null` en excepción solo en cliente no cierra
esa superficie. No se modificaron las reglas de participación de esos flujos
públicos; las nuevas elecciones privadas siguen sin un endpoint habilitado.
