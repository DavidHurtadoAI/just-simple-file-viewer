export const DEFAULT_EXTENSIONS = [
  'txt', 'text', 'log', 'json', 'jsonc', 'jsonl', 'ndjson', 'csv', 'tsv',
  'py', 'pyi', 'python', 'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx',
  'css', 'scss', 'less', 'html', 'htm', 'xml', 'xsl', 'yaml', 'yml',
  'toml', 'ini', 'cfg', 'conf', 'config', 'env', 'properties',
  'sh', 'bash', 'zsh', 'fish', 'ps1', 'psm1', 'bat', 'cmd',
  'sql', 'r', 'rb', 'go', 'rs', 'c', 'h', 'cpp', 'hpp', 'cs',
  'java', 'kt', 'swift', 'php', 'lua', 'dart', 'vue', 'svelte',
  'graphql', 'gql', 'tex', 'bib', 'rst', 'adoc', 'org', 'diff', 'patch',
];

// Keep native Obsidian views and known binary formats out of extension registration.
export const NATIVE_EXTENSIONS = new Set(['md', 'markdown', 'canvas', 'base', 'svg']);
export const BINARY_EXTENSIONS = new Set([
  'pdf', 'doc', 'docx', 'dotx', 'xls', 'xlsx', 'xlsm', 'ppt', 'pptx',
  'odt', 'ods', 'odp', 'pages', 'numbers', 'key', 'rtf',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'ico', 'bmp', 'tif', 'tiff',
  'mp3', 'mp4', 'm4a', 'm4v', 'wav', 'webm', 'ogg', 'flac', 'mov', 'avi',
  'zip', 'gz', 'bz2', 'xz', '7z', 'rar', 'tar', 'exe', 'dll', 'so', 'dylib',
  'woff', 'woff2', 'ttf', 'otf', 'sqlite', 'sqlite3', 'db', 'wasm', 'pyc', 'pyo',
]);
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const HIGHLIGHT_LIMIT = 1024 * 1024;

export function extensionOf(path: string): string {
  const name = path.split('/').pop() ?? path;
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

export function parseExtensions(value: string): string[] {
  return [...new Set(value.toLowerCase().split(/[\s,;]+/).map(x => x.replace(/^\./, ''))
    .filter(x => /^[a-z0-9][a-z0-9_-]*$/.test(x)))];
}

export function assertText(text: string): void {
  // Intentional control-byte detection: tabs, newlines, form feeds and ANSI escapes are text.
  // eslint-disable-next-line no-control-regex -- Binary detection intentionally matches control bytes.
  if (/[\u0000-\u0008\u000b\u000e-\u001a\u001c-\u001f\u007f]/.test(text)) {
    throw new Error('This file contains binary data and cannot be edited as text.');
  }
}

export function decodeText(buffer: ArrayBuffer): string {
  if (buffer.byteLength > MAX_FILE_BYTES) throw new Error('This file exceeds the 20 MB editing limit.');
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer);
  } catch {
    throw new Error('This file is not UTF-8 text. Convert a copy to UTF-8 before editing it.');
  }
  assertText(text);
  return text;
}

export function textFormat(raw: string): { bom: string; eol: string; content: string } {
  const bom = raw.startsWith('\uFEFF') ? '\uFEFF' : '';
  const content = raw.slice(bom.length);
  const eol = content.match(/\r\n|\r|\n/)?.[0] ?? '\n';
  return { bom, eol, content };
}

export class TextConflictError extends Error {
  constructor() { super('The file changed on disk. Reload it or save your edits as a copy.'); }
}

export function checkedUpdate(current: string, base: string, edited: string): string {
  assertText(current);
  if (current !== base && current !== edited) throw new TextConflictError();
  return edited;
}

export function conflictCopyPath(path: string, suffix: string): string {
  const slash = path.lastIndexOf('/');
  const dot = path.lastIndexOf('.');
  const split = dot > slash + 1 ? dot : path.length;
  return `${path.slice(0, split)} (local copy ${suffix})${path.slice(split)}`;
}
