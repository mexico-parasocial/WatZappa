#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const profile = process.argv[2]
if (!profile)
  throw new Error('Usage: repair-dev-pds-migrations.mjs <profile directory>')

const db = path.join(profile, 'pds', 'account.sqlite')
if (!fs.existsSync(db)) {
  process.stdout.write('PDS migration check: new account database\n')
  process.exit(0)
}

const migrationDir = path.join(root, 'packages/pds')
const readNames = (file) =>
  [
    ...fs.readFileSync(file, 'utf8').matchAll(/^\s*'(\d{3})': mig\d{3},?$/gm),
  ].map((match) => match[1])
const source = readNames(
  path.join(migrationDir, 'src/account-manager/db/migrations/index.ts'),
)
const compiled = readNames(
  path.join(migrationDir, 'dist/account-manager/db/migrations/index.js'),
)
if (
  source.length === 0 ||
  JSON.stringify(source) !== JSON.stringify(compiled)
) {
  throw new Error('PDS account migrations differ between source and dist')
}

const query = (sql, readonly = true) =>
  execFileSync(
    'sqlite3',
    [...(readonly ? ['-readonly'] : []), '-json', db, sql],
    {
      encoding: 'utf8',
    },
  ).trim()
const applied = () =>
  JSON.parse(query('SELECT name, timestamp FROM kysely_migration'))
    .sort((a, b) =>
      a.timestamp === b.timestamp
        ? a.name.localeCompare(b.name)
        : new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    )
    .map((row) => row.name)
const isPrefix = (names) => names.every((name, index) => source[index] === name)

let executed = applied()
if (!isPrefix(executed)) {
  const migration008 = fs.readFileSync(
    path.join(
      migrationDir,
      'src/account-manager/db/migrations/008-account-email-auth-factor.ts',
    ),
  )
  const expected008Hash =
    '30f454c58298a1fd97160be90d4feb5b7b16c4c5df69944adc69ca9ce56c995e'
  const knownGap =
    source.includes('008') &&
    createHash('sha256').update(migration008).digest('hex') ===
      expected008Hash &&
    JSON.stringify(executed) ===
      JSON.stringify([
        '001',
        '002',
        '003',
        '004',
        '005',
        '006',
        '007',
        '009',
        '010',
      ]) &&
    query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='account_email_auth_factor'",
    ) === ''
  if (!knownGap) {
    throw new Error(
      `PDS account migration order is incompatible: applied ${executed.join(', ')}, available ${source.join(', ')}`,
    )
  }

  const backupDir = path.join(profile, 'backups')
  fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 })
  const backup = path.join(
    backupDir,
    `account-before-008-${new Date().toISOString().replaceAll(/[:.]/g, '-')}.sqlite`,
  )
  execFileSync('sqlite3', [db, `VACUUM INTO '${backup.replaceAll("'", "''")}'`])
  fs.chmodSync(backup, 0o600)

  query(
    `BEGIN IMMEDIATE;
     CREATE TABLE account_email_auth_factor (
       did varchar PRIMARY KEY,
       emailAuthFactorEnabledAt varchar NOT NULL
     );
     INSERT INTO kysely_migration (name, timestamp)
       SELECT '008', timestamp FROM kysely_migration WHERE name = '009';
     COMMIT;`,
    false,
  )
  executed = applied()
  if (!isPrefix(executed)) {
    throw new Error(
      'PDS account migration repair did not restore the expected order',
    )
  }
  process.stdout.write(`PDS migration 008 repaired; backup: ${backup}\n`)
}
process.stdout.write(
  `PDS migration check: ${executed.length} applied, ${source.length} available\n`,
)
