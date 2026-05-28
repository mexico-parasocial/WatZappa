# Reporte: Civic Stamps — Proof of Participation (PoP)

> **Estado:** Implementación original completada y luego depriorizada. Este reporte reconstruye lo que existía para que sirva de base al nuevo diseño de medallas de moderación de chat.
>
> **Decisión de producto:** El sistema de "Civic Score" numérico público agregaba complejidad innecesaria dado que ya existen badges de sortition, insignias de partido y el sistema de influencia. Sin embargo, los **stamps como evidencia de participación** son valiosos como inputs para herramientas de moderación interna de comunidad.

---

## 1. Visión Original

**Civic Stamps** eran sellos de participación cívica no transferibles, no especulativos, que acumulaban un **Civic Score** reflejando engagement genuino en comunidades PARA.

A diferencia de "followers" o "likes":

- **No gamificable:** requiere eventos on-chain de comunidad (votos, propuestas, asignación de cámara).
- **Preserva privacidad:** solo DID, sin PII.
- **Interoperable:** records estándar de AT Protocol.
- **Transparente:** cualquiera puede auditar el ledger de stamps.

## 2. Tipos de Stamp

| Tipo           | Peso | Descripción                                 | Trigger                           |
| -------------- | ---- | ------------------------------------------- | --------------------------------- |
| `deliberation` | 1.0  | Participó en discusión de cámara            | Mensaje en sala de cámara         |
| `vote`         | 2.0  | Votó en decisión comunitaria                | Record `com.para.civic.vote`      |
| `proposal`     | 3.0  | Autor de propuesta que alcanzó quorum       | Record `com.para.civic.proposal`  |
| `moderation`   | 2.5  | Sirvió como moderador                       | Acción de moderación en Matrix    |
| `sortition`    | 0.5  | Fue seleccionado para cámara                | Asignación de cámara (drand/djb2) |
| `bridge`       | 0.5  | Primer login Matrix / participación en chat | Primer mensaje en comunidad       |

## 3. Tiers de Reputación

| Tier          | Umbral | Nombre           |
| ------------- | ------ | ---------------- |
| `observer`    | 0      | Observador       |
| `participant` | 10     | Participante     |
| `stakeholder` | 50     | Stakeholder      |
| `elder`       | 200    | Miembro fundador |

## 4. Arquitectura

### 4.1 Bridge (`services/matrix-bridge/src/civic.ts`)

```ts
class CivicReputationEngine {
  issueStamp(did, type, communityUri, opts?) // emite stamp
  getScore(did) // score acumulado + tier
  getCommunityLeaderboard(communityUri, limit?) // ranking local
  getGlobalLeaderboard(limit?) // ranking global
}
```

### 4.2 Base de Datos (SQLite)

Tabla `civic_stamps`:

```sql
CREATE TABLE civic_stamps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  did TEXT NOT NULL,
  type TEXT NOT NULL,
  community_uri TEXT,
  round INTEGER,           -- para sortition: drand round
  weight REAL NOT NULL,
  memo TEXT,
  created_at TEXT NOT NULL
);
```

Índices:

- `did + community_uri` para score local
- `did` para score global
- `community_uri + created_at` para leaderboard

### 4.3 Endpoints REST

- `GET /api/civic-score?did={did}` → `{totalScore, tier, stampCount, byType, communities}`
- `GET /api/civic-leaderboard?community={uri}&limit=20` → ranking por comunidad
- `GET /api/civic-global-leaderboard?limit=50` → ranking global

### 4.4 Integración en Firehose

Los `issueStamp` se invocaban desde:

- `firehose.ts` → `handleMembershipChange()` emitía `sortition` + `bridge`
- `proposals.ts` → `processProposals()` emitía `vote` al registrar voto
- `proposals.ts` → al aprobar propuesta emitía `proposal` al autor

## 5. Lexicons Relacionados (existentes)

Los siguientes lexicons ya estaban en `lexicons/com/para/civic/`:

- **`com.para.civic.vote`** — voto firmado con `signal` (-3 a +3) o `selectedOption`
- **`com.para.civic.cabildeo`** — propuesta de deliberación estructurada
- **`com.para.civic.delegation`** — delegación de voto
- **`com.para.civic.position`** — posición en cabildeo
- **`com.para.civic.putLivePresence`** — presencia en sesión en vivo

El lexicon `com.para.civic.insignia` fue removido al depriorizar stamps públicos.

## 6. APP PARA — Componentes Relacionados

- **`civic-insignias.ts`** — sistema visual de insignias para partidos/comunidades (colores, shields, banners). **No removido** — sigue usándose para mostrar colores de comunidad en posts.
- **`civic-autocomplete.ts`** — autocomplete para flairs políticos (`#policy`, `#matter`, `/raq`, `/open-question`). **No removido** — sigue activo en composer.
- **`civic-read-smoke-checklist.md`** — checklist de QA para flujos cívicos. **No removido**.
- **`civic-seed/`** — scripts de seeding de datos cívicos para desarrollo. **No removido**.

## 7. Lecciones Aprendidas

1. **Score numérico público = gamificación forzada.** Los usuarios optimizan lo que se mide.
2. **Complejidad acumulativa.** Entre sortition badge, insignias de partido, sistema de influencia y ahora un score cívico, la UI de perfil se saturaba.
3. **Los datos subyacentes son valiosos.** Aunque el score público no funcionó, los **eventos de participación** (votos, propuestas, denuncias, asignaciones) son datos de primera clase para **moderación**.
4. **Contexto importa más que acumulación.** Un usuario con 200 stamps puede ser un elder o un spammer. El contexto de _qué tipo_ de stamps y _qué tan recientes_ es más útil que un número agregado.

## 8. Hacia el Nuevo Sistema: Medallas de Moderación de Chat

La decisión de remover el score público no significa desechar los datos. La nueva dirección es:

> **Usar los stamps (y nuevos eventos como denuncias) como inputs para un sistema de medallas de moderación interna de chat**, visible por defecto solo en contextos de comunidad, nunca en perfiles públicos.

Ver `PLAN_CIVIC_CHAT_MODERATION.md` para el diseño completo.
