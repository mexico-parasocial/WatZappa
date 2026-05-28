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
      if (entry.name.endsWith('.ts')) files.push(res);
    }
  }
  return files;
}

const files = getFiles('packages')

let updated = 0;
for (const file of files) {
  let content = fs.readFileSync(file, 'utf8')
  let changed = false;

  if (content.includes('toThrowError(') || content.includes('toThrowError()')) {
    content = content.replace(/\.toThrowError\(/g, '.toThrow(')
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(file, content, 'utf8')
    updated++;
  }
}

console.log(`Updated ${updated} files from toThrowError to toThrow`);
