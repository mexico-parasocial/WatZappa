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
      if (entry.name === 'package.json') files.push(res);
    }
  }
  return files;
}

const files = getFiles('packages')

let updated = 0;
for (const file of files) {
  const content = fs.readFileSync(file, 'utf8')
  const json = JSON.parse(content)
  
  let changed = false;
  if (json.devDependencies) {
    if (json.devDependencies['jest']) {
      json.devDependencies['jest'] = '^30.0.0'
      changed = true
    }
    if (json.devDependencies['ts-jest']) {
      json.devDependencies['ts-jest'] = '^30.0.0'
      changed = true
    }
    if (json.devDependencies['@types/jest']) {
      json.devDependencies['@types/jest'] = '^30.0.0'
      changed = true
    }
    if (json.devDependencies['@jest/globals']) {
      json.devDependencies['@jest/globals'] = '^30.0.0'
      changed = true
    } else if (json.devDependencies['jest']) {
      json.devDependencies['@jest/globals'] = '^30.0.0'
      changed = true
    }
  }

  if (changed) {
    fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n')
    updated++;
  }
}

console.log(`Updated ${updated} package.json files`);
