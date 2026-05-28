# Plan de Implementación: Pilar 1 — sorteo Verificable (drand)

> **Estado:** Código base escrito (`src/drand.ts`, `src/sortition.ts`)  
> **Faltante:** Integración completa con firehose, persistencia de proofs, UI de verificación

---

## 1. Objetivo

Reemplazar el sortition determinista (`djb2Hash`) por sortition criptográficamente verificable usando **drand** (https://drand.love). Cada asignación de cámara debe ser:

1. **Impredecible** antes del momento de asignación
2. **Verificable** por cualquier tercero después
3. **Auditada** on-chain (como record AT Protocol o al menos en SQLite con hash publicado)
4. **Resiliente** (fallback si drand no responde)

---

## 2. Arquitectura

```
┌─────────────┐     fetch beacon      ┌─────────────┐
│   drand     │ ────────────────────> │   Bridge    │
│  (externo)  │   round N             │             │
└─────────────┘                       │ 1. sha256(   │
                                      │     beacon +│
                                      │     did +   │
                                      │     community
                                      │    )        │
                                      │ 2. Persist  │
                                      │    proof    │
                                      └──────┬──────┘
                                             │
                                      ┌──────┴──────┐
                                      │  SQLite DB  │
                                      │ sortition_  │
                                      │  proofs     │
                                      └─────────────┘
```

---

## 3. Fases de Implementación

### Fase A: Integrar drand en el ciclo de membresía (2-3h)

**Archivos:** `src/firehose.ts`, `src/sortition.ts`

**Pasos:**

1. En `handleBicameralInvite`, reemplazar `assignChamberBalanced` por `assignChamberVerifiable`
2. Si drand falla (timeout, red caída), fallback a `assignChamberBalanced` + log de advertencia
3. Guardar el `SortitionProof` retornado en una nueva tabla `sortition_proofs`

**Cambio clave en `firehose.ts`:**

```ts
// Antes:
chamber = assignChamberBalanced(userDid, communityUri, countA, countB)

// Después:
try {
  const proof = await assignChamberVerifiable(
    userDid,
    communityUri,
    countA,
    countB,
  )
  chamber = proof.chamber
  db.saveSortitionProof(proof)
} catch {
  chamber = assignChamberBalanced(userDid, communityUri, countA, countB)
  log.warn({ userDid, communityUri }, 'drand failed, using fallback sortition')
}
```

---

### Fase B: Persistencia de proofs (1-2h)

**Archivos:** `src/db.ts`

**Nueva tabla:**

```sql
CREATE TABLE sortition_proofs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  did TEXT NOT NULL,
  community_uri TEXT NOT NULL,
  chamber TEXT NOT NULL,
  drand_round INTEGER NOT NULL,
  drand_randomness TEXT NOT NULL,
  hash_input TEXT NOT NULL,  -- beacon + did + community
  hash_output TEXT NOT NULL, -- sha256 result
  timestamp TEXT NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0,
  UNIQUE(did, community_uri)
);
```

**Métodos:**

- `saveSortitionProof(proof: SortitionProof)`
- `getSortitionProof(did, communityUri)`
- `verifyAllProofs()` — batch verification para auditoría

---

### Fase C: Endpoint de verificación pública (1h)

**Archivos:** `src/index.ts`

**Nuevo endpoint:**

```
GET /api/sortition-proof?did=...&community=...
```

Responde con el proof completo para que cualquiera pueda verificar.

**Otro endpoint:**

```
POST /api/verify-sortition
Body: { did, communityUri, round, randomness }
```

Re-calcula la asignación y confirma que coincide con la guardada.

---

### Fase D: Publicación on-chain (opcional, 2-3h)

**Nuevo lexicon:** `com.para.sortition.proof`

El bridge, después de guardar el proof en SQLite, también crea un record AT Protocol:

```json
{
  "did": "did:plc:abc",
  "community": "at://...",
  "chamber": "A",
  "drandRound": 4567890,
  "drandRandomness": "a3f2b1...",
  "hashOutput": "sha256:...",
  "timestamp": "2026-05-05T..."
}
```

Esto hace la sorteo **inmutable y públicamente auditable** sin depender del bridge.

**Consideración:** Esto requiere que el bridge tenga una cuenta AT Protocol propia (un DID) para crear records. Es un cambio arquitectónico mediano.

---

### Fase E: UI en app PARA (2-3h)

**Archivos:** `PARA/src/screens/Communities/...`

**Nuevo componente:** `SortitionBadge` — se muestra en el perfil de comunidad o en la pantalla de chat.

```tsx
// Muestra: "Tu asignación a Cámara A es verificable"
// Al tocar: abre modal con los detalles del proof
// Incluye botón "Verificar" que llama a POST /api/verify-sortition
```

**Hook:**

```ts
useSortitionProof(did, communityUri) -> { chamber, round, randomness, verified }
```

---

### Fase F: Tests y resiliencia (2h)

1. **Mock de drand** para tests unitarios
2. **Test de fallback:** simular timeout de drand, verificar que usa djb2Hash
3. **Test de verificación:** crear proof conocido, verificar que `verifySortitionProof` devuelve true
4. **Test de integridad:** modificar un proof en DB, verificar que `verifySortitionProof` devuelve false

---

## 4. Consideraciones de Producción

| Riesgo                      | Mitigación                                                                  |
| --------------------------- | --------------------------------------------------------------------------- |
| drand caído                 | Fallback automático a djb2Hash + alerta Prometheus                          |
| Latencia de drand (~500ms)  | Async fetch, no bloquea el invite. Si tarda >2s, fallback                   |
| Re-sortition masivo         | drand tiene rate limits. Cachear beacon por 30s para reutilizar mismo round |
| Manipulación de proof en DB | Hash del proof se publica on-chain o en un log inmutable                    |

---

## 5. Métricas

```
para_sortition_drand_total          ← Sortitions con drand
para_sortition_fallback_total       ← Sortitions con fallback
para_sortition_verification_total   ← Verificaciones exitosas
para_sortition_verification_failed  ← Verificaciones fallidas
para_drand_latency_seconds          ← Latencia de fetch a drand
```

---

## 6. Orden de ejecución recomendado

```
Fase A (integrar en firehose)
  ↓
Fase B (persistencia en DB)
  ↓
Fase C (endpoints REST)
  ↓
Fase F (tests)
  ↓
Deploy a producción
  ↓
Fase D (publicación on-chain) ← solo si se quiere auditoría externa
  ↓
Fase E (UI en app)
```

---

## 7. Tiempo estimado

| Fase         | Tiempo          |
| ------------ | --------------- |
| A + B + C    | 4-6 horas       |
| F (tests)    | 2 horas         |
| D (on-chain) | 2-3 horas       |
| E (UI app)   | 2-3 horas       |
| **Total**    | **10-14 horas** |

---

_"La democracia no necesita fe. Necesita pruebas."_
