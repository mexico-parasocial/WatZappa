# Revisión de preparación para producción: gobernanza integrada

Fecha: 2026-09-20. Alcance: código local de WatZappa y PARA, con inspección del
emisor de pruebas en mubEZ. No constituye una auditoría criptográfica ni una
verificación del despliegue. Se preservaron los cambios que ya existían.

## Dictamen

**No apto para producción como sistema integrado de voto anónimo.** Existen
registros de delegación y superficies de deliberación pública, pero no una
transacción verificable que conecte identidad elegible, delegación, intensidad,
presupuesto cuadrático y publicación privada del resultado.

| Mecanismo             | Evidencia de implementación                                                               | Brecha que impide declararlo listo                                                                                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Democracia líquida    | Dos familias de delegación: `com.para.civic.delegation` y `com.para.community.delegation` | No hay un único resolutor de peso aplicado al conteo: faltan reglas verificadas de precedencia, ciclos, caducidad, revocación, voto directo y cierre                                  |
| Delegación            | La app publica registros y permite retirarlos                                             | Es pública y atribuible; el conteo de cabildeo cuenta registros de votos y delegaciones por separado, sin transformar estas últimas en papeletas efectivas                            |
| Intensidad            | Esquema y tabla `para_qvld_intensity`                                                     | Escrituras congeladas; el indexador histórico acepta `creditsSpent` del registro y usa `units` como alternativa, sin acreditar un presupuesto electoral                               |
| Voto cuadrático       | Simulaciones plano, raíz y correlación                                                    | Fuentes distintas para plano e intensidad; sin libro de gastos compartido, prueba del costo cuadrático ni aplicación de la delegación al conteo                                       |
| Estadísticas anónimas | Consultas experimentales                                                                  | Listados y auditoría contienen DIDs, señales y vínculos de delegación; agregados en vivo permiten diferencias entre consultas. No existe un mecanismo revisado de publicación privada |

## Hallazgos y ubicaciones

1. **P0 — Confidencialidad incompatible con el formato actual.**
   `packages/bsky/src/api/com/para/community/{listVotes,listIntensities,getAuditTrail}.ts`
   entrega identidades y contenido de papeletas. Una bandera de experimento no
   autoriza su divulgación. `getTallySimulation` tampoco establece un umbral,
   cierre o presupuesto de privacidad. Se bloquean las cuatro lecturas públicas
   incluso con la bandera activada. Esto no elimina información ya publicada,
   copias federadas, registros de delegación públicos ni acceso interno al data plane.

2. **P0 — Identidad y prueba no proporcionan anonimato frente al emisor.**
   `../mubEZ/src/services/civicVoteIdentityService.ts` calcula el nullifier desde
   `person.id` y guarda `person_id`, `session_id`, `alias_did` y sujeto juntos.
   `../PARA/src/lib/api/vote-proof.ts` envía el DID y convierte cualquier fallo
   en `null`. Los consumidores necesitan una política explícita para exigir
   pruebas; no se debe reutilizar esta ruta opcional para una elección vinculante.
   La prueba actual no compromete señal, costo ni estado de delegación. Véase OD-7.

3. **P1 — Delegador suplantable en el índice QVL.**
   `para-qvl-delegation.ts` confiaba en `obj.delegator` sin compararlo con el
   propietario del repositorio. Se rechazan delegadores ajenos y autodelegaciones
   antes de insertar peso en esa tabla. Es necesario revisar y reindexar los
   registros históricos; esta corrección no sanea las filas existentes.

4. **P1 — No existe un conteo integrado.**
   `recompute-cabildeo-aggregates.ts` suma papeletas y cuenta cesiones; no resuelve
   sus destinos ni transfiere peso. `routes/qvl-simulation.ts` usa votos planos
   para un resultado e intensidades para otro. Multiplica señal por raíz de
   créditos, sin demostrar que estos sean válidos. Las agrupaciones del
   denominador de peso y de la media también son distintas. No se presenta esto
   como tres conteos equivalentes de las mismas papeletas.

5. **P1 — Reglas de elección sin especificación ejecutable.**
   En la simulación, el quórum se deriva de votos recibidos (`max(10, 20%)`),
   no de un padrón elegible fijado para la elección. La caducidad predeterminada
   de 90 días descrita en el lexicon no se materializa en el indexador QVL.
   No hay pruebas completas de ciclos, ámbitos superpuestos, revocaciones
   concurrentes, reemplazos y conservación de peso.

6. **P1 — Interfaz que afirmaba efectos no implementados.**
   `DelegateVoteScreen` mostraba poder √N, peso relativo y un incremento al ceder.
   Se retiran esas promesas, el porcentaje inferido de una lista de candidatos y
   la gráfica ficticia de poder efectivo. La pantalla explica qué se registra,
   su publicidad y la diferencia entre una delegación y una papeleta. Retirar
   el registro no promete borrar copias ni emitir un voto.

7. **P2 — Presentación de resultados y fallos.**
   Se diferencia el bloqueo de privacidad de un fallo de red, con reintento para
   este último; la consulta de conteo queda separada por cuenta. Se corrige la
   escala de `maxWeightRatio` (0–1 → porcentaje), se dejan de inferir estados de
   correlación comparando medias y se ocultan valores no finitos en la gráfica.

## Contrato de integración requerido antes de reabrir el voto

1. Fijar por elección un identificador, padrón/credenciales elegibles, calendario,
   presupuesto, opciones, rango de señal, regla de quórum, versión del algoritmo
   y momento de corte. Definir si los créditos delegados se agrupan antes o
   después de aplicar costo/raíz; esas reglas producen resultados distintos.
2. Un solo resolutor determinista de delegación: precedencia por ámbito, voto
   directo, ciclos, expiración, revocación, ausencia de voto del representante y
   límites de profundidad. Verificar que no crea, pierde ni duplica peso.
3. Un protocolo privado coherente con OD-7: compromiso del contenido, prueba de
   elegibilidad y rango, nullifier ligado a la elección y al sujeto, conservación
   de peso delegado y prueba del costo cuadrático. Implementación y revisión
   criptográfica especializadas; no inventar un protocolo casero para cerrar
   esta lista. Separar cuenta, emisor, recepción de papeletas y cómputo.
4. Aceptación atómica de papeleta, sustitución y gasto. Idempotencia, unicidad,
   concurrencia, revocación y cierre deben verificarse del lado servidor. Un
   nullifier por propuesta no limita por sí solo el gasto entre propuestas.
5. Publicar instantáneas agregadas con estado explícito: pendiente, retenido por
   privacidad, provisional o final. Eliminar identificadores y trazas de
   delegación; revisar celdas pequeñas, consultas superpuestas y diferencias
   temporales. Un umbral mínimo aislado no basta para prometer anonimato.
6. Consumir el mismo resultado versionado en detalle, delegación y estadísticas.
   La UI necesita recibo de aceptación, errores recuperables, costo y saldo
   verificables, efecto del voto directo, revocación y estado de cierre.

## Criterios de salida verificables

- Pruebas integradas con elecciones completas y varias cuentas: A delega en B,
  B en C, A vota directo, revocación antes/después del corte y cambios de ámbito.
- Casos adversariales: ciclos, cuentas/credenciales duplicadas, suplantación,
  replay, alteración de señal, sobregasto concurrente, doble gasto, fechas falsas,
  cortes intermedios y reindexación fuera de orden.
- Pruebas de privacidad sobre APIs, repositorios, firehose, logs, métricas,
  respaldos y diferencias entre publicaciones. Establecer frente a qué actores
  se promete anonimato y qué metadatos de red quedan expuestos.
- Cálculo reproducible y auditado de resultados, política de desempate y quórum,
  pruebas de carga, restauración y migración de datos históricos.
- Recorrido visual y de accesibilidad en web, iOS y Android con datos reales,
  estados vacíos, fallos, cierre y cambio de cuenta.

Hasta cumplirlos, el alcance defendible es deliberación y delegación **públicas**,
con limitaciones explícitas. No se habilitó ni desplegó voto privado en esta revisión.

## Verificación de esta revisión

- Backend: 8 pruebas de bloqueo y rutas, y 3 pruebas del índice de delegación,
  aprobadas mediante el comando de pruebas del paquete con infraestructura local.
- Cliente: 6 pruebas de clasificación de errores aprobadas.
- Lint de los archivos revisados: sin errores; permanecen advertencias del
  cliente sobre respuestas API sin tipar y promesas de invalidación.
- Typecheck web: 112 errores en otros archivos del proyecto; ninguno en los
  archivos modificados por esta revisión después de corregir los detectados.
- Typecheck de bsky: bloqueado por errores de sintaxis/tipos en dependencias y
  artefactos del workspace (incluido `@noble/curves`). No se certifica el build.
- No se hizo un recorrido visual de la app autenticada ni una prueba completa de
  elecciones: los mecanismos privados que esa prueba requeriría no existen aún.
