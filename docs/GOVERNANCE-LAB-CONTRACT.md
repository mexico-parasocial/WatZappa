# Contrato de referencia G1 — versión g1-follow-signal-v1

Estado: **hipótesis ejecutable de laboratorio**, preparada el 21 de septiembre
de 2026. No es política electoral aprobada ni un protocolo de voto privado.
Se solicitó al usuario su preferencia entre delegar la decisión o agrupar los
créditos; mientras no haya respuesta, se implementa únicamente la primera
alternativa, etiquetada y versionada. El presupuesto, quórum y reglas de
abstención también requieren decisión de producto antes de producción.

Código: `packages/bsky/src/governance-lab/{types,engine,adapters,fixtures}.ts`.
La demo en `../PARA/scripts/governance-lab` compila e importa ese motor; no hay
un segundo algoritmo de conteo en el cliente. Es un banco de pruebas web
independiente, no una pantalla conectada a cuentas reales de PARA.

## Reglas ejecutables

| Aspecto                  | Regla de esta versión                                                                                                                                                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Identidad de la elección | Configuración `mode: synthetic`, ID, comunidad, participantes y propuestas con prefijo `demo:`. Sin DIDs, sesiones, credenciales ni llamadas de red                                                                                                                      |
| Elegibilidad             | Padrón fijo, único, entre 1 y 1000 participantes. Una fila efectiva por participante y propuesta; límites de 100 propuestas y 10000 eventos                                                                                                                              |
| Intensidad               | Entero entre −3 y +3. Costo `signal²`, sin multiplicar de nuevo por √créditos ni descontar bloques por √N                                                                                                                                                                |
| Delegación               | Transfiere la selección de señal, no los créditos. Cada participante sigue a su destino y paga con su propio presupuesto por elección                                                                                                                                    |
| Prioridad                | Voto directo > delegación por propuesta > por tema > por comunidad. Un delegado también puede delegar. Dos mandatos vigentes del mismo actor y ámbito rechazan el estado como ambiguo                                                                                    |
| Abstención               | Cero es una señal explícita, cuesta cero, cuenta para participación/quórum y detiene la cadena. Retirar un voto directo permite volver a aplicar la delegación                                                                                                           |
| Cadenas                  | Ciclos, profundidad excedida o destino sin voto dejan esa unidad sin ejercer, con una razón explícita. Ningún peso se crea ni se asigna a otro destino implícito                                                                                                         |
| Presupuesto              | Suma de costos efectivos de todas las propuestas por individuo. Se rechaza el estado completo si alguien excede su presupuesto; no se reduce intensidad ni se eligen ganadores por orden de llegada                                                                      |
| Revocación               | Solo el actor que creó el mandato puede revocarlo, una vez. No emite una papeleta. Un mandato nuevo requiere retirar el anterior del mismo ámbito                                                                                                                        |
| Tiempo                   | Eventos con ID y secuencia únicos; tiempo de recepción monotónico dentro de `[apertura, cierre)`. No se confía en `createdAt`. El instante del cierre congela el estado inmediatamente anterior; un mandato que vence exactamente al cierre cuenta en el resultado final |
| Quórum                   | `ceil(padrón × quorumBps / 10000)`, por propuesta. Un registro sin representar no cuenta como participación                                                                                                                                                              |
| Conteos                  | La señal plana suma los signos de los votos efectivos; la señal de intensidad suma sus valores. Ambos parten de la misma población resuelta. No hay simulación de correlación                                                                                            |
| Resultado político       | Se devuelven magnitudes y quórum. No se declara una propuesta aprobada ni un ganador; umbrales de aprobación y desempate están pendientes                                                                                                                                |
| Estadísticas             | Contrato de publicación: retenido antes del cierre o si alguna propuesta no alcanza el mínimo. Después, agregados sintéticos sin IDs de participantes. La vista interna del laboratorio sí contiene trazas ficticias                                                     |

**Consecuencia que debe decidir producto:** un cambio de señal de un
representante puede exceder el saldo de alguien que lo sigue. Esta versión
rechaza ese estado, incluso si el representante conserva saldo suficiente.
No es aún una regla apta para producción: revela una dependencia con los
seguidores y puede permitir bloqueo estratégico. Alternativas como reservas
previas de créditos, mandatos con límites o reglas de no ejercicio necesitan
especificación y evaluación antes de elegir una. No se implementó agrupación
de créditos ni se la presenta como equivalente a esta regla.

## Frontera de admisión y almacenamiento

`evaluateElection` calcula un estado para un instante, verifica forma, autoridad
sintética, orden de recepción, ambigüedades y saldo de ese estado. No verifica
firmas, pruebas criptográficas ni que todo prefijo histórico fuese aceptable.
La demo evalúa cada modificación candidata antes de conservarla. En G2, la
admisión persistente debe validar cada transición de forma atómica, incluyendo
transiciones por expiración, cierre y revocación. Un log reescrito puede cambiar
la historia: el motor puro no reemplaza un ledger autorizado e inmutable.

Los eventos posteriores al instante consultado no alteran su resultado. Un
evento fuera del intervalo de la elección o con secuencia repetida se rechaza.
La reproducibilidad presupone el mismo padrón, configuración y log autorizado;
esta versión no firma ni hace hash del snapshot.

## Adaptadores de registros existentes

- QVL comprueba que `delegator` corresponda al propietario recibido en el
  contexto. Normaliza `proposal`, `topic`, `community` y `topicCommunity` dentro
  de una elección de comunidad única. No ensancha un ámbito desconocido.
- Civic admite destinatario activo explícito y propuesta o un único tema.
  Rechaza reglas pasivas, múltiples temas y mezcla ambigua de propuesta/temas.
  Las dos familias se normalizan por separado; sumar las dos como mandatos
  vigentes del mismo ámbito provoca rechazo, no peso duplicado.
- El contexto aporta tiempo de recepción y vencimiento explícitos. No se
  inventan fechas desde metadatos declarados por el cliente. Los campos de
  criterio público (`reason`, `signal`, `preferredOption`) no se convierten
  silenciosamente en una papeleta.
- Estos adaptadores son para fixtures sintéticos. No hay importación de usuarios
  o historiales reales al laboratorio.

## Vectores de aceptación

Padrón Ana, Bruno, Carla, Diego; presupuesto 10 por persona; quórum 50 %.
Ana delega a Bruno, Bruno a Carla; Carla vota +2 en parque y +1 en biblioteca.

| Escenario                                             | Parque                                                                          | Biblioteca                        | Saldo de Ana |
| ----------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------- | ------------ |
| Cadena inicial                                        | 3 representados, señal plana 3, intensidad 6, costo total 12                    | 3 representados, señal 3, costo 3 | 5            |
| Ana vota −3 en parque                                 | 3 representados, 2 directos y 1 delegado; señal plana 1, intensidad 1, costo 17 | Sin cambio                        | 0            |
| Ana intenta +2 en biblioteca después de lo anterior   | Se rechaza el cambio completo: costaría 9 + 4                                   | Permanece el estado anterior      | 0            |
| Ana retira su voto directo                            | Vuelve a seguir a Carla                                                         | Sin cambio                        | 5            |
| Ana revoca su delegación comunitaria sin voto directo | 2 representados                                                                 | 2 representados                   | 10           |
| Cierre con cadena inicial vigente hasta ese instante  | Mismos votos que inmediatamente antes del cierre                                | Mismos votos                      | 5            |

## Modelo de privacidad a resolver antes de producción

| Actor              | Qué ve hoy / en el laboratorio                                   | Requisito para el flujo privado                                                                                                        |
| ------------------ | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Otros usuarios     | Registros públicos legacy; datos ficticios en la demo            | No relacionar identidad, señal, créditos ni grafo; controlar publicaciones repetidas, filtros y grupos pequeños                        |
| Representante      | En esta hipótesis determina la señal heredada                    | Especificar qué información recibe y cómo impedir correlación o coerción; resolver el rechazo por saldo del seguidor                   |
| Emisor mubEZ       | Persona, sesión, alias y sujeto en la ruta actual                | Separar emisión y uso de credenciales, unicidad por persona y vinculación no reveladora; la tabla actual no satisface esto             |
| Recepción y conteo | La referencia resuelve todo en claro con IDs ficticios           | Verificar prueba ligada al contenido, elección, rango, gasto y mandato; definir confianza distribuida, gestión de claves y coaliciones |
| Operación          | Logs, tiempos, red, respaldos y versiones pueden correlacionarse | Política y pruebas sobre metadatos, retención, backups, telemetría y acceso interno                                                    |

El mínimo de participantes no constituye por sí solo anonimato: unanimidad,
conocimiento previo, diferencias temporales y varios agregados pueden revelar
una señal. No se eligió biblioteca ni protocolo criptográfico en esta entrega.
La selección debe demostrar elegibilidad única, contenido comprometido, prueba
de rango, costo cuadrático, conservación de mandatos y revocación privada; que
una biblioteca ofrezca una curva o compromisos no acredita esas propiedades.

## Inventario de la prueba opcional actual

`PARA/src/lib/api/vote-proof.ts` devuelve `null` ante un fallo del emisor. Sus
consumidores encontrados son cabildeo, RAQ (ejes/propuestas), preguntas abiertas
y deliberación. Publican registros atribuibles; ninguno debe convertirse en el
canal de voto privado por reutilización del helper.

En los indexadores revisados, varios `voteNullifier` se usan para localizar una
fila existente sin que ese paso demuestre quién controla la prueba. Antes de
exigir simplemente un string en la UI, G2 debe verificar autoridad, contenido y
duplicados en servidor. Convertir `null` en excepción solo en cliente no cierra
esa superficie. No se modificaron las reglas de participación de esos flujos
públicos; las nuevas elecciones privadas siguen sin un endpoint habilitado.
