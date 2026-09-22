# G1 — ejecución y evidencia

Actualizado el 21 de septiembre de 2026. Trabajo local iniciado por instrucción
del usuario, antes de la ventana originalmente propuesta. No hay despliegue ni
habilitación de elecciones reales. El sprint **continúa abierto**.

## Estado de los entregables

| Ticket | Estado | Evidencia y pendiente |
| --- | --- | --- |
| G1-01 | Diagnóstico realizado | Versiones y comandos reproducibles abajo. El paquete bsky y el motor pasan tipos; PARA mantiene errores generales de tipos que bloquean release. No equivale a build verde del monorepo. |
| G1-02 | Contrato provisional | [Contrato y vectores](./GOVERNANCE-LAB-CONTRACT.md), con privacidad por actor. Falta resolver política electoral, problema de saldo de seguidores y seleccionar/evaluar protocolo criptográfico. |
| G1-03 | Referencia sintética implementada | `packages/bsky/src/governance-lab`: motor puro, fixtures y dos adaptadores. 31 pruebas del motor/adaptadores; incluye 256 configuraciones de grafo dentro de una prueba. No es almacenamiento transaccional. |
| G1-04 | Parcial | Congelaciones y validación de delegador comprobadas. Auditoría SQL de solo lectura probada en PostgreSQL sintético. No se ejecutó sobre históricos reales ni se realizó reindexación. El inventario de pruebas opcionales está documentado; verificar autoridad en esos flujos sigue pendiente. |
| G1-05 | Recorrido web de laboratorio disponible | `../PARA/scripts/governance-lab` compila el mismo motor. Voto, delegación, revocación, saldo, cierre y estadísticas funcionan con datos ficticios. Falta integración con componentes ALF/navegación de PARA y validación nativa. |
| G1-06 | Verificación parcial | 62 pruebas dirigidas aprobadas, recorrido visual web y controles del servidor comprobados. No sustituye auditoría de privacidad, accesibilidad completa, build general ni pruebas de release. |

## Validación ejecutada

Entorno: WatZappa con Node **22.22.1** y pnpm **11.11.0**; PARA con Node
**24.18.0** y pnpm **11.21.0**. Los comandos se ejecutan desde el paquete indicado.
Las pruebas de backend usan el wrapper del repositorio y su infraestructura Docker.

| Ubicación | Comando | Resultado observado |
| --- | --- | --- |
| `packages/bsky` | `pnpm test src/governance-lab tests/governance-delegation-audit.test.ts src/api/com/para/community/quadratic-voting-gate.test.ts src/data-plane/server/indexing/plugins/para-qvl-delegation.test.ts` | 5 archivos, 43 pruebas aprobadas: motor 27, adaptadores 4, SQL 1, gate 8 y delegación 3 |
| `packages/pds` | `pnpm test:sqlite tests/ballot-freeze.test.ts --runInBand` | 13 pruebas aprobadas |
| `PARA` | `pnpm test src/lib/qvl-status.test.ts --runInBand` | 6 pruebas aprobadas |
| `packages/bsky` | `node ../../node_modules/@typescript/native/bin/tsc -p tsconfig.build.json --noEmit` | Sin errores |
| `packages/bsky` | `node ../../node_modules/@typescript/native/bin/tsc -p tsconfig.governance-lab.json --noEmit` | Sin errores; repetido al reanudar |
| `packages/bsky` | `pnpm exec eslint src/governance-lab tests/governance-delegation-audit.test.ts` | Sin errores tras ordenar un import; repetido al reanudar |
| `PARA` | `pnpm typecheck:web` | 111 errores en el estado local existente; bloqueo de release pendiente |

Corrección del diagnóstico inicial: el shim local de `pnpm exec tsc` en bsky
resolvía TypeScript 4.5.2 desde una instalación antigua. Usar explícitamente el
compilador nativo fijado por el workspace elimina ese falso diagnóstico de
miles de errores de dependencias. No se cambió el shim ni se actualizaron
dependencias. La comprobación anterior de PARA continúa fallando y no debe
confundirse con este problema del compilador de backend.

Estos resultados son de conjuntos dirigidos, no de todas las suites. Los logs
temporales y procesos se perdieron al interrumpir la sesión; los resultados
anteriores fueron observados durante su ejecución. El servidor local se volvió
a iniciar y se repitieron lint, tipos del motor y comprobaciones HTTP.

## Recorrido visual comprobado

La demo vive en `http://127.0.0.1:8931`; se inicia desde PARA con
`node scripts/governance-lab/serve.mjs` usando Node 24.18.0. Estado únicamente en
memoria del navegador, sin sesiones, API de votación ni registros de usuarios.

- Cadena Ana → Bruno → Carla: saldo 5, intensidad de parque 6.
- Voto directo de Ana −3 en parque: saldo 0, intensidad conjunta 1; sin doble conteo.
- Intentar después +2 en biblioteca: error de presupuesto y estado anterior conservado.
- Reiniciar y cerrar: resultados finales sintéticos; acciones de escritura deshabilitadas.
- Retirar la delegación de Ana y cerrar: resultados retenidos por mínimo de participantes.
- Cambio de persona ficticia: saldo y representación corresponden a su selección.
- Revisión visual de escritorio y ancho 390 px: sin desbordamiento horizontal;
  controles etiquetados, foco visible y mensaje de estado. No se evaluó lector
  de pantalla ni se certifica conformidad WCAG. Las capturas se mostraron durante
  la sesión; no se guardaron como archivos de evidencia.

Comprobaciones HTTP al reanudar: GET `/` devuelve 200; POST `/` devuelve 403;
Host ajeno devuelve 403; ruta desconocida devuelve 404. Respuestas estáticas con
`no-store`, `nosniff` y CSP `connect-src 'none'`. Solo escucha en loopback.

## Próximo trabajo y salida

La referencia permite continuar pruebas de integración con datos sintéticos.
**No es apta para elecciones reales y no garantiza anonimato.** El mínimo de
publicación no soluciona inferencias ni diferencias entre agregados.

1. Resolver las reglas pendientes del contrato: qué se delega, límites de gasto
   de seguidores, abstención, quórum, aprobación y desempate. La variante
   `g1-follow-signal-v1` no se convierte en política por falta de respuesta.
2. Integrar el recorrido sintético en PARA/ALF, probar accesibilidad y dispositivos;
   resolver el bloqueo de tipos y completar la evidencia de G1-05/G1-06.
3. Ejecutar el diagnóstico histórico de solo lectura en un entorno identificado,
   registrar únicamente conteos y preparar reindexación/rollback; completar
   verificación de autoridad de las pruebas donde sean requisito de autorización.
4. Preparar G2 con identidad sintética: admisión atómica, ledger persistente,
   expiraciones, cierre y replay. Estimación inicial: **8–12 días de ingeniería**
   una vez fijadas las reglas, más revisión; confianza baja hasta elegir el
   almacenamiento y resolver el presupuesto de seguidores. No incluye G3.
5. G3 requiere evaluación especializada del protocolo completo y su modelo de
   confianza. Disponibilidad, presupuesto y fecha no confirmados; no hay fecha
   de producción comprometida.

Los repositorios contienen cambios locales de otras tareas. Esta entrega no
los agrupa en un commit ni atribuye a G1 modificaciones ajenas. Changeset de la
referencia: `.changeset/good-keys-attack.md` (`@atproto/bsky`, patch).
