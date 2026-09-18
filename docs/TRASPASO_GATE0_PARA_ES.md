# Plan de traspaso: Gate 0 — hacer la rama compilable y verificable

Fecha: 18 de septiembre de 2026.

## Encargo para el siguiente agente

La rama `codex/permissioned-data-port` ya **compila limpia desde su propio
árbol** por primera vez. Falta un único bloqueo para poder ejecutar las pruebas:
la configuración de Jest del monorepo no puede cargar dependencias ESM. Ese
bloqueo **no lo introdujo esta rama**: existe igual en `main`.

Tu encargo es cerrar Gate 0: dejar las suites ejecutándose y publicar conteos
reales. No habilites rutas, no despliegues, no hagas merge a main.

**Lo más importante de este traspaso:** hasta hoy, las cifras de pruebas que
aparecen en `PERMISSIONED_DATA_PORT.md` («184 pruebas en doce suites») **no son
reproducibles** y no deben citarse como evidencia hasta que vuelvan a correr.
Se produjeron contra un overlay de dependencias que ya no existe.

## Punto de partida y restricciones

- Directorio: `/Users/mlv/Desktop/Home/WatZappa-permissioned-data`.
- Rama: `codex/permissioned-data-port`. Main está en
  `/Users/mlv/Desktop/Home/WatZappa`; tiene cambios ajenos sin commit.
- Node **22** (`.nvmrc`). No subir a 24: es una decisión explícita del usuario y
  coincide con main.
- pnpm 11.11.0. Usa `/Users/mlv/.nvm/versions/node/v22.22.1/bin` en el PATH.
- Nada está commiteado. Todo el trabajo descrito abajo está en el working tree.
- No hagas merges ni copias masivas desde upstream. Integra archivo por archivo.
- Lee `AGENTS.md`, `STYLE_GUIDE.md` y los `AGENTS.md` de los módulos afectados.

## Qué se corrigió y no debe rehacerse

### 1. El árbol de dependencias ya no es el de main

`node_modules` era un **symlink al checkout de main** (igual en `packages/pds` y
`packages/bsky`), más tres directorios de overlay hechos a mano que apuntaban al
store `.pnpm` de main. La rama se estaba type-checkeando contra los `dist`
precompilados de main, no contra su propio código: por eso nada de lo que
afirmaba estaba realmente verificado.

Los symlinks se eliminaron y se hizo una instalación propia. El árbol de main
(1.5 GB) quedó intacto y verificado.

### 2. El lockfile estaba editado a mano

`pnpm install --frozen-lockfile` falla contra el lockfile original: contiene una
entrada `packages/common → varint` que no declara ningún `package.json` y que no
existe en el lockfile de main, más un `packages/repo → varint` que el refactor
de CAR debió eliminar. Se regeneró. El diff son 7 líneas.

**Efecto secundario pendiente de decisión:** la regeneración movió la cadena de
peers de vitest en `packages/space` de **vite 6.4.3 a vite 8.2.2**. Nadie lo
pidió. Recomendación: fijarlo de vuelta a 6.x salvo que se decida lo contrario.

### 3. La rama no compilaba — 42 errores en 9 paquetes

Causa raíz única: el commit `7695dc324` («adopt @atproto/car») añadió
`@atproto/car` a los `package.json` de `packages/repo` y `packages/space`, pero
**no añadió las referencias de proyecto de TypeScript**. Sin ellas,
`export * from '@atproto/car'` en `packages/repo/src/index.ts` no resolvía nada,
y `readCar`, `readCarWithRoot`, `BlockMap` y `blocksToCarFile` desaparecían de
la superficie pública de `@atproto/repo`, rompiendo pds, bsky, sync,
lex-resolver y lexicon-resolver.

Se añadió `{ "path": "../car/tsconfig.build.json" }` a
`packages/repo/tsconfig.build.json` y `packages/space/tsconfig.build.json`.
Auditado: no faltaba ninguna otra referencia `car`/`space`.

### 4. Un error de tipos en el trabajo sin commitear de `putMember`

`packages/pds/src/actor-store/space/transactor.ts`: `access.read ? 1 : 0` se
ensancha a `number` dentro de un object literal mutable, perdiendo el literal
`0 | 1` que exige la columna. Se anotaron las dos constantes.

**Resultado: `pnpm run build` termina con 0 errores.** Se verificó además en
runtime que `@atproto/repo` vuelve a exportar las nueve funciones CAR, y que
`verifyIncomingCarBlocks` y `readCarReader` siguen ausentes (correcto: el
refactor los retiró a propósito y nadie en el monorepo los usa).

### 5. Numeración de migraciones fuera del rango de upstream

Estaban en `003/004/005-para-policy*`, pisando la secuencia de upstream, que ya
usa `003-space-access`. Ahora:

| clave | archivo | dueño |
| --- | --- | --- |
| `001` | `001-init.ts` | upstream |
| `002` | `002-space.ts` | upstream |
| `003` | `003-space-access.ts` | upstream |
| `900-para-policy` | `900-para-policy.ts` | PARA |
| `901-para-policy-fault` | `901-para-policy-fault.ts` | PARA |
| `902-para-policy-checkpoint` | `902-para-policy-checkpoint.ts` | PARA |

Los nombres de archivo 001–003 ahora coinciden byte a byte con upstream. Se
verificó antes de reordenar que `para_space_policy_*` y
`space*`/`simplespace_*` son disjuntas, así que ejecutar las de PARA después es
seguro. Se actualizaron las dos pruebas que fijaban claves como literales.

**Consecuencia operativa:** cualquier base de datos **de desarrollo** que ya
corrió `003`–`006` fallará el chequeo de migraciones corruptas de Kysely y hay
que recrearla. Producción no se ve afectada: los actor stores de main sólo
corrieron `001`.

**No resuelto a propósito:** `account-manager` tiene el mismo choque (upstream
va en `007`, PARA ya usa `008`–`011`). Esa divergencia es de main y es anterior
a esta rama; corregirla aquí metería un cambio ajeno en el port.

### 6. Correcciones de documentación

- Se retiró la afirmación de que `packages/space` es byte-idéntico a upstream:
  difiere en 4 archivos contra el ref fijado `89deb9fac` y en 10 contra
  `907f41a7b`. Los **lexicons sí** son byte-idénticos a `907f41a7b`, incluido el
  `putMember` sin trackear.
- Se actualizaron las referencias a migraciones `004`/`005` en
  `PERMISSIONED_DATA_PORT.md` y en el changeset.

## El bloqueo que queda: Jest no puede cargar ESM

Diagnóstico completo, para que no se repita el trabajo:

1. Las suites fallan con `Cannot find module 'multiformats/cid'` desde
   `packages/lex/lex-data/dist/cid.js`.
2. **No es un problema de hoisting ni de instalación.** `multiformats` declara
   `exports["./cid"]` con sólo `types` e `import` — **sin condición `require`**.
   Node puro falla igual: `require.resolve('multiformats/cid')` devuelve
   `ERR_PACKAGE_PATH_NOT_EXPORTED`.
3. Añadir `testEnvironmentOptions.customExportConditions = ['node','import',
   'default']` **sí resuelve el módulo**, pero entonces Jest falla al parsearlo:
   el archivo es ESM y `@swc/jest` está configurado con `module: { type: 'es6' }`
   mientras Jest corre en CJS.
4. Es **anterior a esta rama y afecta a main**: una prueba sin modificar
   respecto de main (`packages/pds/tests/file-uploads.test.ts`) falla igual
   (`Cannot find module 'uint8arrays'`).

Se probaron y **se revirtieron** dos intentos, para no dejar experimentos a
medias en el árbol: `nodeLinker: hoisted` en `pnpm-workspace.yaml` (era un
diagnóstico equivocado y dejaba la instalación colgada reintentando binarios de
otras plataformas) y el `customExportConditions` de prueba. Ambos archivos están
idénticos a su versión commiteada.

**Hallazgo colateral que sigue siendo real y sin corregir:** `.npmrc` fija
`node-linker=hoisted` con un comentario que explica por qué hace falta, pero
pnpm 11 **ya no lee esa clave de `.npmrc`** (`pnpm config get node-linker`
devuelve `undefined`); la espera como `nodeLinker` en `pnpm-workspace.yaml`. La
intención documentada lleva tiempo sin aplicarse, también en main. Decidir qué
hacer con esto es de main, no de esta rama.

## Estado real de las pruebas, hoy

| suite | estado |
| --- | --- |
| `para-policy-resolver` | **16/16 pasan** |
| `para-policy-storage` | no carga (ESM) |
| `para-policy-intake` | no carga (ESM) |
| `para-policy-checkpoint` | no carga (ESM) |
| `space-storage` | no carga (ESM) |
| `space-blob-privacy` | no ejecutada |
| `m8-assurance-verifier` | no carga (ESM) |
| `m8-assurance-store` | no carga (ESM) |
| `client-attestation` | no carga (ESM) |
| outbox / publisher / checkpoint-recovery (bsky) | no ejecutadas (requieren Postgres) |

`para-policy-resolver` pasa porque es puro y no importa `lex-data`.

## Secuencia sugerida

1. **Desbloquear Jest.** Opciones, en orden de preferencia: (a) cambiar el
   target de `@swc/jest` a `commonjs` para las pruebas y añadir
   `customExportConditions`; (b) migrar las suites a Jest ESM con
   `--experimental-vm-modules`; (c) `moduleNameMapper` apuntando los subpaths de
   `multiformats` a sus archivos. La opción (a) es la de menor alcance; la (c)
   es la más frágil. Es un cambio de infraestructura de todo el repo:
   **consúltalo antes de aplicarlo**, y hazlo idealmente en main, no aquí.
2. **Correr las doce suites y publicar conteos reales**, reemplazando las cifras
   de `PERMISSIONED_DATA_PORT.md`. Las de bsky necesitan Postgres local.
3. **Decidir sobre vite 6 vs 8** en `packages/space`.
4. **Recrear las bases de datos de desarrollo** afectadas por la renumeración.
5. Sólo entonces, Gate 1 (contratos externos: M8, digest del publisher,
   frontera de autorización de gobernanza).

## Archivos que debes revisar

- `docs/PERMISSIONED_DATA_PORT.md` — estado y puertas del port.
- `docs/OD-P4-DEVICE-ASSURANCE.md` — propuesta nueva, abierta, sin decidir.
- `packages/pds/src/actor-store/db/migrations/index.ts` — banda reservada 900+.
- `packages/repo/tsconfig.build.json`, `packages/space/tsconfig.build.json`.
- `packages/pds/src/actor-store/space/transactor.ts` — `putMember` sin commitear.
- `packages/pds/jest.config.cjs` y `jest.config.cjs` — el bloqueo.

## Definición de terminado para Gate 0

- `pnpm install --frozen-lockfile` pasa desde cero.
- `pnpm run build` pasa con 0 errores. **(ya se cumple)**
- Las doce suites corren y sus conteos están publicados en el doc.
- Ninguna ruta habilitada, ningún cambio en autorización de Matrix, sin merge.
