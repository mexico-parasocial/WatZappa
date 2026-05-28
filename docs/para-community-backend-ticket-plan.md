# Plan de Implementacion por Tickets: Comunidades Para

## Objetivo

Descomponer el trabajo de backend de comunidades Para en tickets concretos, ordenados por dependencias y pensados para ejecucion incremental sin romper contratos ni dejar a frontend bloqueado.

Este plan sigue el reporte:

- [para-community-backend-report.md](/Users/mlv/Desktop/MASTER/watx/docs/para-community-backend-report.md)

## Principios

- No usar `para_status.community` como sistema de membresia.
- No usar los chats `270` y `30` como fuente primaria de membresia comunitaria.
- Formalizar contratos antes de pedir a frontend que dependa de ellos.
- Priorizar integridad de dominio y pruebas por encima de sincronizar mas superficie upstream.

## Epic 1: Fundacion del Dominio de Comunidad

### Ticket BE-01: Formalizar el modelo de comunidad

**Objetivo**

Crear el modelo canonico de comunidad como entidad de primer nivel.

**Trabajo**

- definir entidad `Community`
- definir identificadores:
  - `communityId`
  - `slug`
  - `quadrant`
- definir estados de comunidad
- decidir si el source of truth sera record ATProto, tabla proyectada o ambos
- documentar invariantes

**Entregables**

- decision de arquitectura documentada
- schema o lexicon inicial de comunidad
- reglas de unicidad de `slug`

**Criterios de aceptacion**

- existe una definicion canonica unica para comunidad
- `slug` y `communityId` tienen semantica clara
- `quadrant` tiene validacion definida
- frontend ya no necesita inferir que es una comunidad desde otros records

**Dependencias**

- ninguna

### Ticket BE-02: Crear modelo N:M de membresia comunitaria

**Objetivo**

Separar membresia real de la etiqueta singular `para_status.community`.

**Trabajo**

- crear tabla o record de `CommunityMembership`
- definir estados:
  - `pending`
  - `active`
  - `left`
  - `removed`
  - `blocked`
- incluir timestamps y fuente de ingreso
- agregar indices por `communityId` y `did`

**Entregables**

- migracion
- tipos
- helpers de lectura/escritura

**Criterios de aceptacion**

- un usuario puede pertenecer a multiples comunidades
- una comunidad puede listar miembros sin depender de `para_status`
- salir o ser removido no destruye historial de comunidad

**Dependencias**

- BE-01

### Ticket BE-03: Formalizar `com.para.community.governance`

**Objetivo**

Dejar de depender de un record descubierto por convencion sin contrato formal.

**Trabajo**

- crear lexicon formal para `com.para.community.governance`
- alinear shape con lo que hoy consume `getGovernance`
- definir campos opcionales y requeridos
- decidir estrategia de versionado

**Entregables**

- lexicon
- generated types
- validacion de record

**Criterios de aceptacion**

- `getGovernance` ya no depende de schema informal
- frontend puede tipar el payload de gobernanza con contrato estable

**Dependencias**

- BE-01

## Epic 2: Chats de Gobernanza y Grupos Reales

### Ticket BE-04: Implementar `chat.bsky.group.createGroup` en backend real

**Objetivo**

Pasar de superficie generada a endpoint funcional.

**Trabajo**

- implementar handler real
- persistir group convo
- crear membership del owner como `accepted`
- crear memberships invitados como `request` o `pending` segun contrato
- generar system message inicial si aplica
- garantizar consistencia en:
  - `getConvo`
  - `listConvos`
  - `getMessages`
  - `getLog`

**Entregables**

- handler de produccion
- storage y logs necesarios
- pruebas de integracion

**Criterios de aceptacion**

- crear grupo devuelve `convo` valido
- el grupo aparece en listados correctos
- los miembros ven el estado esperado

**Dependencias**

- ninguna estricta para grupo generic

### Ticket BE-05: Implementar subconjunto minimo de `chat.bsky.group.*`

**Objetivo**

Completar operaciones necesarias para comunidades y administracion basica.

**Alcance minimo**

- `addMembers`
- `removeMembers`
- `editGroup`
- `createJoinLink`
- `requestJoin`
- `approveJoinRequest`
- `rejectJoinRequest`
- `listJoinRequests`
- `getGroupPublicInfo`

**Trabajo**

- implementar permisos
- implementar limites de tamano
- implementar logs y system messages
- implementar validaciones de relaciones si aplica

**Criterios de aceptacion**

- cada endpoint tiene handler real
- errores de negocio estan definidos
- hay pruebas para happy path y permission failures

**Dependencias**

- BE-04

### Ticket BE-06: Endurecer seguridad operacional de grupos

**Objetivo**

Evitar que el sistema de grupos quede en estado demo.

**Trabajo**

- rate limiting en `createGroup`
- limites por tamano de grupo
- validacion de permisos de invitacion
- auditoria de acciones administrativas
- idempotencia razonable en operaciones sensibles
- metricas de error por endpoint

**Criterios de aceptacion**

- crear grupos e invitar miembros no puede usarse abusivamente
- acciones de admin quedan auditadas
- se pueden observar fallos por endpoint

**Dependencias**

- BE-04
- BE-05

## Epic 3: Orquestacion de Comunidad

### Ticket BE-07: Implementar `com.para.community.createBoard`

**Objetivo**

Convertir `createBoard` en mutacion real de produccion.

**Trabajo**

- registrar endpoint en servidor real
- validar auth, nombre y `quadrant`
- generar y reservar `slug`
- crear comunidad
- crear board
- invocar creacion de chats institucionales:
  - `delegatesChatId`
  - `subdelegatesChatId`
- crear membresia inicial del creador
- sembrar gobernanza inicial
- devolver payload de salida estable

**Criterios de aceptacion**

- `createBoard` existe en produccion
- devuelve `uri`, `cid`, `delegatesChatId`, `subdelegatesChatId`
- crea comunidad real y no solo mock
- no deja recursos huerfanos si algo falla a mitad de flujo

**Dependencias**

- BE-01
- BE-02
- BE-03
- BE-04

### Ticket BE-08: Introducir idempotencia y recuperacion en `createBoard`

**Objetivo**

Hacer que la creacion de comunidad sea segura ante retries, timeouts y fallos parciales.

**Trabajo**

- idempotency key para `createBoard`
- estrategia de compensacion o outbox
- proteccion contra doble submit
- rollback o reanudacion en:
  - comunidad creada pero chats no
  - chat creado pero board no
  - board creado pero membresia no

**Criterios de aceptacion**

- reintentar el mismo request no duplica comunidad
- no quedan chats huerfanos sin board

**Dependencias**

- BE-07

### Ticket BE-09: Persistir board y su proyeccion de lectura

**Objetivo**

Poder consultar comunidades recien creadas de forma consistente.

**Trabajo**

- persistir `com.para.community.board`
- agregar proyeccion/index si hace falta para lecturas rapidas
- indexar por `slug`, `quadrant`, `creatorDid`

**Criterios de aceptacion**

- una comunidad creada se puede recuperar por `slug` o `communityId`
- los chats institucionales quedan enlazados de forma estable

**Dependencias**

- BE-07

## Epic 4: Lecturas de Comunidad para Frontend

### Ticket BE-10: Implementar `com.para.community.getBoard`

**Objetivo**

Dar a frontend un endpoint unico de detalle de comunidad.

**Payload minimo**

- `communityId`
- `slug`
- `name`
- `description`
- `quadrant`
- `memberCount`
- `viewerMembershipState`
- `viewerCapabilities`
- `delegatesChatId`
- `subdelegatesChatId`
- `governanceSummary`
- `discourseSummary`

**Criterios de aceptacion**

- frontend puede renderizar pantalla de comunidad con una sola lectura principal

**Dependencias**

- BE-07
- BE-09

### Ticket BE-11: Implementar `com.para.community.listBoards`

**Objetivo**

Permitir discovery y listados por cuadrante/nonant/25th.

**Trabajo**

- list por `quadrant`
- soporte de paginacion
- ordenes basicos:
  - recientes
  - actividad
  - tamano

**Criterios de aceptacion**

- frontend puede listar comunidades sin consultas ad hoc sobre otros recursos

**Dependencias**

- BE-09

### Ticket BE-12: Implementar `com.para.community.getMembership`

**Objetivo**

Dar estado exacto del viewer en una comunidad.

**Campos minimos**

- `membershipState`
- `joinedAt`
- `roles`
- `capabilities`

**Criterios de aceptacion**

- frontend no necesita inferir permisos desde gobernanza y chats

**Dependencias**

- BE-02

### Ticket BE-13: Implementar `com.para.community.listMembers`

**Objetivo**

Exponer membresia real de comunidad.

**Trabajo**

- filtros por estado
- paginacion
- vista minima de miembro
- posibilidad de resolver roles institucionales

**Criterios de aceptacion**

- member count y member list salen del sistema de membresia, no de `para_status`

**Dependencias**

- BE-02

## Epic 5: Acciones de Membresia

### Ticket BE-14: Implementar `com.para.community.join`

**Objetivo**

Permitir ingreso a comunidad sin tocar chats internos.

**Trabajo**

- validar reglas de ingreso
- crear o reactivar `CommunityMembership`
- actualizar contadores
- devolver estado final

**Criterios de aceptacion**

- el usuario puede unirse a multiples comunidades
- el join no depende de ser agregado a chats institucionales

**Dependencias**

- BE-02
- BE-09

### Ticket BE-15: Implementar `com.para.community.leave`

**Objetivo**

Permitir salir de una comunidad sin corromper gobernanza o historiales.

**Trabajo**

- marcar `left`
- impedir leave silencioso si el usuario tiene rol institucional no transferido
- definir politica para visibilidad de historial

**Criterios de aceptacion**

- salir no elimina contenido historico
- roles sensibles se validan antes de salir

**Dependencias**

- BE-14

## Epic 6: Gobernanza Operativa

### Ticket BE-16: Publicacion y actualizacion de governance record

**Objetivo**

Permitir mantener gobernanza de comunidad con contrato formal.

**Trabajo**

- endpoint de update o publish
- validacion de actores autorizados
- historial de cambios
- timestamps

**Criterios de aceptacion**

- `getGovernance` refleja cambios recientes de forma consistente
- cambios quedan auditados

**Dependencias**

- BE-03
- BE-07

### Ticket BE-17: Separar roles institucionales de membresia general

**Objetivo**

Evitar que moderacion, deputy roles y oficiales se mezclen con la simple membresia.

**Trabajo**

- definir roles y capabilities
- mapear capabilities por accion
- exponer `viewerCapabilities`

**Criterios de aceptacion**

- frontend puede esconder o mostrar acciones sin heuristicas

**Dependencias**

- BE-03
- BE-16

## Epic 7: Discurso y Analitica

### Ticket BE-18: Reemplazar placeholders de discurso por calculos reales o versionados

**Objetivo**

Eliminar payloads engañosos en `discourse.*`.

**Trabajo**

- dejar de devolver placeholders fijos para:
  - `semanticVolatility`
  - `lexicalDiversity`
  - `polarizationDelta`
  - `echoChamberIndex`
- usar snapshots persistidos cuando existan
- si no existen, marcar claramente calidad del dato

**Criterios de aceptacion**

- frontend no recibe metricas "reales" que en verdad son stub

**Dependencias**

- ninguna estricta, pero recomendable despues de BE-10

### Ticket BE-19: Alinear discurso con comunidad real

**Objetivo**

Evitar que las analiticas de discurso dependan solo de etiquetas sueltas.

**Trabajo**

- decidir si el discourse se agrupa por `communityId`, `slug` o etiqueta normalizada
- alinear indexadores y consultas

**Criterios de aceptacion**

- las comunidades creadas por `createBoard` aparecen de forma consistente en discurso

**Dependencias**

- BE-01
- BE-07

## Epic 8: Calidad, Observabilidad y Pruebas

### Ticket BE-20: Suite de integracion para creacion de comunidad

**Objetivo**

Cubrir el flujo completo de comunidad.

**Happy path minimo**

1. crear comunidad
2. crear board
3. crear chats institucionales
4. crear membresia inicial
5. leer board
6. leer governance
7. leer discourse inicial

**Dependencias**

- BE-07
- BE-09
- BE-10

### Ticket BE-21: Suite de integracion para grupos

**Objetivo**

Cubrir el ciclo de vida de `chat.bsky.group.*`.

**Happy path minimo**

1. `createGroup`
2. `addMembers`
3. `removeMembers`
4. `createJoinLink`
5. `requestJoin`
6. `approveJoinRequest`
7. `getConvo`
8. `listConvos`
9. `getMessages`
10. `getLog`

**Dependencias**

- BE-05

### Ticket BE-22: Habilitar entorno de pruebas real

**Objetivo**

Salir de confianza de compilacion y pasar a confianza de comportamiento.

**Trabajo**

- habilitar Docker en entorno local o CI
- instalar o provisionar `psql`
- documentar bootstrap del entorno

**Criterios de aceptacion**

- se pueden correr suites de integracion sin pasos manuales opacos

**Dependencias**

- ninguna

### Ticket BE-23: Instrumentacion y metricas

**Objetivo**

Tener visibilidad operativa de comunidades y grupos.

**Metricas minimas**

- `createBoard.success`
- `createBoard.failure`
- `group.create.success`
- `group.create.failure`
- `community.join.success`
- `community.join.failure`
- errores por endpoint y por codigo

**Dependencias**

- BE-07
- BE-14
- BE-04

## Orden Recomendado de Ejecucion

### Bloque A: Modelo y contratos

1. BE-01
2. BE-02
3. BE-03

### Bloque B: Capacidad backend real

4. BE-04
5. BE-05
6. BE-06
7. BE-07
8. BE-08
9. BE-09

### Bloque C: Lecturas para frontend

10. BE-10
11. BE-11
12. BE-12
13. BE-13
14. BE-14
15. BE-15

### Bloque D: Gobernanza y analitica

16. BE-16
17. BE-17
18. BE-18
19. BE-19

### Bloque E: Pruebas y operacion

20. BE-22
21. BE-20
22. BE-21
23. BE-23

## Paquete Minimo para Desbloquear Frontend

Si se quiere desbloquear la implementacion inicial de frontend sin prometer todo el sistema completo, el paquete minimo serio es:

- BE-01
- BE-02
- BE-03
- BE-04
- BE-07
- BE-09
- BE-10
- BE-12
- BE-14

Con eso frontend ya podria:

- crear comunidad
- ver comunidad
- conocer estado de membresia
- unirse a comunidad
- navegar a canales institucionales

Sin ese paquete, frontend tendria que seguir infiriendo contratos desde mocks, labels y records no formalizados.

## Riesgos si se Recorta Mal el Alcance

### Riesgo 1: usar `para_status.community` como membresia

Resultado:

- no hay multi-comunidad real
- los conteos seran incorrectos
- la UX tipo Reddit quedara estructuralmente limitada

### Riesgo 2: tratar chats institucionales como comunidad

Resultado:

- membresia comunitaria y capacidad institucional se mezclan
- los limites `270` y `30` rompen el modelo de comunidad

### Riesgo 3: entregar a frontend `createBoard` sin idempotencia

Resultado:

- comunidades duplicadas
- chats huerfanos
- fallos imposibles de reconciliar facil

### Riesgo 4: seguir con `strictResponseProcessing: false` sin formalizar records

Resultado:

- se posponen errores de contrato
- frontend integra contra payloads blandos
- el costo aparece mas tarde y mas caro

## Handoff Posterior a Frontend

Cuando backend complete el paquete minimo, el documento para frontend debe incluir:

- endpoints finales
- payloads ejemplo
- errores de negocio
- estados de membresia
- `viewerCapabilities`
- flujo de creacion
- flujo de join/leave
- reglas de navegacion a chats institucionales

## Conclusion

Este plan convierte el trabajo de comunidades Para en una secuencia concreta.

La prioridad correcta no es agregar mas lecturas ni mas mocks, sino:

- formalizar dominio
- implementar grupos reales
- implementar `createBoard`
- separar membresia de etiquetas
- recien despues exponer una API limpia a frontend
