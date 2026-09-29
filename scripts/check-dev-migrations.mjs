#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrations = path.join(
  root,
  'packages/bsky/src/data-plane/server/db/migrations',
)
const source = readFileSync(path.join(migrations, 'index.ts'), 'utf8')
const compiled = readFileSync(
  path.join(
    root,
    'packages/bsky/dist/data-plane/server/db/migrations/index.js',
  ),
  'utf8',
)
const names = (contents) =>
  [...contents.matchAll(/^export \* as (_\d{8}T\d{9}Z) from /gm)]
    .map((match) => match[1])
    .sort()
const expected = names(source)
const built = names(compiled)
if (
  expected.length === 0 ||
  JSON.stringify(expected) !== JSON.stringify(built)
) {
  throw new Error(
    'AppView compiled migrations differ from source; rebuild packages/bsky',
  )
}

const compose = path.join(root, 'packages/dev-infra/docker-compose.yaml')
const query = (sql) =>
  execFileSync(
    'docker',
    [
      'compose',
      '-f',
      compose,
      'exec',
      '-T',
      'db',
      'psql',
      '-U',
      'pg',
      '-d',
      'postgres',
      '-At',
      '-c',
      sql,
    ],
    { encoding: 'utf8' },
  ).trim()

if (query("SELECT to_regclass('appview_para_local.kysely_migration')") !== '') {
  const applied = query(
    'SELECT name FROM appview_para_local.kysely_migration ORDER BY timestamp',
  )
    .split('\n')
    .filter(Boolean)
  for (const [index, name] of applied.entries()) {
    if (expected[index] !== name) {
      throw new Error(
        `AppView migration order differs at ${index}: database has ${name}, source has ${expected[index] ?? '(none)'}`,
      )
    }
  }
  process.stdout.write(
    `AppView migration check: ${applied.length} applied, ${expected.length} available\n`,
  )
} else {
  process.stdout.write(
    `AppView migration check: fresh schema, ${expected.length} available\n`,
  )
}
