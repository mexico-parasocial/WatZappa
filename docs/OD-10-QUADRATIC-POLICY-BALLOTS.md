# OD-10 — Voto cuadrático público sobre las boletas de política

**Estado:** propuesta, 2026-11-05. El 2026-11-06 se decidieron §7.1 a §7.7.
Se implementaron, sin commit, §7.5, §7.6 y la parte de la AppView de §7.7; el
presupuesto y la versión 2 de la boleta (§4) siguen sin construir.

**Alcance:** boletas de política públicas (`com.para.civic.vote` con
`subjectType: "policy"`, OD-7 §5d, ampliado el 2026-09-29). Las boletas de
cabildeo, el voto secreto (OD-9) y la delegación quedan fuera (§6).

---

## 1. Qué cambia, en un párrafo

Hoy una boleta de política tiene un `signal` de -3 a +3 que no cuesta nada:
cualquiera puede poner ±3 en todas las políticas. Esta propuesta le pone precio
a la intensidad: un `signal` _s_ cuesta _s²_ créditos, y cada persona tiene **30
créditos permanentes por comunidad**. Las políticas no cierran nunca. Cada quien
reparte sus créditos entre las políticas de su comunidad y los puede mover
cuando quiera. Para apoyar una política nueva con el presupuesto agotado, hay
que bajar o retirar un voto en otra. **El conteo no cambia** (`getPolicyTally`
sigue sumando `signal`), así que lo único nuevo es una restricción en el
momento en que se autoriza la boleta. Esa restricción solo puede vivir en m8,
que es el único servicio que sabe que dos identidades son la misma persona.

| `signal` | Costo (créditos) |
| -------- | ---------------- |
| ±1       | 1                |
| ±2       | 4                |
| ±3       | 9                |

No existe una boleta de política con `signal` 0 (§7.5). No votar es no tener
boleta, y eso no cuesta nada.

Esto es exactamente la ponderación `√créditos` que `getTallySimulation`
calculaba en sombra (OD-7 §5e), expresada en votos y no en créditos. No hace
falta reabrir el experimento QV-LD para tenerla.

## 2. Por qué ahora es barato

OD-7 §5a.3 y §5b dicen que el voto cuadrático es "el caso difícil", pero lo
dicen para el voto **secreto**: con compromisos de Pedersen, _s²_ es una prueba
de multiplicación. Desde el 2026-09-29 la boleta de política es pública. El
`signal` viaja en claro y m8 ya lo ve al emitir la autorización
(`policyProofMac`). Revisar Σ*s²* ≤ presupuesto es aritmética simple.

OD-7 §5a.3 ya aceptó la tercera salida, la acumulación del gasto del lado del
servidor contra una identidad estable. Esta propuesta la usa contra la persona
en m8, no contra la identidad de voto.

## 3. Lo que hay hoy, verificado leyendo el código (no ejecutado)

- **Emisión.** `issueCivicVoteProof` (`mubEZ/src/services/civicVoteIdentityService.ts`)
  resuelve a la persona por su credencial, deriva el nullifier de `person.id`
  y guarda una fila `(person_id, subject_type, subject_uri)`. Para política
  devuelve `m8:policy:v1:` + MAC sobre
  `proofRef ‖ nullifier ‖ subjectUri ‖ actorDid ‖ signal`. m8 no guarda el
  `signal`.
- **Verificación.** `verifyPolicyVoteProof` recalcula ese MAC a partir del
  `proof_ref` de la fila. Como `proof_ref` no cambia entre emisiones,
  **cualquier autorización que m8 haya emitido para ese sujeto sigue
  verificando para siempre**, con el `signal` que tenía.
- **Indexado.** `para_policy_vote` guarda una fila por nullifier. Si una
  identidad nueva vota de nuevo, la boleta se reemplaza.
- **Conteo.** `getParaPolicyTally` (`packages/bsky/src/data-plane/server/routes/records.ts`)
  suma `signal`, calcula el promedio y el quórum (20 % de los miembros
  elegibles, mínimo 10). Saca un resultado (`passed`, `strong_passed`, …), y
  la política queda `certified` si es oficial y aprobada. Todo se calcula en
  vivo en cada consulta, y la consulta no filtra por membresía.
- **Cierre.** Una política es un post (`postType: 'policy'`) y no tiene fecha
  de cierre (OD-9 §3 tampoco la encontró). Esta propuesta lo deja así.

**Hallazgo que importa para el presupuesto.** En voto lineal, que una boleta
vieja siga verificando no daña a nadie: el votante solo puede regresar su propia
boleta a un valor anterior. En voto cuadrático es un agujero. La secuencia
sería: votar +3 (gasta 9), cambiar a +1 (recupera 8), volver a publicar el
registro viejo de +3 con `putRecord` (verifica, gasta 0) y repetir en otra
política. **Antes de cobrar créditos, una boleta tiene que poder quedar vieja.**

## 4. La propuesta

### 4a. Un número de versión por boleta

Cada fila de `civic_vote_nullifiers` de tipo política gana un `seq` entero,
que empieza en 0. Cada emisión nueva para ese sujeto lo sube en uno. El MAC
pasa a una v2 que también cubre `seq` y el ámbito del presupuesto:

```
m8:policy:v2:  MAC('m8:public-policy-authorization:v2',
                   proofRef, nullifier, subjectUri, actorDid,
                   signal, seq, budgetScope)
```

`budgetScope` es el DID de la comunidad de la política. `verifyPolicyVoteProof`
acepta una v2 solo si su `seq` es el `seq` actual de la fila, así que una
boleta vieja deja de verificar en cuanto existe una más nueva. El registro
`com.para.civic.vote` gana dos campos opcionales, `seq` y `budgetScope`, y la
AppView hace upsert solo si el `seq` que llega es mayor que el guardado.

### 4b. El presupuesto, en m8

- **Ámbito:** persona × comunidad. Las comunidades no comparten créditos. Una
  política fuera de toda comunidad usa un ámbito global.
- **Presupuesto:** 30 créditos por persona y comunidad, permanentes. Nunca se
  recargan ni vencen; solo se mueven (§7.2, §7.3).
- **Libro de gasto:** una tabla nueva `civic_vote_budget(person_id,
budget_scope, spent)` con el total por ámbito. **No se guarda costo por
  sujeto** (§7.1).
- **Votar o cambiar el voto.** Si ya hay una boleta para el sujeto, el cliente
  envía el `signal` nuevo y además la boleta vigente (`signal`, `seq`,
  `eligibilityProofRef`). m8 verifica esa boleta con el MAC, y así obtiene el
  costo anterior sin tenerlo guardado. Luego, en una sola transacción:
  `spent' = spent − anterior² + nuevo²`. Si `spent'` rebasa 30, se rechaza con
  `BUDGET_EXCEEDED` y se devuelve lo que queda. Si cabe, sube `seq` y se emite
  la autorización. Bajar un voto de +3 a +1 devuelve 8 créditos en el acto.
- **Idempotencia.** Repetir la misma emisión (mismo `seq` anterior, mismo
  `signal`) devuelve la misma autorización sin volver a cobrar, para que el
  cliente pueda reintentar la escritura en el PDS si falla.
- **Retirar un voto.** No es una boleta, porque no hay `signal` 0 (§7.5). Es
  una operación aparte: el cliente presenta la boleta vigente, m8 devuelve su
  costo, sube `seq` y marca la fila como retirada, para que ninguna boleta
  anterior vuelva a verificar. Después el cliente borra el registro. Borrar
  sin pasar por m8 deja los créditos ocupados. El cliente debe hacer siempre
  las dos cosas.
- **Políticas borradas.** m8 no revisa que la política siga existiendo, así
  que retirar un voto de una política que su autor borró funciona igual y
  devuelve los créditos.
- **Consulta.** Un `GET` de m8, solo con sesión, que devuelve `spent` y lo que
  queda en la comunidad. La AppView no puede dar este dato: no sabe qué
  identidades son la misma persona, y no debe saberlo.

### 4c. La AppView

- Al indexar, rechaza una boleta v2 cuyo `budgetScope` no sea la comunidad de
  la política. Así nadie puede cobrar un voto al presupuesto de otra comunidad.
- Una vez activado el voto cuadrático, rechaza las v1 nuevas. La regla vive en
  `ballotWritePolicyRefusal` / `verifyPublicBallotProof` (`@atproto/common`),
  no en línea (AGENTS.md).
- `getPolicyTally` sigue sumando igual y en vivo. Agrega
  `budgetMode: "quadratic"` para que el cliente lo muestre.

### 4d. El cliente (repo PARA)

Los requisitos de OD-9 §4b dejan de ser deseables y pasan a ser obligatorios.
Con presupuesto, cada valor intermedio cuesta una ida a m8 y puede fallar:

1. Mientras la persona ajusta, el valor es un borrador local. No se envía
   nada por cada paso.
2. Se confirma una sola vez, al soltar o tras el tiempo de espera.
3. Hay una sola confirmación en vuelo por sujeto, y gana la última.
4. Volver a votar reescribe el mismo registro (rkey fijo por votante y
   sujeto), en lugar de crear uno nuevo y borrar el anterior.

Además: mostrar el costo del valor en borrador y los créditos que quedan, y
deshabilitar el paso que no alcanza. El control sigue pasando por el 0 al ir
de -1 a +1, pero si el borrador se queda en 0 no se emite boleta. Si ya había
una, se retira (§4b).

Con un presupuesto permanente hace falta una vista nueva: **dónde están mis
créditos.** Es la lista de mis votos en la comunidad, con el costo de cada uno,
para poder bajar o retirar uno sin tener que buscar la política. Incluye los
votos en políticas que se borraron, que de otro modo serían créditos
invisibles y atrapados.

**Cambio de identidad.** Si la persona votó con la identidad A y ahora usa la
B, el cliente necesita la boleta vigente para presentarla (§4b). Puede pedirle
a m8 el nullifier del sujeto y buscar la boleta en la AppView por nullifier,
con una consulta pública sin sesión. Ese dato ya es público dentro del
registro.

## 5. Qué implica que las políticas no cierren

Es la opción más simple: no hay rondas, ni recargas, ni reembolsos al cierre,
ni un cargo que abra o cierre nada. El único momento en que vuelven créditos es
cuando la persona baja o retira un voto, y eso ya lo resuelve §4b sin guardar
el costo de cada voto. Lo que trae consigo:

- **El presupuesto es una cartera, no una boleta.** Votar algo nuevo con el
  presupuesto agotado obliga a quitarle apoyo a otra cosa. Eso es lo que hace
  útil al voto cuadrático: los 30 créditos dicen qué le importa a la persona
  _hoy_.
- **Las políticas viejas pierden apoyo solas** a medida que la gente mueve sus
  créditos hacia lo nuevo. No hace falta un cierre para que dejen de pesar.
- **El resultado nunca es definitivo.** `certified` hoy se calcula en vivo, así
  que una política puede quedar aprobada esta semana y dejar de estarlo la
  siguiente. Por eso es una lectura de opinión y no obliga a nadie (§7.6).
- **Los votos de quien se va se quedan.** Si alguien deja la comunidad o la
  app, sus boletas siguen en su repo y sus créditos siguen puestos donde los
  dejó, porque nadie los mueve. Si deben seguir contando lo decide §7.7.

## 5a. Esto revierte una decisión registrada en PARA

`PARA/docs/revocable-mandates-spec.md` §4.1 dice que el voto cuadrático se
"consideró y no se adoptó". Esta propuesta lo adopta, así que hay que contestar
sus tres razones y, al firmarla, reescribir esa sección:

| Razón de §4.1                                                                                                                    | Respuesta de OD-10                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Es inmaduro: se usa sobre todo para consultas no vinculantes, y casi no hay teoría ni práctica de voto cuadrático con delegación | Por §7.6, el resultado de una política _es_ una lectura no vinculante, justo el uso donde el voto cuadrático tiene experiencia. La delegación queda fuera (§6.2) |
| Necesita un presupuesto, que hay que explicar, fijar y proteger contra el reparto entre varias cuentas                           | 30 créditos fijos (§7.2). El reparto entre cuentas lo evita m8, que lleva el gasto por persona y no por identidad (§4b). Explicarlo es trabajo del cliente (§4d) |
| Su privacidad es el caso más difícil: probar _k²_ bajo compromiso                                                                | La boleta de política es pública desde el 2026-09-29, así que no hay compromiso que probar (§2)                                                                  |

Hay dos cosas de esa misma especificación que también cambian:

- **El desglose en 7 barras** que §4.1 recomienda mostrar pasa a 6, sin el 0
  (§7.5).
- **La aritmética de delegación de §5** copia el `signal` del delegado en cada
  voto prestado. Con presupuesto, cada voto prestado tendría un costo, y no
  está decidido quién lo paga. Mientras eso no se decida, el voto prestado no
  puede convivir con el voto cuadrático. Esa sección menciona además "el día
  antes del cierre", y las políticas ya no cierran (§7.3).

## 6. Qué no hace esta propuesta

1. **No es voto secreto.** La boleta sigue siendo pública y atribuible a la
   identidad que la emite (OD-7 §5d). El voto cuadrático secreto sigue fuera
   de alcance (OD-9 §5.7).
2. **No incluye delegación.** `delegatedFrom` sigue rechazado. Con
   presupuesto, la delegación obliga a decidir si el delegado gasta créditos
   propios o del delegador, y publicar esa cadena es justo lo que §5b prohíbe.
   Se resuelve aparte, después de elegir una sola familia de delegación.
3. **No reabre QV-LD.** `listVotes`, `listIntensities`, `getTallySimulation`,
   `getAuditTrail` y las tablas `para_qvld_vote`, `para_qvld_intensity` y
   `para_qvld_eigenstate_snapshot` no son insumo de esta propuesta. Se pueden
   retirar de forma independiente.
4. **No le quita poder a m8.** m8 sigue viendo el `signal` al emitir, como
   hoy. Ahora además ve el `signal` anterior en cada cambio, y guarda un total
   por persona y comunidad.
5. **No cambia el conteo.** El voto cuadrático limita cuánto puede pesar una
   persona en total; no altera cómo se suma.

## 7. Decisiones

Las marcadas _pendiente_ son propuestas para firma, no decisiones tomadas.

1. **Dónde vive el costo por sujeto.** **Decidido 2026-11-06: no se guarda.**
   El cliente presenta la boleta vigente y m8 solo guarda el total (§4b). Se
   descartó guardar el costo por sujeto, que era más simple y no dependía del
   cliente. El motivo: m8 tendría en reposo persona → sujeto → |_s_|, y con
   eso podría cruzarse con las boletas públicas para adivinar qué DID es qué
   persona en sujetos con pocos votos. Eso va en contra de la dirección de
   OD-9 §1.
2. **Tamaño del presupuesto.** **Decidido 2026-11-06: 30 créditos por persona
   y comunidad**, como constante de plataforma durante el piloto, para no hacer
   depender a m8 de leer la configuración de gobierno de cada comunidad.
   Alcanzan, por ejemplo, para tres políticas a ±3, siete a ±2 o treinta a
   ±1. Más adelante cada comunidad podrá fijar el suyo.
3. **Cierre de las políticas.** **Decidido 2026-11-06: las políticas siempre
   están abiertas y el presupuesto es permanente.** Cada quien cambia su voto
   cuando quiera, y los créditos solo vuelven al bajar o retirar un voto (§5).
   Ese mismo día se eligieron primero rondas sin fecha de cierre, cada una con
   créditos nuevos, y se descartaron: obligaban a agrupar políticas, a que
   alguien con cargo abriera y cerrara rondas, a guardar una foto del
   resultado y a volver a presentar las políticas que no se decidían. Toda esa
   complejidad servía solo para recargar créditos, y un presupuesto que se
   mueve no lo necesita. También se descartó un `closesAt` por política.
4. **Las boletas v1 que ya existen.** **Decidido 2026-11-06: se eliminan, y
   el voto cuadrático se activa antes de la primera boleta real.** Contarlas
   gratis sería injusto con quien vota en v2. No hay boletas reales que
   perder: el piloto no está desplegado en staging ni en producción
   ([QUARTER_PLAN_2026Q4.md](./QUARTER_PLAN_2026Q4.md)), y las v1 que existen
   son de la semilla de dev-env y de pruebas locales. Al llegar v2:
   `ballotWritePolicyRefusal` rechaza las v1 nuevas, la AppView deja de
   contarlas y borra sus filas indexadas, y la semilla emite v2. Los datos
   locales se regeneran; no hay migración. Si antes de v2 se abriera una
   votación real, esta decisión se revisa.
5. **¿Se puede votar 0?** **Decidido 2026-11-06: no.** Una boleta de política
   lleva un `signal` de -3 a -1 o de +1 a +3. No hay voto neutral: quien no
   toma postura no tiene boleta, y no cuenta para el quórum ni para el
   promedio. Retirar un voto es una operación de m8, no una boleta (§4b). Hoy
   el 0 se acepta en cuatro sitios, que hay que cambiar juntos (§8): la regla
   de `@atproto/common` (`para-ballot-freeze.ts`, rango -3..+3), m8
   (`isPolicySignal`), el lexicon `com.para.civic.vote` (`minimum: -3`,
   `maximum: 3`) y la semilla de dev-env (`para-policies.ts` puede redondear
   a 0). El desglose de `getPolicyTally` también deja de tener la barra del 0.

   **Implementado el 2026-11-06** (sin commit): `isPolicySignal` en
   `@atproto/common` es la regla única de la PDS, del indexador y de
   `verifyPublicBallotProof`; m8 rechaza el 0 al emitir y al verificar; el
   lexicon lo dice en la descripción (su rango no puede excluir el 0); la
   semilla trata un 0 como abstención; y el conteo y `getPolicyCommunityVotes`
   no cuentan las boletas con 0 que ya estuvieran indexadas. Lo fijan
   `policy-tally-membership.test.ts`, `ballot-freeze.test.ts`,
   `para-cabildeo-proof.test.ts` y la prueba de integración de m8. La app
   PARA todavía ofrece el 0 (`POLICY_SIGNALS`, `VoteComposer`).

6. **Qué significa "aprobada" si nunca cierra.** **Decidido 2026-11-06: el
   resultado de una política es una lectura en vivo** de lo que la comunidad
   quiere, y puede cambiar. No obliga a nadie. Lo que deba obligar pasa por un
   cabildeo, que sí tiene plazo y que desde el 2026-11-05 es el único camino
   de propuesta y decisión. El cabildeo puede citar la política y su lectura
   del momento.

   Hoy el conteo habla como si fuera definitivo. `getParaPolicyTally` calcula
   `certified = official && aprobada` en vivo, y además asigna `official =
certified` (`records.ts:139-140`). El cliente PARA convierte `official` en
   el estado `'official'` y `certified` en `'passed'`
   (`PARA/src/lib/policy-consensus.ts`, `derivePolicyConsensusState`). Las dos
   palabras sugieren una decisión cerrada. Hay que cambiarlas:

   - Agregar a `com.para.civic.defs#policyTally` un campo nuevo,
     `passingNow` (nombre provisional), con el mismo cálculo.
   - Dejar de reutilizar `official` para el resultado, de modo que solo diga
     si la política la publicó una cuenta oficial.
   - `certified` es obligatorio en el lexicon, así que quitarlo rompe a los
     clientes que validan la respuesta. Se queda una versión marcado como
     obsoleto, con el mismo valor que `passingNow`, y después se elimina.
   - En el cliente, el estado deja de ser "aprobada" u "oficial" y pasa a
     una frase en presente, del tipo "hoy va aprobada".

   **Detalle decidido el 2026-11-06**, que reemplaza la lista anterior:

   - **Sin campo nuevo.** `outcome` ya es la lectura en vivo; no se agrega
     `passingNow`. `certified` queda una versión como obsoleto, igual a
     "`outcome` aprueba", y después se elimina.
   - **`official` sale del conteo.** Hoy lo escribe el propio autor en su
     `postMeta`, así que cualquiera podía declarar su política oficial y con
     eso volverla `certified`. La lectura en vivo no depende de quién publicó:
     `official` queda una versión como obsoleto, siempre en `false`, y después
     se elimina.
   - **`state` en presente:** `passing`, `failing`, `split` y `noQuorum`. Los
     valores viejos (`passed`, `failed`, `official`, y `civicTree`, que hoy se
     emite sin estar en el lexicon) quedan una versión como obsoletos.
   - **Texto en el cliente PARA:** "Mayoría a favor", "Mayoría en contra",
     "Sin mayoría" y "Faltan votos".

   **Implementado en la AppView y el lexicon el 2026-11-07** (sin commit):
   `getParaPolicyTally` devuelve `official: false`, `certified` igual a
   "`outcome` aprueba" y `state` en presente; el lexicon
   `com.para.civic.defs#policyTally` marca los campos y valores viejos como
   obsoletos. Lo fija `policy-tally-membership.test.ts`. Falta el cliente
   PARA (`derivePolicyConsensusState` y los textos), y quitar `official`,
   `certified` y los valores viejos de `state` una versión después.

7. **Quién cuenta en una política de comunidad.** **Decidido 2026-11-06:
   opción A.** Con políticas
   permanentes, la pregunta de los votos de quien se fue lleva a una más
   amplia: hoy nadie revisa membresía en ningún punto.

   **Lo que hay hoy, verificado leyendo el código (no ejecutado):**
   - m8 no revisa membresía al autorizar una boleta de política. Solo lo hace
     para `community_proposal` y `community_deliberation`
     (`issueCivicVoteProof`).
   - La AppView indexa la boleta sin revisar membresía (`cabildeo-vote.ts`).
   - `getPolicyTally` cuenta todas las boletas de la política, pero el quórum
     se calcula sobre los miembros activos (`getEligiblePolicyVoterCount`). El
     numerador incluye a quien no es miembro y el denominador no.
   - "Miembro activo" se lee de `membershipState`, que es lo que cada usuario
     escribe en su propio registro de membresía. Pasa lo mismo en
     `getPolicyCommunityVotes`. La regla del resto de la AppView es
     `filterActiveMembers` (`community-authority.ts`), que ya usa el conteo
     de cabildeo: manda la cadena de eventos de autoridad y, solo para quien
     no tiene ningún evento, vale su registro de membresía como respaldo
     heredado. Con la lectura directa del registro, alguien expulsado por un
     evento pero cuyo registro sigue diciendo "activo" contaba para el quórum.
   - La membresía es por identidad (DID), no por persona. Una persona puede
     votar desde su cuenta anónima por defecto, desde una identidad aislada o
     desde un perfil público (revocable-mandates-spec §4.0), y solo la que se
     unió a la comunidad es miembro. m8 no puede revisar la membresía "de la
     persona", porque no guarda qué DIDs son de quién (CD-12).

   **Opciones:**
   - **A. Solo miembros, por identidad.** Una boleta cuenta si la identidad
     que la emitió es miembro activo según los eventos de autoridad, en el
     momento de la consulta. Quien se va deja de contar en el acto, y si
     vuelve, sus boletas cuentan otra vez sin que nadie tenga que hacer nada.
     Las boletas de una identidad que no es miembro, incluida una aislada, no
     cuentan en esa comunidad. El cliente propone votar con la identidad
     miembro y avisa antes de gastar créditos en una boleta que no contaría.
   - **B. Cualquier persona de PARA.** La política está abierta a todos, y la
     comunidad solo la publica. Es lo más simple, pero entonces el quórum no
     puede seguir siendo el 20 % de los miembros, y el presupuesto "por
     comunidad" pierde sentido: alguien de fuera gasta créditos de una
     comunidad a la que no pertenece.

   **Se firmó A.** Con A, los créditos de quien se va siguen gastados en m8,
   pero ya no pesan. Si vuelve, los encuentra donde los dejó.

   **Implementado en la AppView el 2026-11-06** (sin commit):
   `getParaPolicyTally` cuenta solo boletas de identidades que
   `filterActiveMembers` da por activas en la comunidad de la política, al
   momento de la consulta. El número de elegibles del quórum y
   `getParaPolicyCommunityVotes` usan esa misma regla (`listActiveMembers`).
   Una política sin comunidad que se pueda resolver sigue contando todas sus
   boletas. Lo fija `packages/bsky/tests/policy-tally-membership.test.ts`.

   **Lo que queda:**
   - **El respaldo heredado.** Quien no tiene ningún evento de autoridad
     sigue siendo miembro por lo que declara en su propio registro. Es la
     regla vigente de toda la AppView, no algo de las políticas. Cerrarla es
     una decisión aparte: obliga a que toda membresía pase por un evento.
   - **El aviso en el cliente PARA:** proponer votar con la identidad que es
     miembro, y advertir antes de gastar créditos en un voto que no contaría.

## 8. Antes de construir

- [x] Firmar §7.1 a §7.7 (2026-11-06).
- [x] Conteo y quórum solo con miembros, en la AppView (§7.7), 2026-11-06. El
      quórum es `assemblyQuorumTarget`, con tope en el electorado.
- [ ] Cliente PARA: votar con la identidad miembro y avisar antes (§7.7).
- [x] Lectura en vivo (§7.6) en la AppView y el lexicon, 2026-11-07.
- [ ] Cliente PARA: leer `state` en presente y los textos de §7.6 en
      `derivePolicyConsensusState`.
- [ ] Una versión después: quitar `official`, `certified` y los valores
      viejos de `state` del lexicon.
- [x] Quitar el 0 de las boletas de política (§7.5), 2026-11-06, salvo el
      cliente PARA.
- [ ] Cliente PARA: quitar el 0 de `POLICY_SIGNALS` y `VoteComposer` (§7.5).
- [ ] Lexicon: `seq` y `budgetScope` opcionales en `com.para.civic.vote`.
      Luego `pnpm lex:update-local`.
- [ ] m8: `seq` en `civic_vote_nullifiers`, tabla `civic_vote_budget`, MAC v2,
      emisión con boleta anterior, retiro y consulta del presupuesto. Pruebas:
      gastar de más, volver a publicar una boleta vieja, dos emisiones
      concurrentes, cambio de identidad, retiro en una política borrada e
      idempotencia.
- [ ] `@atproto/common`: v2 en `verifyPublicBallotProof` y el rechazo de v1
      nuevas en `ballotWritePolicyRefusal`, con pruebas que fijen los textos
      igual que `ballot-freeze.test.ts`.
- [ ] AppView: columna `seq` en `para_policy_vote` con upsert solo si el `seq`
      es mayor; rechazo de `budgetScope` ajeno; consulta pública de una boleta
      por nullifier.
- [ ] dev-env: `devPolicyVoteProof` en v2 y un reparto por partido en
      `para-policies.ts` que respete los 30 créditos por comunidad.
- [ ] Cliente PARA: OD-9 §4b, el costo y el saldo de créditos en
      `PolicyBallotControl`, y la vista de dónde están mis créditos (§4d).
- [ ] PARA: reescribir `revocable-mandates-spec.md` §4.1 y ajustar §5 (§5a).
- [ ] Agendarlo contra [QUARTER_PLAN_2026Q4.md](./QUARTER_PLAN_2026Q4.md):
      hoy no está en la cola del piloto. Se parece al libro de gasto de G2
      ([GOVERNANCE-G1-EXECUTION.md](./GOVERNANCE-G1-EXECUTION.md)), y conviene
      decidir si es la misma pieza.
