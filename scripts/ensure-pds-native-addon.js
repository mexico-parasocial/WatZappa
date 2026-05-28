#!/usr/bin/env node
/* eslint-env node */
const { spawnSync } = require('node:child_process')
const { createRequire } = require('node:module')
const path = require('node:path')

const repoRoot = path.resolve(import.meta.dirname, '..')
const pdsRequire = createRequire(
  path.join(repoRoot, 'packages/pds/package.json'),
)

const loadBetterSqlite3 = () => {
  try {
    const Database = pdsRequire('better-sqlite3')
    const db = new Database(':memory:')
    db.close()
    return null
  } catch (error) {
    return error
  }
}

const initialError = loadBetterSqlite3()

if (!initialError) {
  process.exit(0)
}

console.warn(
  `[native-bootstrap] better-sqlite3 failed to load under Node ${process.version} (ABI ${process.versions.modules}). Rebuilding @atproto/pds native addon...`,
)
console.warn(`[native-bootstrap] ${initialError.message}`)

const rebuild = spawnSync(
  'pnpm',
  ['--filter', '@atproto/pds', 'rebuild', 'better-sqlite3'],
  {
    cwd: repoRoot,
    env: process.env,
    stdio: 'inherit',
  },
)

if (rebuild.status !== 0) {
  process.exit(rebuild.status ?? 1)
}

const finalError = loadBetterSqlite3()

if (finalError) {
  console.error(
    `[native-bootstrap] better-sqlite3 is still unavailable after rebuild: ${finalError.message}`,
  )
  process.exit(1)
}

console.log(
  `[native-bootstrap] better-sqlite3 is ready for Node ${process.version} (ABI ${process.versions.modules}).`,
)
