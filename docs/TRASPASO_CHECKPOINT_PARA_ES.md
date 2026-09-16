# Plan de traspaso: recuperación autenticada de políticas PARA

Fecha: 15 de septiembre de 2026.

## Encargo para el siguiente agente

Implementa y verifica la recuperación mediante un checkpoint firmado cuando se
pierde una actualización de políticas y el PDS queda en estado `stale`.
Trabaja sobre los componentes existentes, conserva las particularidades de PARA
y mantén todas las rutas públicas y la entrega automática deshabilitadas.

Este es el siguiente paso pendiente del flujo de publicación de políticas;
**no es el último paso para poner todo el sistema de datos privados en producción**.
El intercambio de credenciales, la integración M8 real, las reglas operativas y
la integración manual con main siguen siendo trabajos separados.

## Punto de partida y restricciones

- Directorio: `/Users/mlv/Desktop/Home/WatZappa-permissioned-data`.
- Rama: `codex/permissioned-data-port`; checkpoint de código: `61d9f2e95`;
  base: `4e0ddd958`.
- Main está en `/Users/mlv/Desktop/Home/WatZappa`, observado en `5d79dc756`.
  Tiene cambios ajenos sin commit. Verifica nuevamente el estado antes de actuar.
- `docs/PERMISSIONED_DATA_PORT.md` contiene actualizaciones locales posteriores
  al checkpoint. Presérvalas, junto con estos documentos de traspaso.
- No hagas merges, cherry-picks, reemplazos masivos ni copias completas desde
  upstream. Cualquier integración debe revisarse y adaptarse archivo por archivo.
- No despliegues, no habilites endpoints y no cambies la autorización de Matrix.
  No hagas commit/push sin una instrucción explícita para ello.
- Lee `AGENTS.md`, `STYLE_GUIDE.md`, los `AGENTS.md` de los módulos afectados y
  `.agents/skills/testing/SKILL.md` antes de implementar o ampliar pruebas.

## Qué ya existe y no debe rehacerse

El AppView firma actualizaciones Ed25519 y las conserva en un outbox Postgres.
Cada espacio tiene secuencia, época, deduplicación por evento y entrega ordenada
con arrendamientos temporales y tokens que invalidan a trabajadores anteriores.
Los reintentos usan exactamente los mismos bytes firmados.

El PDS verifica firma, emisor, audiencia, espacio y fuente configurados; aplica
actualizaciones en SQLite con una cadena de digests. Un salto o conflicto
verificado deja la proyección `stale`: se deniega el acceso y un snapshot normal
no puede reactivarla. Se conservan por separado los máximos verificados de versión
y época, con evidencia firmada para cada uno, incluso mientras el estado está stale.

La pérdida de una confirmación ya tiene solución: `getAcceptedReceipt()` y
`reconcileAccepted()` concilian versión/digest exactos sin modificar la política
del PDS. Esa solución exige que el llamador autentique al receptor; no incluye
transporte autenticado y **no recupera una actualización realmente perdida**.

## Archivos que debes revisar

Todos los siguientes caminos son relativos al worktree indicado arriba:

- `docs/PERMISSIONED_DATA_PORT.md`: decisiones, límites y plan general.
- `packages/pds/src/actor-store/para-policy/{intake,reader,transactor,types,resolver}.ts`.
- `packages/pds/src/actor-store/db/schema/para-space-policy-fault.ts` y
  `packages/pds/src/actor-store/db/migrations/004-para-policy-fault.ts`.
- `packages/bsky/src/para-policy/{publisher,outbox}.ts`.
- `packages/bsky/src/data-plane/server/db/tables/para-policy-outbox.ts` y su
  migración `20260914T180000000Z-add-para-policy-outbox.ts`.
- `packages/pds/tests/para-policy-intake.test.ts` y
  `packages/bsky/tests/para-policy-{publisher,outbox}.test.ts`.
- `.changeset/permissioned-space-foundation.md` y los AGENTS locales.

## Secuencia de implementación

### 1. Fijar el contrato y los estados de recuperación

Documenta un sobre de checkpoint separado del delta normal, con validación
estricta, discriminación de tipo y claves de confianza configuradas. Define
canónicamente su digest; no compartas código de codificación de producción entre
AppView y PDS para que las pruebas detecten desacuerdos entre implementaciones.

Vincula el desafío emitido por el PDS a emisor, audiencia, autoridad, espacio
inmutable, URI fuente, versión/digest aceptados y ambos máximos verificados.
Incluye un identificador aleatorio de un solo uso y caducidad explícita.

Resuelve y documenta antes de codificar: vida máxima, límite de bytes decodificados,
cantidad máxima de desafíos pendientes, tratamiento de espacios eliminados o sin
estado, relación del nuevo digest con el anterior y reintento después de perder
la confirmación. No inventes permisos de gobernanza ni identidades de producción.

### 2. Persistir el desafío en el actor store de autoridad

Añade una migración nueva; no reescribas las migraciones existentes. Usa el mismo
almacén de autoridad que contiene la política, no el almacén de desafíos M8:
son protocolos y límites transaccionales distintos.

Persiste el hash del secreto del desafío y sus vinculaciones. Limita pendientes,
caducidad y limpieza. La emisión debe tomar una vista coherente del estado y los
máximos. No permitas que material sin verificar cambie esos máximos.

### 3. Preparar el checkpoint en el publisher

Bajo el bloqueo del stream existente, reserva una nueva versión mayor que la
cabecera del publicador y el máximo de versión del receptor; reserva una época
mayor que la época del publicador y el máximo de época del receptor. Son dos
dimensiones independientes, no una comparación de pares ni un contador común.

El snapshot completo debe proceder de una decisión de gobernanza autorizada,
no de roles enviados por un cliente ni de filas crudas del índice de membresía.
Mantén esa precondición explícita mientras no exista un adaptador autorizado.
Persiste evento estable, desafío, bytes firmados y digest de forma atómica.
Diseña qué ocurre si cambia el estado entre obtener el desafío y firmar.

Bloquea los caminos normales de publicación/entrega durante la recuperación.
Los tokens de trabajadores anteriores no deben poder confirmar o liberar la
nueva recuperación. No borres eventos ni vuelvas a firmar versiones antiguas.

### 4. Verificar e instalar atómicamente en el PDS

Verifica firma, tipo, claves fijadas y todas las vinculaciones, con límites de
tamaño y tiempo. Dentro de una única transacción vuelve a comprobar desafío,
caducidad, estado aceptado y máximos actuales; consume el desafío e instala el
snapshot completo junto con su recibo.

Si avanzó el estado o aumentó cualquier máximo desde la emisión, rechaza el
desafío anterior. Si falla la escritura, revierte también el consumo. Solo una
instalación válida completa puede pasar de `stale` a `ready`.

Conserva la semántica de PARA: pertenencia activa como requisito independiente,
precedencia de asignaciones estructuradas, expiración de roles y retiro de
miembros omitidos. La recuperación no debe resucitar a alguien revocado o bloqueado.
No introduzcas un método genérico para borrar stale o ignorar la cadena.

### 5. Confirmación y reintentos seguros

Define un recibo exacto de checkpoint y su conciliación en el outbox. No basta
con recibir JSON que diga `ready`: el llamador debe autenticar la identidad del
PDS y vincular la respuesta al stream y artefacto esperados.

Libera el bloqueo de recuperación solo tras esa confirmación exacta. Conserva
trazabilidad de los eventos sustituidos y evita que vuelvan a entregarse.
Distingue instalar de nuevo —prohibido reutilizar el desafío— de consultar o
reconocer un recibo ya persistido tras perder una respuesta.

No inventes transporte de producción. Puedes terminar esta etapa con un
coordinador local probado y contratos explícitos de autenticación, pero debes
reportar que no existe interoperabilidad HTTP autenticada hasta probarla realmente.
Snapshots grandes requieren una decisión explícita; recházalos de forma acotada
si no se implementa un transporte seguro. Nunca instales snapshots parciales.

### 6. Pruebas y cierre

Usa Postgres y SQLite reales, claves reales de prueba y reloj controlado. Cubre:

- Revocación perdida → detección del salto → denegación → checkpoint → usuario
  revocado sigue denegado; miembros válidos recuperan solo sus permisos efectivos.
- Máximo de versión y máximo de época provenientes de mensajes distintos.
- Firma, tipo, fuente, autoridad, audiencia o espacio incorrectos; entradas
  malformadas no consumen desafíos ni alteran política o máximos.
- Desafíos vencidos, repetidos y concurrentes; una sola instalación ganadora.
- Nuevo fault o nueva política entre emisión, firma e instalación.
- Fallos forzados de escritura: política, consumo y recibos se revierten juntos.
- Reinicio del PDS/publicador, pérdida de respuesta y conciliación posterior.
- Trabajador anterior, token vencido, confirmación falsificada y entrega tardía
  de envelopes sustituidos no pueden desbloquear ni revertir la recuperación.
- Roles vencidos, miembros omitidos, `removed`/`blocked`, límites de tamaño,
  límites de pendientes y limpieza acotada.
- Round-trip de migraciones sin afectar tablas ajenas; regresiones del flujo
  normal y de la conciliación de ACK ya implementada.

Línea base previa: **146 pruebas en nueve suites**: 111 PDS, 17 de publisher y
18 de outbox. Reejecuta esa base y las nuevas pruebas. No presentes una ejecución
parcial como validación completa del repositorio.

Las dependencias actuales se reutilizan desde main mediante enlaces locales;
el typecheck dirigido usa declaraciones compiladas de fetch/JWK. La instalación
no es limpia ni demuestra compatibilidad completa del lockfile. Inspecciona los
scripts antes de ejecutarlos: los wrappers de dev-infra pueden limpiar esquemas
compartidos. Prefiere Postgres temporal ligado a loopback, esquemas aleatorios y
limpieza exclusiva de tus recursos; detén tu instancia al terminar.

## Definición de terminado y entrega requerida

La etapa queda terminada cuando un test cruzado demuestra recuperación completa
sin restaurar permisos revocados, con atomicidad, persistencia, protección contra
replay y trabajadores anteriores, además de las regresiones verdes.

Actualiza documentación, AGENTS locales y changeset de los paquetes modificados.
Entrega: decisiones del contrato, archivos cambiados, comandos y resultados de
pruebas/typecheck/lint, límites del entorno, pendientes y confirmación explícita
de que ninguna ruta se habilitó. Distingue siempre componente local probado de
servicio integrado. No declares terminado el port completo.
