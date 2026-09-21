# Plan de trabajo — G1: gobernanza integrada y privacidad

Estado: ejecución iniciada el **21 de septiembre de 2026** por instrucción del
usuario. No autoriza despliegue. La ventana de fechas de abajo corresponde a la
planificación original; el trabajo comenzó antes. Preparado el 20 de septiembre.

Avance y evidencias: [bitácora de ejecución](./GOVERNANCE-G1-EXECUTION.md).

Base: [revisión de producción](./GOVERNANCE-PRODUCTION-REVIEW-2026-09-20.md),
[plan trimestral](./QUARTER_PLAN_2026Q4.md) y
[decisiones de voto privado OD-7](./OD-7-BALLOT-IDENTITY-REGISTRATION.md).

## Objetivo y capacidad

**Terminar el sprint con reglas versionadas, un motor de referencia que conecte
delegación, intensidad y costo cuadrático, y un recorrido de interfaz que use
sus resultados con datos sintéticos.** Los accesos a papeletas identificables
permanecen cerrados. El motor de referencia valida reglas; no constituye un
sistema de voto privado ni un resultado vinculante.

- Ventana del próximo sprint del calendario existente: **29 de septiembre–10 de
  octubre de 2026**. Trabajo hábil: 29 de septiembre–9 de octubre, nueve días.
- Capacidad asumida: una persona de ingeniería, como establece el plan trimestral.
- Compromiso propuesto: **8 días de trabajo + 1 día de reserva**. Estimaciones
  iniciales, sujetas a revisión al conocer el estado del build.
- Responsable de implementación: ingeniería del proyecto. El propietario del
  producto resuelve las reglas electorales; la evaluación criptográfica necesita
  un especialista cuya disponibilidad aún no está confirmada.
- Este alcance **sustituye la capacidad de S3**, no se suma al trabajo existente.
  MAS, `para-idp` y el grant M8 de S3 necesitarían reprogramación o capacidad
  adicional. El plan trimestral no se modifica automáticamente. Si S3 conserva
  su alcance actual, este plan pasa a la siguiente ventana con capacidad; no
  se mantiene la misma fecha prometiendo ambas cargas.

El sprint resuelve la ambigüedad funcional, implementa una referencia comprobable
y cierra rutas inseguras alcanzables. **No promete resolver y auditar toda la
criptografía en nueve días.** Las etapas de cierre total están al final.

## Backlog comprometido

| ID | Prioridad / esfuerzo | Trabajo y ubicación | Entregable y aceptación |
| --- | --- | --- | --- |
| G1-01 | P0 · 0,5 días | Establecer base reproducible en WatZappa/PARA; inventariar los cambios locales de la revisión y sus pruebas | Registrar versiones de Node/pnpm, comandos y fallos de build; ejecutar las 17 pruebas dirigidas del informe o su conjunto actualizado. Separar fallos anteriores y nuevos. No iniciar una actualización general de dependencias; si no se recupera el build dentro del tiempo asignado, abrir un bloqueo de release con reproducción |
| G1-02 | P0 · 1,5 días | Especificación de elección y modelo de privacidad; contratos entre WatZappa, PARA, mubEZ e iM8 | Documento versionado con las reglas de la sección siguiente, tabla de datos por actor y vectores de ejemplo con resultados esperados. Registrar decisiones del producto y preguntas pendientes. Seleccionar qué requisitos debe satisfacer una solución criptográfica existente; no afirmar que una biblioteca los satisface sin comprobarlo |
| G1-03 | P1 · 2,5 días | Motor de referencia puro y pruebas en backend; adaptadores explícitos para las dos familias de delegación | Resolver ámbito, precedencia, voto directo, cadenas, ciclos, expiración, revocación y cierre; producir una sola representación normalizada para los conteos. Verificar rango y costo con créditos sintéticos por elección. Pruebas de conservación, idempotencia del cálculo y resultados independientes del orden de entrada. Rechazar entradas ambiguas; no sumar ciegamente las dos familias de registros |
| G1-04 | P0 · 1 día | Endurecer límites actuales en PDS/AppView y evaluar la ruta de pruebas de mubEZ | Mantener congelaciones con la bandera encendida y apagada. Inventariar consumidores de la prueba opcional y exigir rechazo donde la prueba sea requisito de autorización, sin convertir silenciosamente la deliberación pública en voto privado. Preparar un dry run para detectar delegaciones históricas inválidas, con conteos y plan de reindexación; no borrar ni exportar datos personales |
| G1-05 | P1 · 1,5 días | Recorrido de interfaz en PARA conectado al motor de referencia mediante fixtures contractuales | Selección de voto/delegación, intensidad, costo/saldo y resultado leen los mismos ejemplos versionados. Estados de carga, error, revocación y cierre; pantallas de estadísticas con estados de publicación explícitos. Etiqueta visible de demostración. Recorrido web verificable y revisión de accesibilidad de controles; registrar resultados y pendientes nativos |
| G1-06 | P0 · 1 día | Verificación conjunta, documentación y revisión de salida | Demostrar los escenarios de abajo, comparar motor y UI, adjuntar pruebas y capturas sin datos reales, comprobar que la demo no publica registros en repositorios de usuarios. Emitir decisión de salida y estimación revisada de la siguiente etapa |
| Reserva | 1 día | Incidencias y correcciones de los entregables anteriores | No se asigna a nuevas funciones. Si los bloqueos exceden la reserva, reducir el recorrido visual a una pantalla vertical completa y conservar especificación, pruebas y controles de privacidad |

Las pruebas forman parte del esfuerzo de cada ticket. No se presupone trabajo
paralelo de varias personas. G1-03 depende de G1-02; G1-05 depende del contrato
y de ejemplos estables de G1-03; G1-06 depende del resto.

## Decisiones que deben quedar cerradas en G1-02

Estas son decisiones de producto pendientes, no reglas ya aprobadas:

1. **Unidad electoral:** ID, participantes elegibles, versión de padrón, fechas
   y reloj autoritativo, opciones, rango, presupuesto por persona y elección,
   quórum y desempate. El denominador de quórum no se deriva de votos recibidos.
2. **Qué se delega:** facultad de seleccionar una señal, unidades de peso o
   créditos. Definir quién puede gastarlos, por cuánto tiempo y en qué ámbito.
   El costo cuadrático de una señal y el descuento √N a un bloque de delegación
   son reglas distintas; no introducir ambos sin justificar el resultado.
3. **Prioridad y ambigüedad:** elección entre ámbitos superpuestos, dos
   delegaciones vigentes, voto directo frente a delegado, cadenas y ciclos.
   Propuesta para evaluar: el voto directo prevalece por sujeto; ciclos y
   destinos sin voto quedan sin ejercer. No cambiar resultados históricos.
4. **Reemplazo y revocación:** cuándo surten efecto, cómo se libera o reasigna
   gasto antes del cierre y qué queda inmutable después. Especificar el caso en
   que el representante ya ejerció el mandato. Una revocación no puede crear
   presupuesto adicional ni duplicar una papeleta.
5. **Privacidad que se promete:** frente a otros usuarios, representante,
   operador, emisor y posibles coaliciones. Identificar metadatos de red,
   tiempos, logs, copias y correlaciones. Definir si la delegación también debe
   ser privada; una papeleta anónima con un grafo público no cumple por sí sola
   el objetivo completo.
6. **Publicación:** qué resultados exactos pueden abrirse al cierre y qué
   estadísticas auxiliares se publican antes o después. Enumerar consultas y
   filtros permitidos. Analizar celdas pequeñas y diferencias entre consultas;
   si se considera ruido, definir su política y presupuesto sin alterar de
   manera oculta el resultado electoral oficial.

Si faltan decisiones, el motor las implementa como alternativas explícitas de
laboratorio con ejemplos; ninguna se convierte en política de producción por
omisión. La salida registra qué decisiones siguen bloqueando la integración.

## Secuencia de trabajo

| Fecha | Secuencia prevista | Evidencia de avance |
| --- | --- | --- |
| 29–30 sep | G1-01 y G1-02 | Base reproducible, contrato y decisiones electorales |
| 1–2 oct y mañana del 5 oct | G1-03 | Motor, fixtures y pruebas de invariantes |
| Tarde del 5 oct y mañana del 6 oct | G1-04 | Pruebas de cierre de accesos y diagnóstico histórico |
| Tarde del 6 oct y 7 oct | G1-05 | Recorrido web conectado al contrato |
| 8 oct | G1-06 | Demostración, evidencias y evaluación de salida |
| 9 oct | Reserva | Correcciones y cierre del backlog pendiente |

En el punto medio, el 5 de octubre, revisar avance y consumo de reserva. Si el
motor no conserva peso o el build impide probarlo, recortar la amplitud de la
demo; no omitir validaciones para sostener la fecha.

## Escenarios obligatorios de demostración

- A delega en B, B en C: el resultado reconoce una sola vez cada unidad elegible
  y solo el ámbito autorizado. A vota directamente: no permanece también su
  peso dentro de C para ese sujeto.
- Ciclo A→B→A, autodelegación, delegador ajeno, ámbito inexistente y delegación
  expirada: se aplica la política documentada sin crear peso ni bloquear el motor.
- Varias propuestas comparten el presupuesto de una elección: señales de
  intensidad 1, 2 y 3 cuestan 1, 4 y 9 en los vectores que adopten `costo = señal²`;
  se verifica también el signo y el tratamiento de señal cero. El monto del
  presupuesto y la regla de delegación vienen de la configuración, no de la UI.
- Sustituir/revocar antes del corte recalcula el saldo según la regla elegida;
  después del corte el resultado permanece estable. Repetir el cálculo y
  reordenar entradas equivalentes no cambia la salida.
- Fallo de prueba obligatoria rechaza la operación; activar la bandera QV no
  abre los cuatro endpoints históricos. La UI distingue un bloqueo de privacidad
  de un fallo recuperable.
- Todas las pantallas muestran el mismo ID de elección, versión de reglas y
  resultado. Cambio de cuenta, datos vacíos y reintento no presentan datos de
  otro usuario ni un saldo ficticio como saldo real.

La carrera de dos escrituras contra una base de datos real se exige en G2:
un motor puro no demuestra atomicidad de almacenamiento.

## Criterio de salida de G1

G1 está terminado cuando sus documentos, código de referencia, pruebas y demo
son revisables y los escenarios comprometidos tienen evidencia. Se registra
por separado el estado del build completo: un conjunto acotado de pruebas verde
no lo sustituye. No se reabre el voto experimental para realizar la demo.

La decisión esperada es **apto para continuar integración en laboratorio**.
Solo puede decirse eso si el contrato no deja ambiguas las reglas usadas por la
referencia. No significa apto para elecciones reales ni anonimato certificado.

## Ruta posterior para resolver la totalidad de los hallazgos

| Etapa / tickets | Cierre concreto | Dependencias y salida |
| --- | --- | --- |
| G2 — G2-01 almacenamiento; G2-02 admisión/gasto; G2-03 cierre/reconstrucción | Servicio de elección con transacción atómica entre aceptación, sustitución y presupuesto; rechazo de replay, doble gasto y carrera al cerrar; un snapshot consistente para APIs | Contrato G1. Integración con identidad sintética, sin datos personales. Dos solicitudes concurrentes no sobrepasan presupuesto; recuperación y replay producen exactamente el mismo resultado |
| G3 — G3-01 selección de protocolo; G3-02 implementación de pruebas/delegación; G3-03 revisión independiente | Credencial única no enlazable con la cuenta, prueba ligada al contenido y elección, rango, gasto y conservación de delegación; eliminar dependencias de `aliasDid` del flujo privado | Requisitos G1, evaluación especializada y compatibilidad comprobada con OD-7. No borrar vínculos actuales para simular anonimato. No habilitar mientras no exista prueba verificable de todas las propiedades requeridas |
| G4 — G4-01 publicación; G4-02 interfaz integrada; G4-03 privacidad de operación | Instantáneas autorizadas, defensa frente a diferencias y filtros, mismos datos/versiones en todas las pantallas; revocación y recibos reales; política de logs y cachés | Servicio G2 y protocolo G3. Evidencia de privacidad en APIs, firehose, logs, métricas y respaldos; flujo completo probado en web, iOS y Android, incluyendo lector de pantalla y errores |
| G5 — G5-01 migración; G5-02 carga/restauración; G5-03 decisión de release | Reindexación histórica ensayada con rollback, builds reproducibles, pruebas de carga sobre límites fijados, recuperación y evaluación de seguridad final | G2–G4 cerrados y hallazgos críticos resueltos. Informe de release con alcance de anonimato explícito, pruebas completas y plan operativo. No prometer anonimizar copias que ya se publicaron |

G2 puede prepararse sin esperar a la criptografía definitiva mediante contratos
intercambiables en laboratorio. Su formato de producción depende de G3. Con una
sola persona, las etapas compiten por la misma capacidad; esta tabla no implica
ejecución simultánea ni que cada etapa quepa en un sprint. El cierre de G1 debe
producir la estimación de G2 y el presupuesto/agenda de revisión de G3. **La fecha
de producción permanece sin compromiso hasta resolver esa dependencia.**

Cobertura del informe: anonimato y pruebas → G1-02/G1-04/G3; delegación histórica
→ G1-04/G5; conteo integrado y reglas → G1-02/G1-03/G2; interfaz → G1-05/G4;
estadísticas → G1-02/G4; build, carga y operación → G1-01/G5.
