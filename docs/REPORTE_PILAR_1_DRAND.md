# Reporte: ¿Por qué necesitamos sorteo Verificable?

> **Para:** Comité de Arquitectura PARA  
> **De:** Equipo de Infraestructura  
> **Fecha:** 2026-05-05  
> **Asunto:** Justificación del Pilar 1 — sorteo Verificable con drand

---

## 1. El problema: La confianza es un recurso finito

PARA es una plataforma de **deliberación bicameral**. Eso significa que cuando un ciudadano se une a una comunidad, un algoritmo decide si va a la Cámara A o a la Cámara B. Esa decisión no es cosmética: define con quién deliberará, qué perspectivas escuchará, y en última instancia, qué consensos alcanzará.

Hoy usamos `djb2Hash(did + communityUri)`. Es determinista, rápido, y da una distribución 50/50. **Pero tiene un problema de confianza.**

---

## 2. El riesgo: sorteo determinista = predecible

### Escenario de ataque (teórico, hoy)

```
Atacante:
1. Obtiene la lista de todos los DIDs registrados en PARA
2. Conoce la fórmula: djb2Hash(did + communityUri) % 2
3. Calcula la asignación de TODOS los miembros antes de que se unan
4. Identifica quiénes quedarán en cada cámara
5. Crea 50 cuentas falsas (sybil) que sabe que caerán en la Cámara A
6. La Cámara A queda manipulada. La deliberación está comprometida.
```

**¿Es fácil?** Sí. Cualquier desarrollador con acceso al repo puede ejecutar:

```js
for (const did of allDids) {
  const chamber = djb2Hash(did + communityUri) % 2 ? 'A' : 'B'
  console.log(did, chamber)
}
```

**¿Es probable?** Hoy no. PARA es pequeño y la comunidad es de confianza. Pero PARA no está construyendo para hoy. Está construyendo para cuando gobierne deliberaciones de municipios, universidades, y cooperativas con miles de miembros y presupuestos millonarios.

Cuando haya dinero, poder, o reputación en juego, **la previsibilidad se convierte en vulnerabilidad.**

---

## 3. El daño reputacional

Imaginemos que en 2028 una comunidad de 5,000 personas en PARA vota un presupuesto de $500,000 USD. El resultado se impugna:

> _"El algoritmo de asignación de cámaras era predecible. Demuestro que el 60% de los miembros de la Cámara A fueron asignados de forma calculable antes de la votación. La deliberación no fue imparcial. Invaliden el resultado."_

Sin importar si el ataque ocurrió o no, **la sola posibilidad de que ocurriera destruye la legitimidad del proceso.**

En una democracia, la legitimidad no depende de que todo salga bien. Depende de que **nadie pueda demostrar que salió mal**.

---

## 4. La solución: Aleatoriedad que nadie controla

drand (https://drand.love) es una red descentralizada que emite un **beacon de aleatoriedad verificable** cada 3 segundos.

### ¿Cómo funciona?

1. Una red de nodos independientes (incluidos Cloudflare, EPFL, UCL, Protocol Labs) genera aleatoriedad colectivamente
2. **Ningún nodo individual puede predecir el resultado** antes de que se publique
3. **Cualquiera puede verificar** que el beacon fue generado correctamente
4. Los beacons son públicos, permanentes, y auditables

### ¿Por qué drand y no otro RNG?

| Alternativa                           | Problema                                                                                     |
| ------------------------------------- | -------------------------------------------------------------------------------------------- |
| `Math.random()`                       | Centralizado, manipulable por el operador del servidor                                       |
| `djb2Hash`                            | Determinista, predecible si conoces los inputs                                               |
| Oráculo de blockchain (Chainlink VRF) | Requiere contratos inteligentes, gas fees, dependencia de Ethereum                           |
| Hardware RNG en el 5950X              | Centralizado, si alguien hackea el servidor, controla el RNG                                 |
| **drand**                             | **Descentralizado, gratuito, sin fees, verificable, resistente a cualquier nodo individual** |

---

## 5. ¿Qué cambia con sorteo Verificable?

### Antes (djb2Hash)

```
Entrada: did + communityUri
Salida: Chamber A o B
Verificación: "Confía en nosotros, la fórmula es justa"
```

### Después (drand)

```
Entrada: did + communityUri + beacon(round=N)
Salida: Chamber A o B + Proof
Verificación: "Aquí está el beacon de drand #4,567,890.
              Aquí está el cálculo SHA-256.
              Reproduce tú mismo. Si coincide, la asignación es válida."
```

**La diferencia no es técnica. Es filosófica.**

Antes pedimos **fe**. Después ofrecemos **prueba**.

---

## 6. Beneficios concretos

### Para los usuarios

- **Tranquilidad**: Mi asignación no fue manipulada por un admin
- **Transparencia**: Puedo verificar mi propia asignación con 3 clicks
- **Legitimidad**: Los resultados de votación no se pueden impugnar por "algoritmo manipulado"

### Para las comunidades

- **Defensa legal**: Si alguien impugna una decisión, la comunidad puede demostrar integridad criptográfica
- **Reputación**: Ser la plataforma que "sí puede demostrar imparcialidad" es un diferenciador masivo
- **Escalabilidad**: Funciona para 10 personas o para 100,000

### Para PARA como organización

- **Zero trust**: No necesitamos que la comunidad "confíe en el equipo de PARA"
- **Auditabilidad externa**: Un auditor externo puede verificar TODO sin acceso a nuestros servidores
- **Marketing**: "La única plataforma de deliberación con sorteo criptográficamente verificable"

---

## 7. ¿Qué pasa si NO implementamos esto?

| Escenario                                                   | Probabilidad                | Impacto                                     |
| ----------------------------------------------------------- | --------------------------- | ------------------------------------------- |
| Una comunidad impugna resultados por "algoritmo predecible" | Media (crece con el tamaño) | Crítico — destruye reputación               |
| Un atacante realiza sybil attack con cuentas pre-calculadas | Baja hoy, alta a escala     | Crítico — compromete deliberación           |
| Competidor ofrece sorteo verificable y nos supera           | Media                       | Alto — perdemos diferenciación              |
| Regulador exige auditoría de procesos aleatorios            | Media (tendencia global)    | Alto — costo de implementación bajo presión |
| Usuarios avanzados desconfían y no participan               | Baja hoy, alta a escala     | Medio — pérdida de usuarios clave           |

---

## 8. Mitos comunes

> _"Pero djb2Hash ya es justo, ¿por qué complicarlo?"_

Justo ≠ verificable. Una moneda cargada puede dar 50/50 y seguir siendo injusta si alguien la controla. La pregunta no es "¿da 50/50?", es **"¿puedo demostrar que nadie la controló?"**

> _"drand es un servicio externo, eso es centralizado"_

drand es una **red federada** de múltiples organizaciones independientes. Ningún nodo controla el resultado. Es tan descentralizado como necesitamos. Además, si drand desaparece, tenemos **fallback** a djb2Hash.

> _"Esto es over-engineering para una app pequeña"_

PARA no se construye para ser pequeña. Se construye para ser infraestructura cívica. Es más barato implementar esto ahora (10-14 horas) que reconstruir confianza después de un escándalo.

> _"Los usuarios normales no entienden criptografía"_

No necesitan entender SHA-256. Necesitan ver un badge que diga **"✅ sorteo verificable"** y un botón que diga **"Verificar mi asignación"**. La criptografía está debajo. La confianza está arriba.

---

## 9. Inversión vs. Retorno

| Inversión                  | Valor                       |
| -------------------------- | --------------------------- |
| 10-14 horas de desarrollo  | Menos de un día de trabajo  |
| 0 costo de infraestructura | drand es gratuito           |
| 0 costo de operación       | Sin fees, sin gas           |
| **Retorno**                | **Legitimidad irrevocable** |

---

## 10. Conclusión

La sorteo es el corazón de la democracia en PARA. Si el corazón puede cuestionarse, todo el cuerpo enferma.

**Implementar sorteo Verificable no es un lujo técnico. Es un requisito de legitimidad.**

La pregunta no es "¿podemos permitirnos implementar drand?". La pregunta es: **"¿podemos permitirnos NO hacerlo?"**

---

_"La democracia no necesita fe. Necesita pruebas."_
