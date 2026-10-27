# Spaces en WatZappa

WatZappa conserva una sola línea de producto. `watzappa-permissioned-spaces`
integra Spaces desde `feat/spaces-alpha` sobre `origin/main`; su worktree se
mantiene separado de los directorios de desarrollo anteriores. Los cambios de
protocolo se adaptan en commits revisables y regresan a `main` mediante PR.
No se fusiona la rama upstream `permissioned-data` en el producto.

## Contrato e identidad

La referencia exacta está en `packages/space/SOURCE`. El pin
`f6477d8e2e2389707fea2d7a86b7630c4237960a` incorpora #5691, #5690 y #5705:
la autoridad usa `#atproto_pds` y firma tokens con `#atproto`; las firmas de
credenciales requieren la etiqueta y el tag `atproto-space-credential`.
`getSpaceCredential` recibe `credentialKid` y el token de delegación opcional
en el cuerpo. La biblioteca implementa ese contrato, pero el PDS de PARA
todavía devuelve 501 para emisión de credenciales y acceso entre miembros.
Las políticas públicas y managing-app continúan rechazadas por el host PARA.

El PDS sirve repositorios propios mediante OAuth y permisos `space:`, detrás
de `PDS_SPACES_ENABLED`, desactivado por defecto. `describeServer.spacesAlpha`
se anuncia solo con ese flag. Una escritura del dueño requiere creación
explícita del espacio y no puede reactivar un tombstone (#5655). El control
de alcance del grant, la prohibición de blobs y la separación del repositorio
público siguen vigentes. Spaces aporta almacenamiento y transporte; la cadena
verificada de eventos de autoridad PARA decide los cargos y permisos.

## Exportación y borrado

`com.atproto.space.getRepo` exporta STAR con `application/octet-stream`.
El formato lleva DID, espacio y commit firmado en los metadatos, seguidos por
registros en orden lexicográfico. El consumidor debe agotar y verificar el
stream antes de publicar sus registros: el hash final detecta omisiones,
duplicados y cambios. La sincronización de repositorios públicos sigue usando
CAR. Los peers con el pin antiguo de vlpds requieren su propia actualización;
los vectores históricos no prueban compatibilidad STAR entre implementaciones.

La adaptación de #5697 guarda notificaciones de borrado en la base de cuentas
antes de intentar entregarlas. Los reintentos usan lease, backoff y expiración
del registro del syncer; errores HTTP permanentes terminan la entrega. Se
descartan notificaciones de espacios recreados y se posponen las de cuentas
pausadas. Una generación distinta impide que una entrega vieja borre un evento
nuevo. No hay registro público de syncers en la implementación actual.
Existe una ventana de caída entre el commit de borrado del actor y el enqueue
en la base de cuentas; cerrar esa ventana requiere un outbox en la misma
transacción del actor antes de habilitar registros de syncers en producción.

## Integración del port PARA anterior

`codex/permissioned-data-port` conserva los módulos experimentales de política
firmada, outbox, recuperación y M8. Su indexador y sus migraciones no deben
copiarse sobre esta rama: aquí la autoridad ya procede de eventos verificados,
y los números de migración locales han evolucionado. La admisión del consejo
debe derivarse de esa cadena, no introducir una segunda autoridad independiente.
El siguiente paso comunitario es adaptar el materializador a esa cadena y
probar revocaciones desde AppView hasta el resolver del PDS; después se puede
conectar la entrega durable y la emisión de credenciales. Estos módulos no
están activos en el flujo personal actual.

Para desarrollar: usar un worktree por rama, commits pequeños por comportamiento
y pruebas, y ramas remotas propias. Probar migraciones sobre copias aisladas de
las bases. Los cambios de esquemas canónicos requieren `pnpm lex:update-local`
y codegen. No reutilizar una base de runtime entre variantes con migraciones
distintas ni reemplazar archivos PARA con versiones upstream completas.
