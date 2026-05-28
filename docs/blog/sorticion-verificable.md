# sorteo Verificable: Por qué PARA no puede depender de la fe

_Publicado: 5 de mayo de 2026_  
_Autor: Equipo de Infraestructura PARA_

---

## La pregunta incómoda

Imagina que entras a una comunidad en PARA, te asignan a una cámara de deliberación, y un mes después descubres que alguien pudo haber predicho —antes de que ocurriera— exactamente quién quedaría en cada cámara.

¿Seguirías confiando en las decisiones de esa comunidad?

Esa es la pregunta que nos hicimos cuando diseñamos la arquitectura bicameral de PARA. Y la respuesta nos llevó a construir algo que, hasta donde sabemos, ninguna otra plataforma de participación cívica tiene: **sorteo verificable con drand**.

---

## ¿Qué es la sorteo?

En las democracias antiguas —Atenas, principalmente— los ciudadanos no votaban a sus representantes. Los representantes se elegían por **sorte**: se metían los nombres en una urna y se sacaban al azar.

La sorteo tenía una ventaja fundamental sobre las elecciones: **evitaba la captura del sistema**. No había campañas, no había financiamiento, no había redes de influencia. El azar no se deja sobornar.

PARA recupera esta idea. Cuando te unes a una comunidad bicameral, un algoritmo te asigna a la Cámara A o a la Cámara B. Cada cámara tiene ~135 personas. Las dos cámaras deliberan por separado, llegan a conclusiones distintas (o similares), y luego se comparan resultados. Si ambas cámaras llegan a lo mismo, es probable que sea una buena decisión. Si no, se abre un espacio de diálogo entre cámaras.

El problema: **el algoritmo que te asigna a tu cámara debe ser imposible de manipular. Y no basta con que lo sea. Debe ser demostrablemente imposible de manipular.**

---

## El problema con los algoritmos deterministas

Nuestra primera implementación usaba `djb2Hash(did + communityUri)`. Es una fórmula matemática sencilla: toma tu identificador, toma el identificador de la comunidad, los concatena, les aplica una función hash, y si el resultado es par vas a la Cámara A, si es impar a la B.

Es rápido. Es justo en términos estadísticos. Pero tiene un defecto grave: **es predecible**.

Si alguien conoce la fórmula y la lista de identificadores, puede calcular —antes de que la comunidad se active— quién caerá en cada cámara. En una plataforma pequeña, esto no importa. En una plataforma que pretende ser infraestructura cívica para miles de comunidades, esto es una bomba de tiempo.

El daño no es solo técnico. Es **de legitimidad**. Si alguien puede demostrar que el algoritmo era predecible, todas las decisiones tomadas por esa comunidad quedan en entredicho. No importa si nadie la manipuló. Importa que **no podemos demostrar que no fue manipulada**.

La democracia no puede depender de la fe.

---

## drand: aleatoriedad que nadie controla

Entra drand.

drand (https://drand.love) es una red descentralizada que emite un **beacon de aleatoriedad criptográfica** cada 3 segundos. No es un servicio. Es una federación de organizaciones independientes —Cloudflare, EPFL, UCL, Protocol Labs, y otras— que colaboran para generar números que **ninguna de ellas puede predecir ni controlar**.

### ¿Cómo funciona?

drand usa criptografía de umbral. Cada nodo tiene una porción de una clave privada, pero la clave completa nunca existe en un solo lugar. Para generar un beacon, una mayoría de nodos debe colaborar. Si alguien quiere manipular el resultado, tendría que comprometer a la mayoría de los nodos simultáneamente.

El beacon generado es público, permanente, y verificable. Cualquiera puede:

1. Pedir el beacon de un round específico
2. Verificar la firma criptográfica que lo acompaña
3. Confirmar que fue generado correctamente

**drand es la infraestructura de aleatoriedad más segura que existe hoy.** Y es gratuita.

---

## Cómo PARA usa drand

Cuando te unes a una comunidad bicameral, PARA hace esto:

```
1. Pide el último beacon de drand
   → drand responde: round #4,567,890, randomness: "a3f2b1..."

2. Combina el beacon con tu identidad:
   input = beacon + tu_did + uri_de_la_comunidad

3. Aplica SHA-256:
   output = sha256(input)

4. Interpreta el resultado:
   si output < threshold → Cámara A
   si output ≥ threshold → Cámara B
```

### Load balancing inteligente

El `threshold` no es siempre 0.5. Si la Cámara A ya tiene 60% de los miembros y la Cámara B solo 40%, el threshold se desplaza para favorecer a la B. Esto garantiza que ninguna cámara se sature sin romper la verificabilidad: el threshold usado se publica junto con el proof.

### El proof

PARA guarda un **proof** (prueba) de cada asignación:

| Campo             | Significado                    |
| ----------------- | ------------------------------ |
| `drandRound`      | ¿Qué beacon de drand se usó?   |
| `drandRandomness` | ¿Cuál fue el valor del beacon? |
| `hashInput`       | ¿Qué se le puso a SHA-256?     |
| `hashOutput`      | ¿Qué salió de SHA-256?         |
| `threshold`       | ¿Qué umbral se usó?            |

Con estos seis campos, **cualquiera puede reproducir el cálculo** y verificar que la asignación fue correcta.

---

## Verificación paso a paso

Supón que PARA te asignó a la Cámara A. ¿Cómo sabes que no te mintieron?

**Paso 1:** Pide tu proof.

```bash
curl "https://bridge.para.social/api/sortition-proof?\
  did=did:plc:abc123&\
  community=at://did:plc:creator/com.para.community.board/miciudad"
```

**Paso 2:** El proof viene con todo lo necesario.

```json
{
  "did": "did:plc:abc123",
  "communityUri": "at://did:plc:creator/com.para.community.board/miciudad",
  "chamber": "A",
  "drandRound": 4567890,
  "drandRandomness": "a3f2b1...",
  "hashInput": "a3f2b1...did:plc:abc123at://did:plc:creator...",
  "hashOutput": "7d8e9f...",
  "threshold": 0.47,
  "timestamp": "2026-05-05T14:23:00Z"
}
```

**Paso 3:** Verifica tú mismo.

```bash
# Pide el beacon de drand para ese round
curl "https://api.drand.sh/52db9ba7.../public/4567890"

# Comprueba que el randomness coincide
# Aplica SHA-256(input)
# Comprueba que el resultado da la misma cámara
```

**Paso 4:** Si quieres, publícalo.

El endpoint `/api/sortition-proof-as-record` te devuelve el proof en formato AT Protocol. Puedes publicarlo en tu propio PDS como un record `com.para.sortition.proof`, firmado por tu propia clave, inmutable, y auditable por cualquiera.

---

## ¿Y si drand falla?

La red de drand es robusta, pero no infalible. Si en el momento de tu asignación drand no responde (timeout, caída de red, ataque DDoS), PARA no se detiene. Usa un **fallback determinista** (`djb2Hash`) y lo marca en las métricas.

```
para_sortition_drand_total: 1,247      ← asignaciones verificables
para_sortition_fallback_total: 3       ← asignaciones con fallback
```

Cada fallback se registra, se audita, y se puede revisar. No es ideal, pero es transparente.

---

## Comparativa con otras plataformas

| Plataforma                | sorteo           | ¿Verificable?          | ¿Descentralizado? |
| ------------------------- | ---------------- | ---------------------- | ----------------- |
| Sortition Foundation (UK) | ✅               | ❌ No publican proofs  | ❌ Centralizado   |
| DemocracyOS               | ❌ No usa sorteo | —                      | —                 |
| Pol.is                    | ❌ No usa sorteo | —                      | —                 |
| Loomio                    | ❌ No usa sorteo | —                      | —                 |
| Decidim                   | ❌ No usa sorteo | —                      | —                 |
| **PARA**                  | **✅**           | **✅ drand + SHA-256** | **✅ Federado**   |

PARA es, hasta donde sabemos, la única plataforma de deliberación que combina sorteo bicameral con verificación criptográfica descentralizada.

---

## Conclusión

La sorteo es el corazón de la democracia en PARA. Si el corazón puede cuestionarse, todo el cuerpo enferma.

drand nos da algo que la democracia ateniense no tenía: **la capacidad de demostrar que la urna no estaba cargada**. Los atenienses confiaban en que el funcionario de turno no haría trampa. Nosotros no pedimos confianza. Ofrecemos prueba.

> _"La democracia no necesita fe. Necesita pruebas."_

---

## Recursos

- [drand.love](https://drand.love) — La red de aleatoriedad verificable
- [research.swtch.com/tlog](https://research.swtch.com/tlog) — Transparent Logs for Skeptical Clients (Russ Cox)
- [API de PARA](https://bridge.para.social/api/sortition-proof) — Verifica tu propia asignación
- [Repositorio](https://github.com/pararepo/para) — Código abierto

---

_¿Tienes preguntas? ¿Quieres auditar tu propia asignación? Escribe a infra@para.social o abre un issue en nuestro repo._
