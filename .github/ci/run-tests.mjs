#!/usr/bin/env node
// Runs every workspace package's `test` script and gates on the result.
//
// `pnpm --recursive test` stops at the first failing package and only reports
// an exit code, so one known failure hides every package after it. This runs
// all of them, reads each runner's JSON report, and compares the failing test
// files with known-failing-tests.json:
//
//   - a failing file that is not listed fails the run (a new regression);
//   - a listed file that ran and passed fails the run (the list only shrinks:
//     delete the entry in the same change that fixes the test).
//
// Usage: node .github/ci/run-tests.mjs [--only <dir>]... [--skip <dir>]... [flags]
// Unrecognised flags (--shard=1/8, --maxWorkers=1, ...) go to every runner.

import { spawnSync } from 'node:child_process'
import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(import.meta.url), '../../..')
const knownPath = join(root, '.github/ci/known-failing-tests.json')

const only = []
const skip = []
const runnerFlags = []
const args = process.argv.slice(2)
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--only') only.push(args[++i])
  else if (args[i] === '--skip') skip.push(args[++i])
  else runnerFlags.push(args[i])
}

const known = JSON.parse(readFileSync(knownPath, 'utf8'))
delete known.$comment

/** @returns {string[]} workspace package dirs (relative) that define `test` */
function testPackages() {
  // Mirrors pnpm-workspace.yaml: services/*, packages/*, and the three
  // package groups that nest one level deeper.
  const parents = ['services', 'packages']
  const groups = ['packages/lex', 'packages/oauth', 'packages/internal']
  const dirs = []
  for (const parent of [...parents, ...groups]) {
    for (const entry of readdirSync(join(root, parent), {
      withFileTypes: true,
    })) {
      if (!entry.isDirectory()) continue
      const dir = join(parent, entry.name)
      const pkgPath = join(root, dir, 'package.json')
      if (!existsSync(pkgPath)) continue
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
      if (pkg.scripts?.test) dirs.push(dir)
    }
  }
  return dirs.sort()
}

const outDir = mkdtempSync(join(tmpdir(), 'ci-tests-'))
const failed = new Set() // repo-relative test files, or `pkg:<dir>`
const passed = new Set()
let ranAny = false

for (const dir of testPackages()) {
  if (only.length && !only.includes(dir)) continue
  if (skip.includes(dir)) continue
  const pkg = JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8'))
  const report = join(outDir, `${dir.replaceAll('/', '__')}.json`)
  const isJest = /\bjest\b/.test(pkg.scripts.test)
  const reporter = isJest
    ? ['--json', `--outputFile=${report}`]
    : ['--reporter=default', '--reporter=json', `--outputFile.json=${report}`]

  console.log(`\n::group::${dir}`)
  const res = spawnSync(
    'pnpm',
    ['--dir', dir, 'run', 'test', ...reporter, ...runnerFlags],
    {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, LOG_ENABLED: 'false' },
    },
  )
  console.log('::endgroup::')
  ranAny = true

  let files = []
  if (existsSync(report)) {
    try {
      files = JSON.parse(readFileSync(report, 'utf8')).testResults ?? []
    } catch {
      // Truncated report (runner crashed): handled as a package-level failure.
    }
  }
  let sawFailure = false
  for (const file of files) {
    const rel = relative(root, file.name)
    if (file.status === 'failed') {
      failed.add(rel)
      sawFailure = true
    } else {
      passed.add(rel)
    }
  }
  // Non-zero exit with no failing file: the runner never got to the tests
  // (config or setup error, a crash, missing infra).
  if (res.status !== 0 && !sawFailure) failed.add(`pkg:${dir}`)
  else if (res.status === 0 && files.length) passed.add(`pkg:${dir}`)
}

const unexpected = [...failed].filter((f) => !(f in known)).sort()
const stale = Object.keys(known)
  .filter((f) => passed.has(f) && !failed.has(f))
  .sort()
const stillFailing = [...failed].filter((f) => f in known).sort()

const lines = ['## Test gate', '']
lines.push(`Known failures still failing: ${stillFailing.length}`)
for (const f of stillFailing) lines.push(`- \`${f}\` — ${known[f]}`)
if (unexpected.length) {
  lines.push('', `**New failures (${unexpected.length})**`)
  for (const f of unexpected) lines.push(`- \`${f}\``)
}
if (stale.length) {
  lines.push(
    '',
    `**Fixed, remove from known-failing-tests.json (${stale.length})**`,
  )
  for (const f of stale) lines.push(`- \`${f}\``)
}
const summary = lines.join('\n')
console.log(`\n${summary}`)
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`)
}

if (!ranAny) {
  console.error('No test package matched.')
  process.exit(1)
}
process.exit(unexpected.length || stale.length ? 1 : 0)
