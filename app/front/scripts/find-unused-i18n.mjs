import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(scriptDir, '../src');
const i18nPath = path.join(srcRoot, 'i18n.ts');
const content = fs.readFileSync(i18nPath, 'utf8');
const ruMatch = content.match(/ru:\s*\{([\s\S]*?)\n\s*\},\n\s*en:/);
if (!ruMatch) {
  console.error('Could not parse ru dictionary');
  process.exit(1);
}

const keys = [...ruMatch[1].matchAll(/^\s*([A-Za-z][A-Za-z0-9_]*):/gm)].map((match) => match[1]);

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(entryPath, files);
    } else if (/\.(tsx?|css)$/.test(entry.name) && entry.name !== 'i18n.ts') {
      files.push(entryPath);
    }
  }
  return files;
}

const files = walk(srcRoot);
const corpus = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
const unused = [];
const used = [];

for (const key of keys) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`\\bt\\(['"]${escaped}['"]`, 'g'),
    new RegExp(`['"]${escaped}['"]`, 'g'),
  ];
  const hit = patterns.some((pattern) => pattern.test(corpus));
  if (hit) {
    used.push(key);
  } else {
    unused.push(key);
  }
}

console.log(`TOTAL ${keys.length}`);
console.log(`USED ${used.length}`);
console.log(`UNUSED ${unused.length}`);
console.log('---UNUSED---');
for (const key of unused) {
  console.log(key);
}
