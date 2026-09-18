// Custom Jest resolver for ESM-only packages.
//
// Node 22 cannot require() a package whose export map exposes no `require`
// condition (e.g. `multiformats/cid`), so Jest's default resolver rejects
// them. When the default resolution fails, read the package's export map and
// return its `import`/`node`/`default` target directly. Returning the ESM
// file is safe here because @swc/jest transforms everything (including
// node_modules) to CommonJS for the test run.
const { existsSync, readFileSync } = require('node:fs')
const path = require('node:path')

module.exports = function esmExportsResolver(specifier, options) {
  try {
    return options.defaultResolver(specifier, options)
  } catch (err) {
    const resolved = resolveThroughExportMap(specifier, options)
    if (resolved) return resolved
    throw err
  }
}

function resolveThroughExportMap(specifier, options) {
  const parts = specifier.split('/')
  const pkgName = specifier.startsWith('@')
    ? `${parts[0]}/${parts[1]}`
    : parts[0]
  if (!pkgName) return null
  const subpath = specifier.slice(pkgName.length + 1)
  const wanted = subpath ? `./${subpath}` : '.'

  const baseDir = options.basedir ?? options.rootDir ?? process.cwd()
  let dir = path.resolve(baseDir)
  for (;;) {
    const pkgDir = path.join(dir, 'node_modules', pkgName)
    if (existsSync(pkgDir)) {
      const target = pickExportTarget(pkgDir, wanted)
      return target ? path.resolve(pkgDir, target) : null
    }
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

function pickExportTarget(pkgDir, wanted) {
  let pkg
  try {
    pkg = JSON.parse(readFileSync(path.join(pkgDir, 'package.json'), 'utf8'))
  } catch {
    return null
  }
  const exports = pkg.exports
  if (!exports) return null
  const entry =
    typeof exports === 'string'
      ? wanted === '.'
        ? exports
        : null
      : exports[wanted]
  if (!entry) return null
  if (typeof entry === 'string') return entry
  return entry.import ?? entry.node ?? entry.default ?? null
}
