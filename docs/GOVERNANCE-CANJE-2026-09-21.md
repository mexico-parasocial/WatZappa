# Canje de pruebas y límites de gobernanza

Estado: implementación local del 21 de septiembre de 2026. Repositorios ahora
ubicados bajo `Home/macserver`; las validaciones anteriores no sustituyen las
del checkout actual. Sin despliegue ni migraciones contra datos reales.

## P0: autorización del voto público de cabildeo

La emisión de un nullifier estable no autoriza por sí sola una papeleta. PARA
solicita ahora la opción elegida, no envía `aliasDid` y propaga errores del
emisor. También rechaza respuestas incompletas o de otro sujeto antes de escribir.

m8 conserva el nullifier por persona/sujeto y emite en `eligibilityProofRef` un
MAC HMAC-SHA256 con dominio/versionado sobre la referencia interna de emisión,
el nullifier, sujeto, DID de la sesión y opción. No confía en un DID enviado por
el cliente. La clave `CIVIC_VOTE_PROOF_SECRET` debe ser independiente, durable y
de al menos 32 caracteres; no se genera ni se instala automáticamente.

`POST /v1/identity/civic-vote-proof/verify` verifica todos esos campos contra la
emisión y el estado activo de la persona. Devuelve 204 para una autorización
válida, 422 para un rechazo y 503 si no está configurado. No devuelve identidad,
sesión, person ID ni listas de aliases. No hay un canje destructivo de una sola
vez: el mismo voto debe poder verificarse por PDS y AppView, y la unicidad por
persona/sujeto corresponde al índice único de la base de conteo.

WatZappa verifica antes de `prepareCreate`/`prepareUpdate`, incluso con
`validate: false`; esto cubre `castVote`, `createRecord`, `putRecord` y
`applyWrites`. `castVote` exige ambos campos antes de consultar el cabildeo.
AppView vuelve a verificar antes de indexar, también para otros PDS. Un fallo
transitorio del verificador lanza error; no se interpreta como prueba válida ni
se cae a deduplicación por cuenta. La recuperación de eventos tras una caída
prolongada debe validarse antes del release.

Configuración en ambos procesos: `PARA_CIVIC_VOTE_VERIFIER_URL` con URL HTTPS
exacta, controlada por el operador. HTTP solo para loopback en desarrollo.
Timeout de 3 segundos, sin redirects, credenciales de sesión ni lectura de
cuerpos de respuesta. Falta de configuración bloquea la escritura. Desplegar
m8 con su clave, configurar ambos consumidores y actualizar PARA como cambio
coordinado; los comprobantes legacy dejan de ser aceptables en este camino.
Cambiar la clave invalida autorizaciones previas: no rotarla sin un plan de
compatibilidad y reindexación.

Este es un **voto público atribuible**, conforme al alcance de OD-7 §5c. El MAC
no implementa identidad cívica inenlazable, ZK, delegación privada o anonimato.
El operador de m8 sigue viendo sesión y emisión. No se añade una tabla de
correlación DID-persona; eso no elimina las correlaciones existentes.

## Estado de los seis hallazgos

| Hallazgo                          | Tratamiento / pendiente                                                                                                                                                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Canje no verificado            | Implementado para `civic.vote` de cabildeo, con comprobación de autor y contenido en PDS/AppView y error propagado en PARA. Otros consumidores no adquieren verificación de servidor por compartir el helper.                               |
| 2. Señal en `civic.delegation`    | Rechazada por la política compartida en escritura e indexación, incluido valor cero. Las delegaciones públicas sin señal no se convierten en votos privados.                                                                                |
| 3. Cinco colecciones sin decisión | Inventario abajo; sigue pendiente decisión de producto. No se declara privada ninguna por tener un campo de prueba.                                                                                                                         |
| 4. Duplicados QVL                 | `vote`, `intensity` y `civic-tree-vote` sí consultan/actualizan duplicados dentro de `insertFn`. Falta verificar atomicidad e históricos; `delegation` usa conflicto por URI y no resuelve duplicidad semántica. Compuerta privada cerrada. |
| 5. Tres identidades               | La app continúa firmando el voto público con la cuenta. Integrar identidad `civic` requiere protocolo y posesión de clave; cambiar un índice/DID en la UI no acredita anonimato ni unicidad.                                                |
| 6. Aliases correlacionables       | Ruta, controlador y función retirados. Migración 036 preparada y probada en BD efímera; no aplicada a BD real. Bootstrap ya no recrea la tabla. No se borraron datos históricos ni backups reales.                                          |

La emisión dejó de escribir al ledger una fila que vinculaba sesión con
nullifier, referencia y sujeto. Los registros históricos conservan esa
correlación y requieren una política de retención/migración; no se anonimizaron.

## Política pendiente de las cinco colecciones

Todas se publican actualmente en el repositorio de su autor. Ninguna debe
presentarse como voto secreto ni usarse como sustituto del flujo privado.
Mantener su comportamiento público mientras se decide no equivale a aprobarlo
para una elección vinculante.

| Colección                    | Decisión requerida                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------ |
| `civic.openQuestionVote`     | Confirmar reacción pública a respuestas vs voto electoral; determinar unidad de deduplicación.   |
| `community.civicTreeVote`    | Decidir si `direction` es contribución pública o postura protegida; definir alcance del bloqueo. |
| `raq.proposalVote`           | Definir visibilidad de postura, elegibilidad y canje obligatorio.                                |
| `raq.axisVote`               | Definir visibilidad de postura, elegibilidad y canje obligatorio.                                |
| `community.deliberationVote` | Ratificar apoyo deliberativo público o trasladarlo al protocolo privado.                         |

## Release pendiente

No aplicar automáticamente las migraciones de PostgreSQL real ni 036 de m8.
La supresión de aliases no anonimiza copias previas. Es necesario identificar
el entorno real, ensayar migraciones/rollback, verificar los índices de
unicidad y resolver el protocolo privado antes de habilitar elecciones reales.
`VotingButton` −3..+3 debe permanecer sin publicar una papeleta por las rutas
congeladas; conectarlo depende de ese protocolo, no de este canje público.

Los resultados de pruebas del cambio se registran al terminar la validación.
