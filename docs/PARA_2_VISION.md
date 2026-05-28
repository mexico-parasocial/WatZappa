# PARA 2.0 — Tres Pilares del Poder del Usuario

> _"La democracia no es un destino. Es una infraestructura."_

---

## Visión

PARA no es una app de chat. Es una **infraestructura de soberanía cívica**. Cada comunidad es un micro-estado democrático con reglas propias, sorteo verificable, y reputación acumulativa que no puede comprarse ni transferirse.

Los tres pilares que implementamos hoy transforman PARA de plataforma social a **plataforma de gobernanza**.

---

## Pilar 1: sorteo Verificable (drand)

### El problema

El sortition actual usa `djb2Hash(did + communityUri)`. Es determinista y justo, pero **teóricamente predecible**. Si alguien conoce todos los DIDs y la fórmula, puede calcular la composición de las cámaras antes de que ocurra.

### La solución

Usamos **drand** (https://drand.love) — un beacon de aleatoriedad descentralizado que emite un valor criptográfico cada 3 segundos. Nadie, ni siquiera los operadores de drand, puede predecir el valor antes de que sea emitido.

```
beacon = drand.round(N)  // público, verificable
chamber = sha256(beacon.randomness + did + communityUri)
```

### Propiedades

- **No manipulable**: El beacon viene de una red descentralizada
- **Verificable**: Cualquiera puede reproducir el cálculo
- **Transparente**: El número de round usado se publica on-chain

### Archivos

- `src/drand.ts` — Cliente drand + verificación
- `src/sortition.ts` — `assignChamberVerifiable()`

---

## Pilar 2: Proof of Participation (PoP)

### El problema

En redes sociales tradicionales, la "reputación" es followers + likes. Es gamificable, comprable, y no refleja participación cívica real.

### La solución

Cada acción cívica en PARA genera un **sello** (stamp) en SQLite:

| Tipo           | Peso | Cuándo se emite                          |
| -------------- | ---- | ---------------------------------------- |
| `sortition`    | 0.5  | Al ser asignado a una cámara             |
| `bridge`       | 0.5  | Al unirse al chat de una comunidad       |
| `proposal`     | 3.0  | Al crear una comunidad                   |
| `deliberation` | 1.0  | _(futuro)_ Al participar en deliberación |
| `vote`         | 2.0  | _(futuro)_ Al votar en una decisión      |
| `moderation`   | 2.5  | _(futuro)_ Al servir como moderador      |

---

## Pilar 2: Constitución como Código

### El problema

Las reglas de una comunidad (quórum, umbral de aprobación, duración de deliberación) viven en documentos informales o en la cabeza de los fundadores. No son auditables ni versionables.

### La solución

Cada comunidad define su **constitución** como un record AT Protocol:

```json
{
  "community": "at://did:plc:abc/com.para.community.board/miciudad",
  "version": 3,
  "rules": {
    "quorum": 0.51,
    "approvalThreshold": 0.66,
    "deliberationDays": 14,
    "votingDays": 7,
    "chamberSize": 135,
    "observerSize": 30,
    "autoModeration": {
      "enabled": true,
      "spamThreshold": 5,
      "toxicityThreshold": 0.8
    },
    "budget": {
      "enabled": true,
      "matchingPool": 5000,
      "minContribution": 50,
      "roundDurationDays": 90
    }
  }
}
```

### Qué habilita

- **Quórum programable**: Una propuesta no puede votarse sin X días de deliberación
- **Moderación automatizada**: Reglas de spam/toxicidad definidas por la comunidad, no por PARA central
- **Presupuesto comunitario**: Quadratic funding integrado. Cada miembro contribuye, el matching se calcula con la fórmula cuadrática.
- **Versionado**: Cada cambio a la constitución es un nuevo record, con historial completo

### API

- `GET /api/constitution?uri=...` — Obtener constitución vigente de una comunidad

### Archivos

- `lexicons/com/para/community/constitution.json` — Lexicon AT Protocol
- `src/constitution.ts` — Parser, validator, quadratic funding
- `src/db.ts` — Tabla `community_constitution`

---

## Quadratic Funding

Fórmula: `matching_i = (Σ√contribuciones_i)² / Σ(Σ√contribuciones_j)² * pool`

Esto significa que **muchas contribuciones pequeñas generan más matching** que pocas contribuciones grandes. Es la matemática de la democracia participativa.

Implementado en `src/constitution.ts` → `quadraticMatching()`.

---

## Integración con lo existente

| Feature existente  | Integración                                                                  |
| ------------------ | ---------------------------------------------------------------------------- |
| Firehose consumer  | Escucha `com.para.community.constitution`, aplica reglas automáticamente     |
| Sortition          | Puede usar drand o mantener djb2Hash como fallback                           |
| Push notifications | Las notificaciones de Matrix ahora incluyen `communityUri` para deep linking |
| Bridge HTTP API    | Nuevos endpoints: `/api/constitution`                                        |

---

## Roadmap de activación

### Ya implementado (hoy)

- [x] drand client + verifiable sortition
- [x] Constitution lexicon + parser + quadratic funding
- [x] Endpoints REST para consulta
- [x] Integración en firehose

### Próximos pasos

- [ ] UI para explorar constituciones de comunidades
- [ ] Implementar `canStartVoting()` en el ciclo de vida de propuestas
- [ ] Integrar quadratic funding con pagos reales (Stripe/Bitcoin)
- [ ] Moderación automática con modelo local (Whisper + LLM en 5950X)

---

_"El que controla la aleatoriedad, controla la democracia. El que controla la reputación, controla el acceso. El que controla las reglas, controla el juego. En PARA, el usuario controla los tres."_
