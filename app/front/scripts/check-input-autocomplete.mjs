/* global URL, console, process */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceRoot = fileURLToPath(new URL('../src', import.meta.url));
const issues = [];

async function collectTsxFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTsxFiles(fullPath)));
      continue;
    }

    if (entry.isFile() && fullPath.endsWith('.tsx')) {
      files.push(fullPath);
    }
  }

  return files;
}

function findInputTags(source) {
  const tags = [];
  let index = 0;

  while (index < source.length) {
    const start = source.indexOf('<input', index);
    if (start === -1) break;

    let cursor = start + '<input'.length;
    let quote = null;
    let braceDepth = 0;

    while (cursor < source.length) {
      const char = source[cursor];
      const previous = source[cursor - 1];

      if (quote) {
        if (char === quote && previous !== '\\') quote = null;
        cursor += 1;
        continue;
      }

      if (char === '"' || char === "'" || char === '`') quote = char;
      if (char === '{') braceDepth += 1;
      if (char === '}') braceDepth = Math.max(0, braceDepth - 1);
      if (char === '>' && braceDepth === 0) {
        tags.push({ start, text: source.slice(start, cursor + 1) });
        cursor += 1;
        break;
      }

      cursor += 1;
    }

    index = cursor;
  }

  return tags;
}

function getLine(source, index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

for (const file of await collectTsxFiles(sourceRoot)) {
  const source = await readFile(file, 'utf8');
  const fileIssues = findInputTags(source).filter(({ text }) => {
    const isFileInput = /\btype\s*=\s*["']file["']/.test(text);
    return !isFileInput && !/\bautoComplete\s*=/.test(text);
  });

  for (const issue of fileIssues) {
    issues.push(`${relative(process.cwd(), file)}:${getLine(source, issue.start)}`);
  }
}

if (issues.length > 0) {
  console.error('Every non-file JSX <input> must declare autoComplete:');
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}
