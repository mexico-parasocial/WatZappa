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

const files = getFiles('packages/bsky')

let updated = 0;
for (const file of files) {
  let content = fs.readFileSync(file, 'utf8')
  let changed = false;

  if (content.includes('jest.')) {
    content = content.replace(/jest\./g, 'vi.')
    changed = true;
  }
  
  if (content.includes('jest-extended')) {
    // maybe need something?
  }

  // Handle mockResolvedValue vs mockResolvedValueOnce etc
  // Mostly vi has the same API as jest.

  if (changed) {
    // Add import { vi } from 'vitest' if not present
    if (!content.includes(`import { vi } from 'vitest'`)) {
      content = `import { vi } from 'vitest'\n` + content;
    }
    fs.writeFileSync(file, content, 'utf8')
    updated++;
  }
}

console.log(`Updated ${updated} bsky files for vitest`);
