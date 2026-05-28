# Reporte Tecnico: Backend de Comunidades Para

## Objetivo

Definir el estado real del backend de comunidades en `watx`, identificar los huecos que bloquean una implementacion tipo Reddit para Para, y proponer un contrato y flujo completo para que backend y frontend puedan avanzar sin ambiguedad.

Este reporte esta enfocado en tres preguntas:

1. Que existe hoy de verdad en produccion.
2. Que solo existe como superficie de API, mock o proyeccion parcial.
3. Cual es el modelo minimo correcto para soportar creacion y manejo de comunidades sin faltar funcionalidad esencial.

## Resumen Ejecutivo

El backend actual ya expone piezas reales para leer estado comunitario y discurso:

- `com.para.community.getGovernance`
- `com.para.discourse.getSnapshot`
- `com.para.discourse.getTopics`
- `com.para.discourse.getSentiment`

Pero el backend todavia no soporta comunidades como entidad transaccional completa.

Los dos huecos estructurales mas importantes son:

1. `com.para.community.createBoard` existe como lexicon pero no esta implementado en el servidor real.
2. `chat.bsky.group.*` fue sincronizado a nivel de lexicon y cliente, pero no tiene handlers reales en produccion.

Ademas, el modelo actual trata `community` principalmente como etiqueta singular en varios records y proyecciones. Eso no alcanza para una aplicacion tipo Reddit, donde un usuario puede pertenecer a multiples comunidades y donde la comunidad debe existir como entidad propia, separada de sus canales internos de gobernanza.

La recomendacion central es esta:

- modelar `Community` como agregado propio
- modelar membresia como relacion N:M
- tratar los chats `270` y `30` como recursos adjuntos de gobernanza, no como la comunidad misma
- implementar `createBoard` como orquestacion real
- formalizar contratos de lectura y mutacion antes de entregar el feature a frontend

## Hallazgos Verificados

### 1. Hay lectura real de gobernanza y discurso

En produccion, el servidor `bsky` registra endpoints `com.para` de lectura en:

- `packages/bsky/src/api/index.ts`

Alli se registran:

- `getParaCommunityGovernance`
- `getParaDiscourseSnapshot`
- `getParaDiscourseTopics`
- `getParaDiscourseSentiment`

La lectura de gobernanza se resuelve en:

- `packages/bsky/src/api/com/para/community/getGovernance.ts`
- `packages/bsky/src/data-plane/server/routes/profile.ts`

La lectura de discurso se resuelve en:

- `packages/bsky/src/api/com/para/discourse/getSnapshot.ts`
- `packages/bsky/src/api/com/para/discourse/getTopics.ts`
- `packages/bsky/src/api/com/para/discourse/getSentiment.ts`
- `packages/bsky/src/data-plane/server/routes/discourse.ts`

### 2. `createBoard` no existe en produccion

El contrato existe en el lexicon:

- `lexicons/com/para/community/createBoard.json`

Pero no esta registrado en:

- `packages/bsky/src/api/index.ts`

Solo aparece un mock en desarrollo en:

- `packages/dev-env/src/chat.ts`

Ese mock:

- crea dos group convos acotados
- devuelve `delegatesChatId` y `subdelegatesChatId`
- no persiste un record real de `com.para.community.board`
- no hace orquestacion transaccional
- no implementa reglas de negocio de comunidad

### 3. `chat.bsky.group.*` no esta implementado en el servidor real

Los lexicons existen y los clientes fueron regenerados, por ejemplo:

- `lexicons/chat/bsky/group/createGroup.json`
- `lexicons/chat/bsky/group/addMembers.json`
- `lexicons/chat/bsky/group/editGroup.json`
- `lexicons/chat/bsky/group/requestJoin.json`

Pero no hay handlers reales en `packages/bsky/src/api`.

Lo unico implementado que aparece es un mock parcial en:

- `packages/dev-env/src/chat.ts`

Ese mock solo cubre parte de `addMembers` y una version simplificada de `createBoard`.

### 4. El modelo actual usa `community` como etiqueta, no como membresia real

Ejemplos:

- `lexicons/com/para/status.json` define un `community` singular.
- `packages/bsky/src/data-plane/server/db/tables/para-status.ts` persiste un solo `community` por usuario.
- `lexicons/com/para/social/postMeta.json` etiqueta posts con un solo `community`.
- `lexicons/com/para/civic/cabildeo.json` agrega `community` y opcionalmente `communities`, pero no define membresia de usuarios a comunidades.

Esto sirve para clasificacion y ranking, pero no para una comunidad tipo subreddit.

## Diagnostico de Arquitectura

### Lo que el sistema ya sabe hacer

El sistema ya sabe:

- proyectar status social/politico por usuario
- agregar discurso por comunidad
- leer gobernanza publicada desde records
- etiquetar posts y cabildeos por comunidad

### Lo que el sistema todavia no sabe hacer bien

El sistema todavia no sabe:

- crear comunidades como entidad de primer nivel
- mantener membresia N:M entre usuarios y comunidades
- separar membresia general de roles de gobernanza
- orquestar la creacion de chats internos asociados a una comunidad
- exponer un contrato estable para frontend de creacion, join, leave, list y detalle de comunidad

### Problema principal de diseño

Hoy el dominio esta mezclando tres cosas distintas:

1. Comunidad como espacio publico de participacion.
2. Gobernanza como estructura institucional.
3. Chats internos como canales operativos limitados.

Si esas tres cosas no se separan en el backend, el frontend inevitablemente va a tener que inferir reglas que deberian venir del servidor.

## Modelo de Dominio Recomendado

### Entidades principales

#### Community

Representa la comunidad publica.

Campos minimos:

- `id`
- `slug`
- `name`
- `description`
- `quadrant`
- `visibility`
- `creatorDid`
- `status`
- `createdAt`
- `updatedAt`

#### CommunityMembership

Relacion N:M entre usuario y comunidad.

Campos minimos:

- `communityId`
- `did`
- `membershipState`
- `joinedAt`
- `leftAt`
- `source`

Estados recomendados:

- `pending`
- `active`
- `blocked`
- `removed`
- `left`

#### CommunityGovernance

Configuracion de gobernanza y roster institucional.

Campos minimos:

- `communityId`
- `moderators`
- `officials`
- `deputyRoles`
- `metadata`
- `editHistory`

#### CommunityBoard

Ancla entre comunidad y chats institucionales.

Campos minimos:

- `communityId`
- `delegatesChatId`
- `subdelegatesChatId`
- `createdAt`

#### CommunityDiscourseSnapshot

Proyeccion analitica, no source of truth.

### Regla importante

Los chats `270` y `30` no deben representar la membresia total de la comunidad.

Deben representar:

- delegados
- subdelegados
- o canales institucionales limitados

No deben ser la fuente primaria de:

- numero total de miembros
- listado general de comunidad
- permisos de posteo comunitario
- discoverability

## Contrato Backend Recomendado

### Mutaciones minimas

#### `com.para.community.createBoard`

Debe convertirse en implementacion real.

Responsabilidades:

1. validar auth
2. validar nombre y `quadrant`
3. reservar slug unico
4. verificar rate limits
5. crear comunidad
6. crear chats internos `270` y `30`
7. persistir board record
8. sembrar gobernanza inicial
9. emitir auditoria
10. devolver comunidad hidratada o ids suficientes para hidratarla

#### Nuevos endpoints recomendados

- `com.para.community.getBoard`
- `com.para.community.listBoards`
- `com.para.community.searchBoards`
- `com.para.community.updateBoard`
- `com.para.community.join`
- `com.para.community.leave`
- `com.para.community.getMembership`
- `com.para.community.listMembers`
- `com.para.community.archiveBoard`

### Lecturas minimas

Frontend necesitara al menos:

- detalle de comunidad
- conteo real de miembros
- estado de membresia del viewer
- enlaces a governance chats
- capacidad de publicar en la comunidad
- reglas de ingreso
- metadata de gobernanza
- snapshots de discurso

## Flujo Completo de Comunidad

Este es el flujo minimo que evita huecos esenciales.

### 1. Crear comunidad

Actor: usuario autenticado

Pasos:

1. cliente llama `com.para.community.createBoard`
2. backend valida nombre, slug y `quadrant`
3. backend crea entidad `Community`
4. backend crea board institucional
5. backend crea `delegatesChatId`
6. backend crea `subdelegatesChatId`
7. backend crea membresia inicial del creador como `active`
8. backend crea gobernanza inicial del creador como moderador fundador
9. backend devuelve:
   - `communityId`
   - `slug`
   - `uri`
   - `cid`
   - `delegatesChatId`
   - `subdelegatesChatId`
   - `viewerMembership`

### 2. Ver comunidad

Actor: cualquier usuario

Frontend necesita un payload que combine:

- identidad de comunidad
- descripcion
- quadrant/nonant/25th
- conteos
- governance summary
- discourse summary
- membership del viewer
- permisos del viewer

### 3. Unirse a la comunidad

Actor: usuario autenticado

Pasos:

1. cliente llama `join`
2. backend valida politica de ingreso
3. backend crea o reactiva `CommunityMembership`
4. backend actualiza contadores
5. backend emite auditoria
6. backend devuelve nuevo estado de membresia

### 4. Salirse de la comunidad

Pasos:

1. cliente llama `leave`
2. backend marca membresia como `left`
3. si el usuario tenia rol institucional, exige transferencia o limpieza
4. backend no elimina por defecto historial de contribucion

### 5. Participar en la comunidad

Publicar contenido en comunidad no debe depender de estar en los chats internos.

Debe depender de:

- membresia
- reglas de visibilidad
- reglas de moderacion
- eventualmente reputacion/edad/cuenta

### 6. Gobernanza

La gobernanza debe poder existir aunque los chats cambien.

Operaciones minimas:

- asignar moderadores
- publicar governance record
- definir deputy roles
- registrar applicants
- aceptar/rechazar applicants
- registrar historial de cambios

### 7. Canales institucionales

Los chats `270` y `30` sirven para coordinacion limitada.

Reglas recomendadas:

- `270` = canal mas amplio de delegados o representantes
- `30` = canal operativo mas restringido

Estos canales necesitan:

- limites duros de tamano
- reglas de invitacion
- logs de acciones administrativas
- validacion de permisos
- integracion con board

## Reglas de Negocio Minimas

### Seguridad e integridad

- rate limiting para `createBoard`
- idempotency key para creacion
- unicidad de slug por comunidad
- limites de nombre y descripcion
- validacion de `quadrant`
- proteccion contra doble submit
- auditoria de acciones administrativas
- metricas de error por endpoint

### Para `chat.bsky.group.*`

Si se van a usar en comunidades, el backend real debe soportar al menos:

- `createGroup`
- `addMembers`
- `removeMembers`
- `editGroup`
- `createJoinLink`
- `requestJoin`
- `approveJoinRequest`
- `rejectJoinRequest`
- `listJoinRequests`
- `getGroupPublicInfo`

Y debe tener:

- limites de tamano
- validacion de permisos
- validacion de relaciones
- idempotencia para operaciones sensibles
- logs de system messages
- consistencia entre `getConvo`, `listConvos`, `getMessages` y `getLog`

## Disciplina de Contrato

`strictResponseProcessing: false` fue una decision razonable para absorber drift entre cliente y servidor, pero no debe ser el mecanismo principal de compatibilidad.

La disciplina correcta es:

- formalizar cada record y procedimiento relevante
- no depender de records descubiertos por convencion cuando el frontend necesita contratos estables
- evitar respuestas con placeholders donde frontend espere semantica fuerte
- mantener enums abiertos solo cuando el cliente pueda degradar de forma segura

### Caso concreto

Hoy `getGovernance` lee de un record `com.para.community.governance` por convencion desde el `record` store, pero no hay evidencia de un lexicon formal equivalente en este arbol. Eso hay que corregir antes de escalar la integracion frontend.

## Pruebas Necesarias

### Integracion de creacion de comunidad

Debe existir una prueba end-to-end que valide:

1. crear comunidad
2. persistir board
3. crear chats institucionales
4. crear membresia inicial
5. leer comunidad
6. leer gobernanza
7. leer discourse summary vacio o inicial

### Integracion de grupos

Debe validar:

1. `createGroup`
2. `addMembers`
3. `removeMembers`
4. join links
5. `getConvo`
6. `listConvos`
7. `getMessages`
8. `getLog`
9. presencia de `SystemMessageView`

### Infra de pruebas

La verificacion real sigue bloqueada mientras no haya:

- Docker corriendo
- o `psql` instalado localmente

Hasta entonces, la confianza sigue siendo de compilacion y lectura de codigo, no de comportamiento completo.

## Orden Recomendado de Implementacion

### Fase 1: Fundaciones

1. Implementar handlers reales de `chat.bsky.group.*`
2. Implementar `com.para.community.createBoard`
3. Crear modelo de membresia N:M
4. Formalizar `com.para.community.governance`

### Fase 2: Lecturas estables

1. `getBoard`
2. `listBoards`
3. `getMembership`
4. `listMembers`
5. hidratar comunidad completa para frontend

### Fase 3: Operacion y seguridad

1. auditoria
2. rate limiting
3. idempotencia
4. metricas
5. pruebas de integracion

### Fase 4: Handoff a frontend

Entregar a frontend:

- endpoints definitivos
- payloads de comunidad
- estados de membresia
- reglas de errores
- flujo de creacion
- flujo de join/leave
- contrato de gobernanza

## Recomendaciones para el Handoff a Frontend

Frontend no deberia depender de:

- inferir membresia desde `para_status.community`
- deducir comunidad desde los chats institucionales
- leer records arbitrarios sin contrato
- adivinar reglas de capacidad o rol

Frontend si deberia recibir del backend:

- `viewerMembershipState`
- `viewerCapabilities`
- `communityId`
- `slug`
- `delegatesChatId`
- `subdelegatesChatId`
- `memberCount`
- `governanceSummary`
- `canPost`
- `canJoin`
- `canInvite`
- `canModerate`

## Conclusion

El backend de Para ya tiene una base util para lectura de gobernanza y discurso, pero todavia no modela comunidades como sistema completo.

La prioridad correcta no es seguir agregando superficie de API, sino completar la integridad del dominio:

- comunidad como entidad
- membresia como relacion N:M
- gobernanza como capa separada
- chats institucionales como recursos acotados
- mutaciones reales de creacion y administracion

Solo despues de eso conviene entregar a frontend una integracion estable para creacion de comunidades.
