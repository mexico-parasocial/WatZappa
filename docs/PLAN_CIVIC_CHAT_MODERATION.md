# Plan: Medallas de Moderación para Chat de Comunidad

> **Principio rector:** Las medallas negativas son visibles por defecto en el chat de comunidad. Las medallas positivas de participación son privadas por defecto (solo visibles en el panel de moderación). Ninguna medalla aparece en perfiles públicos sin consentimiento explícito del usuario.
>
> **Objetivo:** Dar a moderadores y miembros contexto de comportamiento en tiempo real, sin gamificar la reputación pública.

---

## 1. Taxonomía de Medallas

### 1.1 Medallas de Riesgo (visibles por defecto en chat para **todos**)

Estas medallas se computan a partir de **denuncias recibidas** dentro de la comunidad y **sanciones activas** en Synapse. Son visibles para todo miembro de la comunidad junto al nombre de usuario en el timeline de chat.

| Medalla       | Icono | Condición                                     | Expiración                      |
| ------------- | ----- | --------------------------------------------- | ------------------------------- |
| `reported`    | ⚠️    | 1–2 denuncias en últimos 30 días              | 30 días sin nuevas denuncias    |
| `contentious` | 🔥    | 3–5 denuncias en últimos 30 días              | 60 días sin nuevas denuncias    |
| `high_risk`   | ⛔    | 6+ denuncias en últimos 30 días               | 90 días sin nuevas denuncias    |
| `sanctioned`  | 🚫    | Sanción activa en Synapse (mute/ban temporal) | Al levantarse la sanción        |
| `newcomer`    | 🆕    | < 7 días en comunidad y < 10 mensajes         | Al cumplir 7 días o 10 mensajes |
| `lurker`      | 👻    | > 30 días en comunidad y < 5 mensajes         | Al enviar 5 mensajes            |

**Reglas de visualización:**

- Solo se muestra la medalla de **mayor severidad** si hay múltiples.
- `sanctioned` tiene prioridad absoluta sobre todas las demás.
- `newcomer` y `lurker` son informativas, no punitivas.

### 1.2 Medallas de Participación (privadas por defecto)

Visibles **solo en el panel de moderación** o si el usuario elige mostrarlas.

| Medalla                   | Icono | Condición                                       | Fuente de datos                                  |
| ------------------------- | ----- | ----------------------------------------------- | ------------------------------------------------ |
| `voter`                   | 🗳️    | Ha votado en ≥ 1 propuesta                      | Tabla `votes`                                    |
| `proposer`                | 📢    | Ha creado ≥ 1 propuesta que pasó a deliberación | Tabla `proposals`                                |
| `delegate`                | 🏛️    | Tiene rol de delegate en la comunidad           | Matrix power levels                              |
| `moderator`               | 🛡️    | Tiene rol de moderator en la comunidad          | Matrix power levels                              |
| `chamber_a` / `chamber_b` | ⚖️    | Asignación de cámara (sortition)                | Tabla `chamber_assignments` + `sortition_proofs` |

### 1.3 Medallas Positivas Públicas (opt-in)

El usuario puede togglear visibilidad desde configuración de comunidad. Por defecto: **ocultas**.

| Medalla          | Icono | Condición                                                          |
| ---------------- | ----- | ------------------------------------------------------------------ |
| `active_citizen` | ⭐    | Ha votado + propuesto + participado en chat (≥ 3 stamps positivos) |
| `trusted_voice`  | 🎙️    | ≥ 6 meses sin denuncias + tier de participación alto               |

---

## 2. Arquitectura

### 2.1 Esquema de Base de Datos (SQLite, bridge)

#### `chat_moderation_events`

Registro inmutable de eventos de moderación (denuncias, sanciones).

```sql
CREATE TABLE chat_moderation_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  did TEXT NOT NULL,
  community_uri TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('report_received', 'sanction_applied', 'sanction_lifted', 'mute', 'unmute', 'ban', 'unban')),
  -- report specifics
  reporter_did TEXT,           -- quién reportó (null para sanciones automáticas)
  report_reason TEXT,          -- spam, abuse, hate, other
  reported_event_id TEXT,      -- Matrix event ID reportado
  reported_message_preview TEXT, -- primeros 200 chars del mensaje
  -- sanction specifics
  sanction_type TEXT CHECK(sanction_type IN ('mute', 'ban', 'redact')),
  sanction_duration_minutes INTEGER,
  sanctioned_by_did TEXT,      -- moderador que aplicó sanción
  -- metadata
  matrix_room_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_moderation_events_did_community ON chat_moderation_events(did, community_uri);
CREATE INDEX idx_moderation_events_type_created ON chat_moderation_events(event_type, created_at);
CREATE INDEX idx_moderation_events_community_created ON chat_moderation_events(community_uri, created_at);
```

#### `chat_participation_stats`

Métricas agregadas de participación por usuario/comunidad, actualizadas por el bridge.

```sql
CREATE TABLE chat_participation_stats (
  did TEXT NOT NULL,
  community_uri TEXT NOT NULL,
  matrix_room_id TEXT,
  -- mensajería
  message_count INTEGER DEFAULT 0,
  first_message_at TEXT,
  last_message_at TEXT,
  -- gobernanza
  votes_cast INTEGER DEFAULT 0,
  proposals_created INTEGER DEFAULT 0,
  proposals_reached_quorum INTEGER DEFAULT 0,
  -- sortition
  chamber TEXT CHECK(chamber IN ('A', 'B')),
  sortition_proof_id INTEGER,
  -- roles
  is_delegate INTEGER DEFAULT 0,
  is_moderator INTEGER DEFAULT 0,
  -- timestamps
  joined_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (did, community_uri)
);

CREATE INDEX idx_participation_community ON chat_participation_stats(community_uri);
CREATE INDEX idx_participation_joined ON chat_participation_stats(joined_at);
```

#### `chat_user_badges` (cache computada)

Medallas activas de cada usuario, recalculadas por cron cada 5 minutos o bajo demanda.

```sql
CREATE TABLE chat_user_badges (
  did TEXT NOT NULL,
  community_uri TEXT NOT NULL,
  badge_type TEXT NOT NULL,
  severity TEXT CHECK(severity IN ('info', 'warning', 'critical')),
  visible_in_chat INTEGER DEFAULT 1,   -- 0 = solo panel de moderación
  expires_at TEXT,                      -- null = no expira
  computed_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (did, community_uri, badge_type)
);
```

### 2.2 Bridge — Nuevo Módulo (`src/chat-moderation.ts`)

```ts
export class ChatModerationEngine {
  constructor(db: BridgeDatabase, matrix: MatrixAdminClient, log: Logger)

  // Ingesta de eventos
  async ingestReport(report: SynapseReportPayload): Promise<void>
  async ingestSanction(event: SynapseSanctionEvent): Promise<void>

  // Actualización de participación (llamado desde firehose)
  async recordMessage(
    did: string,
    communityUri: string,
    roomId: string,
    eventId: string,
  ): Promise<void>
  async recordVote(
    did: string,
    communityUri: string,
    proposalUri: string,
  ): Promise<void>
  async recordProposal(
    did: string,
    communityUri: string,
    proposalUri: string,
  ): Promise<void>

  // Cómputo de medallas
  async computeBadges(did: string, communityUri: string): Promise<ChatBadge[]>
  async recomputeAllBadges(communityUri?: string): Promise<number> // batch

  // Queries
  async getUserBadges(
    did: string,
    communityUri: string,
    viewerRole?: 'member' | 'moderator',
  ): Promise<ChatBadge[]>
  async getMemberList(
    communityUri: string,
    filters: MemberListFilters,
  ): Promise<MemberWithBadges[]>
  async getModerationDashboard(
    communityUri: string,
  ): Promise<ModerationDashboard>
}
```

### 2.3 Algoritmo de Cómputo de Medallas

```ts
function computeBadges(did, communityUri, stats, events):
  badges = []

  // --- RIESGO ---
  reports30d = count(events.where(type='report_received' AND created_at > now-30d))
  activeSanction = find(events.where(type IN ('mute','ban') AND NOT lifted))

  if activeSanction:
    badges.push({type: 'sanctioned', severity: 'critical', visible: true})
  else if reports30d >= 6:
    badges.push({type: 'high_risk', severity: 'critical', visible: true})
  else if reports30d >= 3:
    badges.push({type: 'contentious', severity: 'warning', visible: true})
  else if reports30d >= 1:
    badges.push({type: 'reported', severity: 'warning', visible: true})

  // --- ANTIGÜEDAD / PARTICIPACIÓN ---
  daysSinceJoin = diff(now, stats.joined_at).days
  if daysSinceJoin < 7 AND stats.message_count < 10:
    badges.push({type: 'newcomer', severity: 'info', visible: true})
  else if daysSinceJoin > 30 AND stats.message_count < 5:
    badges.push({type: 'lurker', severity: 'info', visible: true})

  // --- PARTICIPACIÓN (privadas por defecto) ---
  if stats.votes_cast > 0:
    badges.push({type: 'voter', severity: 'info', visible: false})
  if stats.proposals_created > 0:
    badges.push({type: 'proposer', severity: 'info', visible: false})
  if stats.is_delegate:
    badges.push({type: 'delegate', severity: 'info', visible: false})
  if stats.is_moderator:
    badges.push({type: 'moderator', severity: 'info', visible: false})

  return badges
```

### 2.4 Integración con Synapse (Denuncias)

Synapse no emite webhooks de denuncias por defecto. Opciones:

**Opción A: Polling periódico (recomendada para MVP)**

- Endpoint: `GET /_synapse/admin/v1/event_reports`
- Frecuencia: cada 5 minutos
- El bridge filtra por `room_id` de comunidades conocidas

**Opción B: Webhook via synapse-auto-accept-invite o módulo custom**

- Más complejo, requiere modificar Synapse
- Dejar para post-MVP

**Opción C: Manual (moderador reporta via app PARA)**

- Moderador reporta desde la app PARA (no desde Element)
- El bridge recibe el reporte y lo ingesta
- Funciona inmediatamente sin tocar Synapse

**Decisión:** Implementar **Opción C** primero (reporte manual desde app PARA), luego **Opción A** (polling de Synapse) como mejora.

### 2.5 Integración con Element Web

Ya inyectamos CSS/JS en Element Web via WebView. Para mostrar medallas:

```js
// Inyectado junto a HIDE_UI_JS
function injectChatBadges() {
  // Observa el DOM de la lista de miembros y timeline
  // Inserta badge junto al nombre de usuario si el bridge
  // expone un endpoint /api/chat-badges?did=...
}
```

Alternativa más limpia: **no modificar Element Web**. En su lugar:

- App PARA muestra lista de miembros nativa con medallas
- Tapping un miembro abre perfil nativo con medallas
- Element Web sigue siendo solo para mensajería

**Decisión:** Lista de miembros nativa en PARA con medallas. No tocar Element Web para esto.

---

## 3. API REST (Bridge)

### `GET /api/chat-badges`

Query params: `did`, `community` (AT URI), `viewerRole` (optional)

```json
{
  "did": "did:plc:abc123",
  "community": "at://did:plc:community123/app.bsky.graph.list/xxx",
  "visibleBadges": [
    {
      "type": "reported",
      "severity": "warning",
      "label": "Reportado",
      "icon": "⚠️",
      "since": "2026-05-01T10:00:00Z"
    }
  ],
  "hiddenBadges": [
    { "type": "voter", "severity": "info", "label": "Votante", "icon": "🗳️" }
  ],
  "participation": {
    "tier": "participant",
    "messageCount": 47,
    "votesCast": 3,
    "proposalsCreated": 1,
    "daysInCommunity": 45
  }
}
```

### `GET /api/chat-member-list`

Query params: `community`, `filter` (reported | contentious | high_risk | sanctioned | newcomer | lurker | all), `sort` (risk | activity | join_date), `limit`, `offset`

```json
{
  "members": [
    {
      "did": "did:plc:abc123",
      "displayName": "Juan Pérez",
      "badges": [{"type": "high_risk", ...}],
      "participation": {"messageCount": 12, "votesCast": 0, ...},
      "lastActiveAt": "2026-05-05T08:00:00Z"
    }
  ],
  "total": 128,
  "filters": {
    "reported_count": 5,
    "contentious_count": 2,
    "high_risk_count": 1,
    "newcomer_count": 8
  }
}
```

### `POST /api/moderation-report`

Body:

```json
{
  "reportedDid": "did:plc:abc123",
  "communityUri": "at://...",
  "reason": "spam",
  "context": "Mensaje promocional repetido",
  "matrixEventId": "$abc123:matrix.para.social",
  "reporterDid": "did:plc:def456"
}
```

Auth: requiere sesión válida + que el reporter sea miembro de la comunidad.

### `POST /api/moderation-sanction`

Solo moderadores. Aplica sanción via Synapse Admin API e ingesta el evento.

Body:

```json
{
  "targetDid": "did:plc:abc123",
  "communityUri": "at://...",
  "type": "mute",
  "durationMinutes": 60,
  "reason": "Spam recurrente"
}
```

### `GET /api/moderation-dashboard`

Solo moderadores. Vista de riesgo de comunidad.

```json
{
  "community": "at://...",
  "summary": {
    "totalMembers": 128,
    "activeToday": 34,
    "reportedThisWeek": 7,
    "sanctionedNow": 2
  },
  "riskDistribution": {
    "low": 115,
    "warning": 10,
    "critical": 3
  },
  "recentEvents": [
    {
      "type": "report_received",
      "did": "...",
      "reason": "spam",
      "createdAt": "..."
    }
  ]
}
```

---

## 4. UI en App PARA

### 4.1 Indicador sutil en avatares del timeline

**No hay badges de texto inline junto al nombre.** Eso satura la conversación y rompe el flujo de lectura.

En su lugar, cada avatar en el timeline tiene un **indicador de color sutil** en la esquina inferior derecha:

| Severidad  | Color del indicador   | Significado                         |
| ---------- | --------------------- | ----------------------------------- |
| `info`     | 🟢 verde suave        | `newcomer` o `lurker` — informativo |
| `warning`  | 🟡 amarillo           | `reported` — 1-2 denuncias          |
| `warning`  | 🟠 naranja            | `contentious` — 3-5 denuncias       |
| `critical` | 🔴 rojo               | `high_risk` — 6+ denuncias          |
| `critical` | ⚫ negro + borde rojo | `sanctioned` — sanción activa       |

- El indicador es un círculo de **6px** con borde de 1.5px blanco (para separar del avatar).
- Sin texto, sin tooltips en hover. La información se obtiene **tapping el avatar**.
- Tapping el avatar abre `MemberProfileModal` con todas las medallas (riesgo + participación) detalladas.
- Los avatares sin indicador = usuario sin eventos de riesgo ni contexto especial.

**En Element Web (WebView):** no se modifica el DOM de Element. El indicador solo existe en la UI nativa de PARA. Si la conversación es via WebView, el indicador no se muestra — el mod/viewer debe abrir `CommunityMembersScreen` para ver el contexto.

### 4.2 Barra superior de info del chat

En el header de `CommunityChatScreen`, junto al nombre de la comunidad, un indicador agregado de **salud de la conversación**:

```
[←] Comunidad Centro          [🟡 2] [⚖️ A] [⋯]
```

- `[🟡 2]` = 2 miembros con medallas de riesgo (`warning`+) activas en la sala.
- Tapping `[🟡 2]` navega a `CommunityMembersScreen` filtrado por "Riesgo".
- Si no hay riesgos, el indicador no aparece (no hay "0" innecesario).
- El indicador usa el color de la severidad más alta presente en la sala.

### 4.3 Lista de miembros con filtros

Nueva pantalla `CommunityMembersScreen` accesible desde header de `CommunityChatScreen`:

- Search bar
- Filter chips: Todos | Reportados | Nuevos | Inactivos | Sancionados
- Sort: Riesgo ↑ | Actividad reciente | Antigüedad
- Cada fila: Avatar | Nombre | Medallas | Última actividad

Tapping una fila abre `MemberProfileModal` con:

- Badges visibles + ocultas (si viewer es moderator)
- Historial de participación
- Botones de moderación (Mute / Ban / Reportar)

### 4.5 Panel de moderador

`ModeratorDashboardScreen` — pantalla completa accesible desde `CommunityMembersScreen` (solo visible si `isModerator`):

- Resumen de riesgo de la comunidad (gráfico donut: bajo / warning / critical)
- Lista de miembros filtrada por defecto a "Reportados"
- Botón "Sancionar" rápida con duración preset (15 min, 1h, 24h, 7d)
- Feed de eventos recientes (reportes, sanciones, apelaciones)

### 4.6 React Query Hooks

```ts
// hooks
useChatBadgesQuery(did, communityUri) // para badge junto a nombre
useChatMemberListQuery(communityUri, filters) // para lista de miembros
useModerationDashboardQuery(communityUri) // solo mods
useReportUserMutation() // reportar desde app
useApplySanctionMutation() // sancionar desde app
```

---

## 5. Flujos de Moderación

### 5.1 Reporte desde App PARA

```
Usuario A (miembro):
  1. Long-press en mensaje de Usuario B
  2. Selecciona "Reportar"
  3. Elige razón: spam | abuso | odio | otro
  4. Opcional: contexto adicional
  5. POST /api/moderation-report

Bridge:
  6. Valida que A y B son miembros de la comunidad
  7. Inserta en chat_moderation_events
  8. Recompute badges para B
  9. Notifica a moderadores via push
```

### 5.2 Sanción desde Panel de Moderador (dentro de PARA)

Las sanciones se aplican **directamente desde la app PARA**, no desde Element Web. Esto da a los moderadores una herramienta unificada donde ven el contexto completo (medallas, historial, reportes) y actúan sin cambiar de app.

```
Moderador en PARA:
  1. Abre CommunityMembersScreen desde el header del chat
  2. Filtra por "Reportados" u ordena por riesgo
  3. Tapping en Usuario B → MemberProfileModal
  4. Ve badges de riesgo + historial de participación + reportes recibidos
  5. Toca "Sancionar" → selecciona tipo y duración
     - Tipos: Silenciar (mute) | Expulsar (kick) | Bloquear (ban)
     - Duraciones preset: 15 min | 1 h | 24 h | 7 d | Permanente
  6. Confirma razón (obligatorio, max 300 chars)
  7. POST /api/moderation-sanction

Bridge:
  8. Valida que el caller es moderator de la comunidad
  9. Llama Synapse Admin API:
     - Mute: POST /_synapse/admin/v1/rooms/{roomId}/mute
     - Ban: PUT /_matrix/client/v3/rooms/{roomId}/ban
     - Kick: POST /_matrix/client/v3/rooms/{roomId}/kick
  10. Inserta sanction_applied en chat_moderation_events
  11. Recompute badges (ahora tiene 🚫)
  12. Notifica a Usuario B via push:
      "Has sido silenciado en [Comunidad] por [razón]. Duración: [X]."
  13. Notifica a moderadores restantes:
      "[Moderador] sancionó a [Usuario] en [Comunidad]."
```

**Por qué desde PARA y no desde Element:**

- Element Web no conoce el modelo de comunidad PARA (AT URIs, DIDs, badges).
- PARA tiene el contexto completo: reportes acumulados, medallas, participación.
- Evita que un mod sancione en Element sin ver que ya hay 3 reportes pendientes en PARA.
- Synapse sigue siendo la fuente de verdad para el estado de sanción; PARA solo es el frontend que orquesta.

### 5.3 Auto-expiración de Medallas

Cron cada 5 minutos:

```
FOR cada badge en chat_user_badges WHERE expires_at < now():
  DELETE badge
  recomputeBadges(did, communityUri)
```

---

## 6. Políticas y Salvaguardas

### Anti-gaming

- **Rate limit:** máximo 3 reportes por usuario por día.
- **Reportes mutuos:** si A reporta a B y B reporta a A en 24h, ambos reportes se marcan como "disputa" y no computan para badges hasta revisión de moderador.
- **Penalización por reportes falsos:** si un moderador marca un reporte como "falso", el reporter acumula un contador interno. 3 reportes falsos → 30 días sin poder reportar.

### Privacidad

- Los datos de moderación nunca se publican como records AT Protocol.
- Solo el bridge tiene acceso a `chat_moderation_events`.
- Los moderadores solo ven datos de **su comunidad**, no cross-community.

### Transparencia

- Usuario sancionado recibe push con razón y duración.
- Usuario reportado puede ver **cuántas denuncias** tiene (no quién reportó) en su perfil de comunidad.
- Apelaciones: futuro feature. Por ahora, contactar a moderador directamente.

---

## 7. Cronograma de Implementación

### Fase 1: Infraestructura (1–2 días)

- [ ] Crear tablas `chat_moderation_events`, `chat_participation_stats`, `chat_user_badges` en `db.ts`
- [ ] Crear módulo `chat-moderation.ts` con métodos de ingesta y cómputo
- [ ] Integrar `recordMessage` en `firehose.ts` (mensajes de Matrix)
- [ ] Integrar `recordVote` / `recordProposal` en `proposals.ts`

### Fase 2: API REST (1 día)

- [ ] `POST /api/moderation-report`
- [ ] `POST /api/moderation-sanction`
- [ ] `GET /api/chat-badges`
- [ ] `GET /api/chat-member-list`
- [ ] `GET /api/moderation-dashboard`
- [ ] Middleware de auth: verificar membership + moderator status

### Fase 3: UI App PARA (2–3 días)

- [ ] `useChatBadgesQuery` hook
- [ ] `ChatBadge` component (inline junto a nombre)
- [ ] `CommunityMembersScreen` con filtros
- [ ] `MemberProfileModal` con badges + acciones de mod
- [ ] `ModeratorDashboardScreen` (solo mods)
- [ ] Report flow: long-press en mensaje → bottom sheet

### Fase 4: Tests (1 día)

- [ ] Tests unitarios para `computeBadges` lógica
- [ ] Tests de integración para endpoints de moderación
- [ ] Tests de DB para tablas nuevas

### Fase 5: Synapse Integration (post-MVP)

- [ ] Polling de `/_synapse/admin/v1/event_reports`
- [ ] Ingesta automática de sanciones aplicadas fuera de PARA

---

## 8. Métricas

| Métrica                             | Descripción                         |
| ----------------------------------- | ----------------------------------- |
| `moderation_report_total`           | Counter de reportes recibidos       |
| `moderation_sanction_total`         | Counter de sanciones aplicadas      |
| `moderation_badge_compute_duration` | Histogram de tiempo de cómputo      |
| `moderation_false_report_total`     | Counter de reportes marcados falsos |
| `participation_messages_total`      | Counter de mensajes por comunidad   |

---

## 9. Comparativa: Stamps Originales vs. Nuevo Sistema

| Aspecto          | Stamps Originales       | Nuevo Sistema               |
| ---------------- | ----------------------- | --------------------------- |
| **Visibilidad**  | Pública (perfil)        | Contextual (chat)           |
| **Énfasis**      | Acumulación positiva    | Señalización de riesgo      |
| **Gamificación** | Sí (tiers, leaderboard) | No (no hay score numérico)  |
| **Datos**        | Solo participación      | Participación + denuncias   |
| **Audiencia**    | Todos los usuarios      | Moderadores + peers en chat |
| **Privacidad**   | DID público             | Eventos de mod internos     |
| **Expiración**   | Nunca                   | Sí (30/60/90 días)          |
