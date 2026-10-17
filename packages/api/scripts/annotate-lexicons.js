import { readFile, writeFile } from 'node:fs/promises'

// @NOTE the complete schema dictionary exceeds TypeScript's inferred declaration size limit.
const file = new URL('../src/client/lexicons.ts', import.meta.url)
const source = await readFile(file, 'utf8')
const declaration = 'export const schemaDict: Record<string, LexiconDoc> = {'
if (!source.includes(declaration)) {
  if (!source.includes('export const schemaDict = {'))
    throw new Error('Unexpected generated Lexicon dictionary')
  await writeFile(file, source.replace('export const schemaDict = {', declaration))
}
