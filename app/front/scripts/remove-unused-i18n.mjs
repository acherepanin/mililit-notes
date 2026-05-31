import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(scriptDir, '../src');
const i18nPath = path.join(srcRoot, 'i18n.ts');

function extractKeys(block) {
  return [...block.matchAll(/^\s*([A-Za-z][A-Za-z0-9_]*):/gm)].map((match) => match[1]);
}

function findUnusedKeys() {
  const content = fs.readFileSync(i18nPath, 'utf8');
  const ruMatch = content.match(/ru:\s*\{([\s\S]*?)\n\s*\},\n\s*en:/);
  if (!ruMatch) {
    throw new Error('Could not parse ru dictionary');
  }

  const keys = extractKeys(ruMatch[1]);
  const files = [];

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
      } else if (/\.(tsx?|css)$/.test(entry.name) && entry.name !== 'i18n.ts') {
        files.push(entryPath);
      }
    }
  }

  walk(srcRoot);
  const corpus = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  const unused = [];

  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
      new RegExp(`\\bt\\(['"]${escaped}['"]`, 'g'),
      new RegExp(`['"]${escaped}['"]`, 'g'),
    ];
    if (!patterns.some((pattern) => pattern.test(corpus))) {
      unused.push(key);
    }
  }

  return unused;
}

function removeKeysFromDictionary(content, dictionaryName, keysToRemove) {
  const startMarker = `${dictionaryName}: {`;
  const startIndex = content.indexOf(startMarker);
  if (startIndex < 0) {
    throw new Error(`Dictionary ${dictionaryName} not found`);
  }

  const nextDictionaryIndex = content.indexOf('\n  en:', startIndex + startMarker.length);
  const endIndex =
    dictionaryName === 'ru'
      ? nextDictionaryIndex
      : content.indexOf('\n} as const', startIndex + startMarker.length);

  const before = content.slice(0, startIndex + startMarker.length);
  const block = content.slice(startIndex + startMarker.length, endIndex);
  const after = content.slice(endIndex);

  let nextBlock = block;
  for (const key of keysToRemove) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const singleLine = new RegExp(`\\n\\s*${escaped}:\\s*'(?:\\\\'|[^'])*',`, 'g');
    const multiLine = new RegExp(`\\n\\s*${escaped}:\\s*\\n\\s*'(?:\\\\'|[^'])*',`, 'g');
    const template = new RegExp(`\\n\\s*${escaped}:\\s*'(?:\\\\'|[^'])*\\{[^}]*\\}(?:\\\\'|[^'])*',`, 'g');
    nextBlock = nextBlock
      .replace(template, '')
      .replace(multiLine, '')
      .replace(singleLine, '');
  }

  return `${before}${nextBlock}${after}`;
}

const unusedKeys = findUnusedKeys();
console.log(`Removing ${unusedKeys.length} unused keys`);
let content = fs.readFileSync(i18nPath, 'utf8');
content = removeKeysFromDictionary(content, 'ru', unusedKeys);
content = removeKeysFromDictionary(content, 'en', unusedKeys);
fs.writeFileSync(i18nPath, content, 'utf8');
console.log('Updated i18n.ts');
