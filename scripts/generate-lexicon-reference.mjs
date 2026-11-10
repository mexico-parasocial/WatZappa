#!/usr/bin/env node
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { argv, stdout } from 'node:process'
import { fileURLToPath } from 'node:url'
import { format } from 'prettier'

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const sourceRoot = join(repoRoot, 'lexicons/com/para')
const outputPath = join(repoRoot, 'docs/LEXICONS.md')

async function collectSchemas(directory) {
  const schemas = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      schemas.push(...(await collectSchemas(path)))
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      const schema = JSON.parse(await readFile(path, 'utf8'))
      if (!schema.id?.startsWith('com.para.') || !schema.defs) {
        throw new Error(`Invalid PARA schema: ${path}`)
      }
      schemas.push({ path, schema })
    }
  }
  return schemas
}

function tableText(value) {
  return value.replaceAll('|', '\\|').replace(/\s+/g, ' ').trim()
}

const args = argv.slice(2)
if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) {
  throw new Error(
    'Usage: node scripts/generate-lexicon-reference.mjs [--check]',
  )
}

const schemas = await collectSchemas(sourceRoot)
schemas.sort((a, b) =>
  a.schema.id < b.schema.id ? -1 : a.schema.id > b.schema.id ? 1 : 0,
)
const ids = new Set()
const groups = new Map()
for (const entry of schemas) {
  if (ids.has(entry.schema.id))
    throw new Error(`Duplicate NSID: ${entry.schema.id}`)
  ids.add(entry.schema.id)
  const parts = entry.schema.id.split('.')
  const family = parts.length === 3 ? 'root' : parts[2]
  if (!groups.has(family)) groups.set(family, [])
  groups.get(family).push(entry)
}

const lines = [
  '# PARA lexicon catalog',
  '',
  '**Scope: shared contracts for the TypeScript services and the native Rust PARA fork.**',
  `This catalog covers all ${schemas.length} schemas in [lexicons/com/para](../lexicons/com/para).`,
  'Each link opens the canonical JSON, including every definition, field, constraint,',
  'error and reference. Generated client types come from those files; this catalog',
  'does not duplicate the schema bodies.',
  '',
  'A schema defines a contract, not a guarantee that a particular server implements',
  'or enables it. Deprecated records and experimental endpoints remain listed for',
  'compatibility. Read [governance policy](GOVERNANCE.md),',
  '[personal-data boundaries](PERSONAL_CIVIC_TREE.md) and',
  '[VLPDS compatibility](VLPDS.md) before enabling writes.',
  '',
  '## Maintaining the catalog',
  '',
  '```sh',
  'node scripts/generate-lexicon-reference.mjs',
  'node scripts/generate-lexicon-reference.mjs --check',
  '```',
  '',
  'Run `pnpm codegen` separately after changing JSON schemas. The generator uses',
  'the workspace Prettier dependency and resolves paths from its own location.',
  'Install workspace dependencies with `pnpm install` first. It replaces this',
  'file deterministically; edit the JSON or generator rather than this catalog.',
  '',
  '## Families',
  '',
  '| Family | Schemas |',
  '| --- | --- |',
]
for (const [family, entries] of groups) {
  lines.push(`| [${family}](#${family}) | ${entries.length} |`)
}
for (const [family, entries] of groups) {
  lines.push(
    '',
    `## ${family}`,
    '',
    '| Contract / source | Kind | Description |',
    '| --- | --- | --- |',
  )
  for (const { path, schema } of entries) {
    const main = schema.defs.main
    const kind = main?.type ?? 'definitions'
    const description =
      main?.description ??
      'Reusable definitions; see the JSON for individual types.'
    const link = relative(dirname(outputPath), path).split('\\').join('/')
    lines.push(
      `| [${schema.id}](${link}) | ${kind} | ${tableText(description)} |`,
    )
  }
}
const output = await format(`${lines.join('\n')}\n`, { parser: 'markdown' })
if (args[0] === '--check') {
  const current = await readFile(outputPath, 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  if (current !== output) {
    throw new Error(
      'Lexicon catalog is stale; run node scripts/generate-lexicon-reference.mjs',
    )
  }
} else {
  await writeFile(outputPath, output)
}
stdout.write(
  `${schemas.length} PARA schemas: catalog ${args[0] === '--check' ? 'verified' : 'generated'}\n`,
)
