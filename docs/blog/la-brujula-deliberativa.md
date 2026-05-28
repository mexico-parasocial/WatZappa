# La Brújula Deliberativa: Cuando el espacio político deja de ser metáfora

_Publicado: 14 de mayo de 2026_  
_Autor: Equipo PARA_

---

## El problema con los hilos

Los feeds mataron la política.

No lo hicieron a propósito. Simplemente, un hilo cronológico es el formato más pobre imaginable para el pensamiento colectivo. Cada post empuja al anterior hacia el olvido. La atención se concentra en lo que acaba de llegar, no en lo que importa. Un debate que necesitaría días de maduración se resuelve en veinte minutos de reacciones viscerales.

En PARA no creemos que el problema sean las personas. Creemos que el problema es el **espacio**.

Cuando ciudadanos atenienses deliberaban en la ágora, no lo hacían en una lista ordenada por tiempo. Lo hacían en un **espacio físico** donde la proximidad significaba algo: los que estaban cerca compartían contexto; los que estaban lejos traían perspectiva nueva; los que se movían entre grupos hacían de puentes. La geometría de la plaza era también geometría del entendimiento.

La pregunta que nos hicimos fue simple: ¿y si recuperamos eso?

---

## La Brújula como territorio

PARA ya tiene una brújula política. Cada usuario se posiciona en un plano de dos ejes: autoridad/libertad y economía izquierda/derecha. Hasta ahora eso era un widget de perfil. Bonito, pero decorativo.

La Brújula Deliberativa lo convierte en **territorio**.

```
                    ↑ Autoritario
                    │
    ← Izquierda     │     Derecha →
                    │
                    ↓ Libertario
```

Imagina un canvas zoomable donde cada comunidad tiene su propio mapa. Los usuarios aparecen como puntos luminosos en sus coordenadas. Las propuestas son tarjetas que alguien arrastra y suelta en una posición del plano. La posición no es arbitraria: indica el **enfoque ideológico** de la propuesta.

- Una tarjeta sobre impuestos progresivos colocada en `(-0.6, +0.3)` dice: "esto es una propuesta de izquierda, con cierta intervención estatal".
- Una tarjeta sobre mercados de carbono en `(+0.4, -0.2)` dice: "esto usa mecanismos de mercado para objetivos colectivos".

**La proximidad ahora significa algo real.** Si estás en `(-0.5, +0.2)` y ves una propuesta en `(-0.4, +0.1)`, esa propuesta está en tu vecindario ideológico. No tienes que estar de acuerdo. Pero compartes marco de referencia. El debate puede ser productivo.

Si la misma propuesta aparece en `(+0.7, -0.6)`, sabes que alguien la está leyendo desde un universo conceptual distinto. Eso no la invalida. Pero cambia el tipo de conversación que necesita.

---

## Cómo se complementan las piezas

La Brújula Deliberativa no es una feature aislada. Es el **centro de gravedad** donde todo lo demás de PARA converge.

### 1. La brújula personal + el mapa comunitario

Tu posición en la brújula personal (`app.bsky.actor.profile`) alimenta tu posición en el mapa comunitario. Cuando entras a una comunidad, apareces en el canvas junto a otros miembros. La densidad de puntos en una zona revela el sesgo ideológico de la comunidad. Una comunidad donde todos los puntos se amontonan en el cuadrante autoritario-derecha tiene un problema de diversidad que los moderadores pueden ver — no como estadística, sino como **patrón espacial**.

### 2. El Mapa Cívico Comunitario + la brújula

El Mapa Cívico (la pantalla que ya funciona en PARA) muestra nodos conectados: propuestas, relaciones de apoyo/oposición, evidencias. Hoy esos nodos viven en un grafo abstracto. En la Brújula Deliberativa, cada nodo tiene **coordenadas**. El grafo no es solo topología de relaciones; es también topología de perspectivas.

Cuando dos nodos están conectados por una arista "opone", pero geométricamente están cerca, eso es señal de **tensión productiva**: dos visiones similares que discrepan en algo específico. Cuando dos nodos "oponen" pero están en lados opuestos del canvas, eso es **polarización**: no se entienden porque no comparten premisas.

El sistema de sugerencias de relaciones (el que ya usa NER + LLM en PARA) se vuelve más inteligente: prioriza sugerir puentes entre zonas del canvas que están aisladas.

### 3. La deliberación por sortición + el espacio

PARA ya tiene sortición verificable con drand. Las cámaras de deliberación se asignan al azar. En la Brújula Deliberativa, cada cámara tiene su propia **sala virtual** con geometría: una mesa redonda donde la posición de cada asiento es aleatoria (para evitar jerarquías visuales), pero las propuestas sobre la mesa conservan sus coordenadas del canvas comunitario.

Una cámara que debate una propuesta del cuadrante libertario-izquierda verá esa propuesta colocada en esa zona del espacio compartido. Los miembros de la cámara pueden caminar virtualmente hacia ella, alejarse, agruparse. El moderador (elegido por sortición, no por voto) puede ver patrones de movimiento que revelan dinámicas de grupo invisibles en una videollamada.

### 4. El voto cuadrático + la física del espacio

En PARA estamos implementando votación cuadrática (QV): cada usuario tiene una cantidad limitada de "créditos de voz" y el coste de votar `n` veces a favor de algo es `n²`.

En la Brújula Deliberativa, los créditos de voz son **monedas físicas** que llevas en el canvas. Cuando apilas monedas sobre una propuesta, tu avatar se vuelve visualmente más "ligero" — has gastado tu capital deliberativo. No puedes estar en todas partes. No puedes gritar en todos los rincones. El espacio impone la misma escasez que la QV impone matemáticamente.

### 5. La identidad cívica verificada + la confianza espacial

PARA tiene dos sistemas de verificación: `app.bsky.graph.verification` (la marca azul genérica) y `com.para.identity` (la aprobación de figura pública con contexto de comunidad). En la Brújula Deliberativa, la verificación no es solo un badge. Es un **halo de confianza** que afecta cómo tu voz viaja en el espacio.

Una propuesta de una figura verificada dentro de una comunidad emite una señal más fuerte en el canvas de esa comunidad que una propuesta anónima. Pero —y esto es crucial— el halo se atenúa con la distancia ideológica. Una figura pública de extrema derecha que propone algo en el cuadrante izquierdista no tiene ventaja por su estatus. La geometría del espacio corregge el sesgo de autoridad.

---

## El ecosistema de almacenamiento que lo hace posible

Todo esto genera datos. Muchos datos. Y de tipos que un PDS tradicional no está diseñado para manejar:

| Tipo de dato | Tamaño | Frecuencia | Dónde vive |
|-------------|--------|-----------|-----------|
| Estado del canvas (posiciones de nodos) | 10–100 KB | Cada interacción | Hot, cacheado en Redis |
| Geometría de salas de deliberación | 1–10 MB | Por evento | Warm, SeaweedFS |
| Grabaciones de sesiones (audio espacial) | 50–200 MB | Por town hall | Warm, SeaweedFS, 30 días |
| Mallas de avatar (glTF) | 5–50 MB | Por usuario | Cold, SeaweedFS, CDN |
| Artefactos de consenso (votos firmados) | 10–100 KB | Por propuesta | Hot, permanente, auditado |

Por eso estamos migrando el almacenamiento de blobs de PARA a **SeaweedFS**: un backend S3 autoalojado que puede escalar desde un Mac Mini en desarrollo hasta un clúster de tres nodos (VPS + Mac Mini + laptop) con replicación geográfica. Los metadatos de la brújula viven en SQLite y Postgres. Los bytes pesados (geometrías, grabaciones, avatares) viven en SeaweedFS.

---

## Lo que no es

La Brújula Deliberativa **no es un metaverso**. No necesitas gafas de realidad virtual. No hay gráficos AAA. Es un canvas 2D zoomable con física ligera — algo que React Native renderiza sin problemas en un teléfono de gama media.

Tampoco es un juego. No hay puntos ni leaderboards. La "física" del espacio (distancia, proximidad, atenuación) es una **metáfora rigurosa** para cómo funciona realmente la deliberación: las ideas cercanas comparten premisas; las lejanas requieren traducción; las que están en el centro conectan mundos.

---

## El primer paso

No vamos a construir todo esto de una vez. El primer paso es el **canvas de propuestas**: una pantalla donde los miembros de una comunidad pueden ver las propuestas existentes dispuestas según sus coordenadas de brújula, arrastrarlas, y votar cuadráticamente sobre ellas.

Eso ya está en el roadmap. El backend de sortición ya funciona. El sistema de identidad cívica ya está desplegado. El almacenamiento SeaweedFS ya está corriendo en el clúster de desarrollo. La Brújula Deliberativa es la capa de presentación que une todo.

Cuando alguien pregunte "¿por qué PARA no es solo otra red social?", la respuesta estará en el canvas: **porque aquí las ideas tienen dirección, distancia y vecindario. Y eso cambia cómo discutimos.**

---

*Para preguntas técnicas sobre la implementación de SeaweedFS en PARA, revisa `mvp/PARA/dev-env/seaweedfs/README.md`. Para contribuir al diseño de la Brújula Deliberativa, abre un issue en el repositorio con el tag `spatial-deliberation`.*
