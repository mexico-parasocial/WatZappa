# Custodia de llaves: nota operativa para las decisiones de DevOps

**Estado:** guía informativa, no una capacidad implementada. Hoy no existe llave
de producción, worker de entrega ni ruta habilitada. Este documento no crea
permisos de gobernanza ni identidades de producción; fija el contexto y las
recomendaciones para cuando se decida el despliegue. El protocolo de firmas ya
existe y está probado; la custodia es responsabilidad operativa, deliberadamente
fuera del código.

## Inventario de llaves

| Llave                                                  | Qué protege                                                                                  | Si se pierde                                                                                                        | Si se roba                                                                                             |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Ed25519 del publicador de políticas (AppView → PDS)    | Toda la cadena de autorización: membresía, roles, revocaciones y checkpoints de recuperación | Imposible firmar actualizaciones o recuperar un `stale`; los espacios quedan en denegación permanente (fail-closed) | Firma de un snapshot de gobernanza que se admite como miembro activo: compromiso total de autorización |
| Llaves de firma de repo del PDS (por actor, SECP256K1) | Integridad del repositorio de cada cuenta                                                    | La cuenta queda congelada                                                                                           | Escrituras falsificadas de esa cuenta                                                                  |
| Llave de rotación PLC (si se auto-hospeda identidad)   | Control de cada DID                                                                          | Cuentas irrecuperables                                                                                              | Secuestro de identidades                                                                               |
| Secreto JWT del PDS                                    | Sesiones activas                                                                             | Rotarlo expulsa sesiones (molestia menor)                                                                           | Suplantación de usuarios autenticados                                                                  |
| Llaves del broker M8 (cuando exista el acuerdo)        | Assertions de assurance                                                                      | No se emiten credenciales assured                                                                                   | Assurance falsificado; el resolver sigue mandando, pero el frente se debilita                          |

La llave del publicador es la crítica: no protege un transporte, protege la
política misma de acceso a archivos privados.

## Lo que el protocolo ya garantiza (y exige a la operación)

- La llave privada es siempre aportada por el llamador
  (`ParaPolicyPublisher.create`); el módulo no genera ni persiste llaves, y el
  JWKS publicado contiene solo material público. El outbox almacena artefactos
  firmados, nunca material de firma.
- El PDS solo acepta llaves públicas pinneadas (1–16, `kid` únicos); no hay
  descubrimiento por URL ni por token. Rotar es actualizar configuración
  confiable, nunca regenerar la identidad del stream.
- No existe rollback: pisos monótonos de versión/época y el latch `stale` hacen
  imposible reescribir historia hacia atrás, incluso con la llave legítima. Un
  atacante solo puede publicar hacia adelante; eso es detectable.
- Cada estado aceptado dejó recibo firmado. La conciliación de recibos contra
  el ledger del outbox es la herramienta forense: una versión con evidencia
  firmada que no salió de gobernanza es una publicación no autorizada.
- El desafío de checkpoint está ligado al emisor: quien tiene la llave puede
  recuperar. Custodia de llave = poder de autorización.

## Dónde vive la llave, por fase de despliegue

**Fase 1 — staging:** secreto en archivo con permisos estrictos en el host
firmante + escrow desde el día uno. Runbook de rotación escrito.

**Fase 2 — piloto con usuarios:** inyección desde un secrets manager
(Vault, SOPS+age). Nada en disco en claro, nada en imágenes de contenedor,
nada en CI.

**Fase 3 — producción institucional:** la llave de producción nunca toca disco
ni proceso generalista:

- Opción soberana: YubiKey/SoftHSM con Ed25519 en el host firmante, accesible
  solo al proceso de firma.
- Opción cloud: KMS asimétrico (Ed25519), firma vía API, llave inexportable.
- Arquitectura: separar el **servicio de firma** del worker de entrega. El
  worker vive junto al Postgres del AppView; el firmante es un servicio angosto
  en el nodo de identidad/llaves, sin superficie pública y con red restringida.
  Comprometer el AppView no debe entregar la llave.

## Rotación

1. Generar la nueva llave offline; una llave por entorno — nunca reusar `kid`
   entre dev/staging/producción.
2. Añadir el `kid` público al conjunto pinneado de cada PDS (ventana de
   solapamiento: ambas llaves aceptadas).
3. Firmar con el `kid` nuevo.
4. Retirar el `kid` viejo del conjunto de aceptación; conservarlo en una lista
   de solo-auditoría para verificar recibos históricos sin aceptar firmas nuevas.

Cadencia sugerida: rotación anual programada + procedimiento de emergencia
probado. La revocación de emergencia es retirar el `kid` de los conjuntos
pinneados — es configuración por espacio, así que la gestión de configuración
debe poder hacerla en lote.

## Escrow

- Generación offline (equipo aislado), nunca en el host de servicio.
- Split Shamir 2-de-3 (p. ej. dirección, operaciones, un tercero externo o
  auditor), sobres sellados en ubicaciones físicas distintas.
- Ensayo de recuperación trimestral: un escrow no probado no es un backup.
- Aplica como mínimo a la llave del publicador y a la de PLC.

## Runbook ante compromiso de la llave del publicador

1. Retirar el `kid` comprometido de los conjuntos pinneados de cada PDS.
2. Generar y distribuir el `kid` nuevo.
3. Auditar: conciliar recibos (`para_space_policy_delta`, checkpoints) contra
   el ledger del outbox; toda evidencia firmada sin origen en gobernanza es
   publicación del atacante.
4. Snapshot de reafirmación: firmar con la llave nueva el estado correcto de
   membresía por encima de los pisos. El protocolo garantiza que el atacante
   no pudo bajar nada; recuperar siempre es firmar hacia adelante el estado
   bueno.

## Checklist de decisiones DevOps (cuando toque)

- [ ] Dónde vive la llave del publicador en cada entorno (archivo → secrets
      manager → HSM/KMS).
- [ ] Servicio de firma separado del worker de entrega (fase 3).
- [ ] Procedimiento de generación offline y escrow multipartito, con ensayo.
- [ ] Gestión de configuración capaz de añadir/retirar `kid` en lote por PDS.
- [ ] Lista de solo-auditoría de llaves públicas retiradas.
- [ ] Rotación anual programada + runbook de emergencia probado.
- [ ] Auditoría periódica de recibos instalados contra el ledger del outbox.
- [ ] Nodo dedicado de identidad/llaves dentro del plan de metal (junto a
      PLC y custodia); backups cifrados fuera de sitio para llaves,
      Postgres, blobs y actor stores.

Relación con la infraestructura: en el plan de despliegue por fases, la
custodia vive en el nodo de identidad/llaves de la fase 3 — el mismo que
hospedaría PLC — pequeño, endurecido, sin superficie pública y con los
backups más estrictos del parque.
