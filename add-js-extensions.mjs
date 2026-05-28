import fs from 'fs'
import path from 'path'

function getFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const res = path.resolve(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(getFiles(res));
    } else {
      files.push(res);
    }
  }
  return files;
}

const allFiles = getFiles('packages')
const files = allFiles
  .filter(f => f.match(/\.(ts|tsx|js|jsx)$/))
  .filter(f => f.includes('/src/') || f.includes('/tests/'))

let changedFiles = 0

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8')
  
  // Replace `import ... from '...'` and `export ... from '...'`
  let newContent = content.replace(
    /(import|export)\s+([\s\S]*?)\s*from\s+(['"])(\.\.?\/?[^'"]*)(['"])/g,
    (match, action, bindings, quote1, importPath, quote2) => {
      return transformMatch(file, match, action + ' ' + bindings + ' from ' + quote1, importPath, quote2)
    }
  )

  // Replace `import '...'` (side-effect import)
  newContent = newContent.replace(
    /import\s+(['"])(\.\.?\/?[^'"]*)(['"])/g,
    (match, quote1, importPath, quote2) => {
      // Don't match `import {` etc which could happen if regex is too greedy, but `import '...'` doesn't have bindings
      if (importPath.includes('{') || importPath.includes('}')) return match
      return transformMatch(file, match, 'import ' + quote1, importPath, quote2)
    }
  )

  // Replace `import('...')` (dynamic import)
  newContent = newContent.replace(
    /import\s*\(\s*(['"])(\.\.?\/?[^'"]*)(['"])\s*\)/g,
    (match, quote1, importPath, quote2) => {
      return transformMatch(file, match, 'import(' + quote1, importPath, quote2 + ')')
    }
  )

  if (content !== newContent) {
    fs.writeFileSync(file, newContent, 'utf8')
    changedFiles++
    console.log(`Updated ${file}`)
  }
}

console.log(`Updated ${changedFiles} files with .js extensions`)

function transformMatch(file, match, prefix, importPath, suffix) {
  if (importPath.endsWith('.js') || importPath.endsWith('.ts') || importPath.endsWith('.tsx') || importPath.endsWith('.jsx') || importPath.endsWith('.json') || importPath.endsWith('.cjs') || importPath.endsWith('.mjs') || importPath.endsWith('.css')) {
    return match
  }
  if (!importPath.startsWith('.')) {
    return match
  }
  
  const absoluteDir = path.dirname(file)
  const absoluteImportPath = path.resolve(absoluteDir, importPath)
  
  let newImportPath = importPath
  if (importPath === '.' || importPath === '..') {
    newImportPath = importPath === '.' ? './index.js' : '../index.js'
  } else {
    try {
      const stat = fs.statSync(absoluteImportPath)
      if (stat.isDirectory()) {
         // Check if there is a package.json with exports, or just index.ts
         newImportPath = importPath + '/index.js'
      } else {
         newImportPath = importPath + '.js'
      }
    } catch (e) {
      // If the exact path doesn't exist as a directory, it's a file
      newImportPath = importPath + '.js'
    }
  }
  
  return prefix + newImportPath + suffix
}
