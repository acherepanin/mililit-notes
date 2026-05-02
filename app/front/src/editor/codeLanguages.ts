import type { TranslationKey } from '../i18n';

export const autoCodeLanguage = 'auto';

export type CodeLanguage =
  | 'auto'
  | 'plaintext'
  | 'json'
  | 'javascript'
  | 'typescript'
  | 'xml'
  | 'css'
  | 'scss'
  | 'bash'
  | 'shell'
  | 'markdown'
  | 'yaml'
  | 'sql'
  | 'python'
  | 'java'
  | 'csharp'
  | 'cpp'
  | 'go'
  | 'rust'
  | 'php'
  | 'ruby'
  | 'kotlin'
  | 'swift'
  | 'dart'
  | 'dockerfile'
  | 'nginx'
  | 'graphql'
  | 'ini'
  | 'toml'
  | 'diff';

export const codeLanguages: Array<{ value: CodeLanguage; labelKey: TranslationKey }> = [
  { value: autoCodeLanguage, labelKey: 'autoDetect' },
  { value: 'plaintext', labelKey: 'plainText' },
  { value: 'json', labelKey: 'json' },
  { value: 'javascript', labelKey: 'javascript' },
  { value: 'typescript', labelKey: 'typescript' },
  { value: 'xml', labelKey: 'html' },
  { value: 'css', labelKey: 'css' },
  { value: 'scss', labelKey: 'scss' },
  { value: 'bash', labelKey: 'bash' },
  { value: 'shell', labelKey: 'shell' },
  { value: 'markdown', labelKey: 'markdown' },
  { value: 'yaml', labelKey: 'yaml' },
  { value: 'sql', labelKey: 'sql' },
  { value: 'python', labelKey: 'python' },
  { value: 'java', labelKey: 'java' },
  { value: 'csharp', labelKey: 'csharp' },
  { value: 'cpp', labelKey: 'cpp' },
  { value: 'go', labelKey: 'go' },
  { value: 'rust', labelKey: 'rust' },
  { value: 'php', labelKey: 'php' },
  { value: 'ruby', labelKey: 'ruby' },
  { value: 'kotlin', labelKey: 'kotlin' },
  { value: 'swift', labelKey: 'swift' },
  { value: 'dart', labelKey: 'dart' },
  { value: 'dockerfile', labelKey: 'dockerfile' },
  { value: 'nginx', labelKey: 'nginx' },
  { value: 'graphql', labelKey: 'graphql' },
  { value: 'ini', labelKey: 'ini' },
  { value: 'toml', labelKey: 'toml' },
  { value: 'diff', labelKey: 'diff' },
];

export const knownCodeLanguages = new Set<string>(codeLanguages.map((language) => language.value));
