# Informe de avance: datos permissionados para PARA

Fecha: 15 de septiembre de 2026.

## Resumen ejecutivo

Se construyó una base de almacenamiento, verificación y autorización para datos
privados de PARA sobre AT Protocol, adaptada manualmente para conservar sus
reglas propias. Incluye publicación firmada de políticas, persistencia duradera,
protección contra repetición y pruebas cruzadas AppView–PDS.

**La base está implementada y probada localmente; todavía no es un servicio de
archivos privados disponible para usuarios.** No se habilitaron rutas de
credenciales ni de registros privados y no se desplegó esta funcionalidad.

El código está guardado en `61d9f2e95`, rama `codex/permissioned-data-port`, en
`/Users/mlv/Desktop/Home/WatZappa-permissioned-data`. El worktree fue restaurado
sin perder código. Las actualizaciones documentales posteriores siguen locales.
Main, observado en `5d79dc756`, conserva trabajo de otro agente; no se fusionó ni
se sobrescribió desde esta rama.

## Funcionalidades y nuevas capacidades técnicas

| Área                       | Capacidad implementada                                                                                                                    | Límite actual                                                                |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Almacenamiento de espacios | Tablas, lectores y transacciones para espacios, registros, miembros, escritores y referencias a blobs; comprobaciones de alcance de blobs | Sin rutas públicas conectadas                                                |
| Compatibilidad CAR         | Utilidades para el flujo CAR requerido por el paquete de espacios, con comprobación de CID                                                | Pendiente conciliación manual con cambios CAR recientes de main              |
| Identidad de cliente       | Verificación autónoma de client attestation, consultas acotadas de metadatos/JWKS y protección de replay                                  | No conectada a AppContext ni a emisión de credenciales                       |
| Políticas PARA             | Estado local en el almacén de autoridad, snapshots/patches, miembros y roles; secuencia y recibos enlazados por digest                    | Falta recuperación completa y configuración de confianza operativa           |
| Autorización               | Resolver local que exige membresía activa, rol vigente, cliente/colección/acción permitidos, frescura y época correcta                    | Faltan reglas de producción y conexión transaccional a cada escritura        |
| Assurance M8               | Verificador de borrador firmado que comprueba emisor, audiencia, DID, cliente, DPoP, espacio, caducidad, nonce y JTI                      | Falta acuerdo y prueba contra el broker real; assurance no concede membresía |
| Anti-replay duradero       | Desafíos PDS y consumo atómico de nonce/JTI en SQLite; persistencia tras reinicio, límites y limpieza acotada                             | Falta emisión autenticada, rate limiting y programación de limpieza          |
| Publicación de políticas   | Firmante AppView Ed25519, JWKS solo público y codificación independiente del receptor                                                     | Falta fuente de gobernanza autorizada y transporte autenticado               |
| Entrega duradera           | Outbox Postgres, deduplicación por evento, secuencia por espacio, bloqueo de fila y entrega ordenada con tokens de trabajador             | Sin worker, scheduler o entrega de red conectados                            |
| Fallos y conciliación      | Estado stale persistente ante saltos/conflictos verificados; máximos independientes de versión/época; conciliación exacta de ACK perdido  | Un hueco real requiere el nuevo protocolo de checkpoint                      |

## Qué permite demostrar hoy

En pruebas locales, el AppView puede firmar una admisión o revocación, conservar
los bytes en Postgres y entregarlos al receptor PDS. El PDS comprueba la firma,
las vinculaciones y la secuencia, actualiza SQLite y evalúa acceso con el resolver.
La suite cruzada verifica que una remoción produce denegación y que ambos
componentes calculan el mismo digest.

También se demuestra que un reinicio no borra las defensas duraderas de replay,
que un trabajador sustituido no puede confirmar con su token anterior y que una
confirmación perdida puede conciliarse sin alterar la política aceptada.
Los gaps verificados bloquean la proyección; entradas no autenticadas no pueden
forzar ese cambio de estado.

## Garantías de diseño preservadas

- Adaptación manual: upstream es una referencia de comportamiento, no una
  plantilla que reemplaza archivos completos de PARA.
- Ante una política ausente, inválida o desactualizada, el resolver deniega;
  no consulta un servicio remoto para improvisar una autorización permisiva.
- Los roles temporales respetan sus fechas y la precedencia de asignaciones
  estructuradas. Tener un rol no sustituye la exigencia de membresía activa.
- M8 demuestra assurance de la sesión; no concede derechos sobre un espacio.
- Las funciones institucionales de Matrix no se convierten en permisos
  universales sobre archivos privados o votaciones.
- Los bytes privados son responsabilidad de AT Protocol. Matrix puede mostrar
  referencias AT URI, pero el PDS debe autorizar por separado el acceso al contenido.

## Evidencia de verificación

En la última ejecución del trabajo anterior pasaron **146 pruebas en nueve suites**:

- Siete suites PDS: 111 pruebas de almacenamiento, políticas, resolver,
  client attestation, verificador M8 y almacenamiento duradero de desafíos.
- Interoperabilidad del publisher: 17 pruebas.
- Outbox Postgres: 18 pruebas.

Pasaron también el typecheck dirigido y el lint de los últimos cambios de
máximos verificados y conciliación de recibos. Las pruebas emplearon SQLite y
Postgres reales; Postgres se ejecutó temporalmente y se detuvo al terminar.

Estos resultados no equivalen a un build limpio de todo el monorepo, a regresión
completa de PARA ni a una prueba HTTP desplegada. Se reutilizaron dependencias y
declaraciones compiladas de main; el lint dirigido exceptuó resolución de imports
por ese entorno local. Esta preparación del informe verificó el estado Git y
la documentación, **no ejecutó nuevamente las suites**.

## Trabajo pendiente para una capacidad utilizable

1. Recuperación autenticada mediante checkpoint ante actualizaciones realmente
   perdidas: siguiente etapa detallada en `TRASPASO_CHECKPOINT_PARA_ES.md`.
2. Fuente de políticas autorizada por gobernanza, transporte autenticado y
   manejo seguro de snapshots grandes; después, worker de entrega.
3. Acuerdo del perfil M8 con el broker y pruebas de firma/JWKS entre servicios reales.
4. Configuración revisada de confianza, roles, acciones, colecciones y frescura.
5. Conciliación manual con main, preservando PDS/OAuth, CAR y funciones PARA.
6. Intercambio de credenciales con OAuth/client attestation, DPoP, M8 y resolver,
   inicialmente detrás de una bandera apagada, con límites y limpieza operativa.
7. Matriz completa de regresiones y revisión antes de conectar registros privados
   o considerar activación pública. No hay fecha de producción comprometida.

El trabajo institucional de Matrix pertenece a otra línea de desarrollo. Este
informe no atribuye sus funciones ni certifica sus pruebas como parte de este port.

## Balance

El avance principal es pasar de una arquitectura propuesta a componentes de
seguridad persistentes y pruebas de interoperabilidad verificables. El riesgo
pendiente se concentra en recuperación completa, fuentes de autoridad, transporte
e integración operativa. No se asigna un porcentaje global: superar pruebas de
componentes no significa haber terminado el producto ni su integración.
