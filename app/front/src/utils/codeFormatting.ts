import type { CodeLanguage } from '../editor/codeLanguages';

const jsLikeLanguages = new Set<CodeLanguage>(['javascript', 'typescript']);
const cssLikeLanguages = new Set<CodeLanguage>(['css', 'scss']);

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n?/g, '\n').trim();
}

function indentBraces(value: string): string {
  const normalized = normalizeLineEndings(value)
    .replace(/\s*([{};])\s*/g, '$1\n')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\n{2,}/g, '\n');
  let depth = 0;

  return normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (line.startsWith('}')) {
        depth = Math.max(0, depth - 1);
      }

      const result = `${'  '.repeat(depth)}${line}`;

      if (line.endsWith('{')) {
        depth += 1;
      }

      return result;
    })
    .join('\n');
}

function formatMarkup(value: string): string {
  const lines = normalizeLineEndings(value)
    .replace(/>\s*</g, '>\n<')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  let depth = 0;

  return lines
    .map((line) => {
      const isClosing = /^<\//.test(line);
      const isSingle =
        /^<[^>]+\/>$/.test(line) ||
        /^<(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)\b/i.test(line);

      if (isClosing) {
        depth = Math.max(0, depth - 1);
      }

      const result = `${'  '.repeat(depth)}${line}`;

      if (!isClosing && !isSingle && /^<[^!?/][^>]*>$/.test(line)) {
        depth += 1;
      }

      return result;
    })
    .join('\n');
}

function formatSql(value: string): string {
  return normalizeLineEndings(value)
    .replace(/\s+/g, ' ')
    .replace(
      /\b(select|from|where|and|or|join|left join|right join|inner join|group by|order by|limit|values|set)\b/gi,
      (match) => `\n${match.toUpperCase()}`,
    )
    .replace(/\n+/g, '\n')
    .trim();
}

export function formatCodeText(value: string, language: string): string {
  const normalizedLanguage = language as CodeLanguage;
  const normalizedValue = normalizeLineEndings(value);

  if (!normalizedValue) {
    return normalizedValue;
  }

  if (normalizedLanguage === 'auto') {
    if (/^[[{]/.test(normalizedValue)) {
      return JSON.stringify(JSON.parse(normalizedValue), null, 2);
    }

    if (/^<[\w!?/]/.test(normalizedValue)) {
      return formatMarkup(normalizedValue);
    }

    if (
      /\b(select|insert|update|delete|from|where|join|group by|order by)\b/i.test(normalizedValue)
    ) {
      return formatSql(normalizedValue);
    }
  }

  if (normalizedLanguage === 'json') {
    return JSON.stringify(JSON.parse(normalizedValue), null, 2);
  }

  if (normalizedLanguage === 'xml') {
    return formatMarkup(normalizedValue);
  }

  if (cssLikeLanguages.has(normalizedLanguage) || jsLikeLanguages.has(normalizedLanguage)) {
    return indentBraces(normalizedValue);
  }

  if (normalizedLanguage === 'sql') {
    return formatSql(normalizedValue);
  }

  return normalizedValue
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n');
}
