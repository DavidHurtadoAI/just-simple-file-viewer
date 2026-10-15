import { StreamLanguage, type Language } from '@codemirror/language';
import { javascript, json, typescript } from '@codemirror/legacy-modes/mode/javascript';
import { python } from '@codemirror/legacy-modes/mode/python';
import { css } from '@codemirror/legacy-modes/mode/css';
import { xml } from '@codemirror/legacy-modes/mode/xml';
import { yaml } from '@codemirror/legacy-modes/mode/yaml';
import { toml } from '@codemirror/legacy-modes/mode/toml';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { diff } from '@codemirror/legacy-modes/mode/diff';
import { properties } from '@codemirror/legacy-modes/mode/properties';

// Only parsers are bundled. Obsidian provides the editor, search and history modules.
const specs = [
  { name: 'JSON', extensions: ['json', 'jsonc', 'jsonl', 'ndjson'], parser: json },
  { name: 'JavaScript', extensions: ['js', 'mjs', 'cjs', 'jsx'], parser: javascript },
  { name: 'TypeScript', extensions: ['ts', 'tsx'], parser: typescript },
  { name: 'Python', extensions: ['py', 'pyi', 'python'], parser: python },
  { name: 'CSS', extensions: ['css', 'scss', 'less'], parser: css },
  { name: 'HTML / XML', extensions: ['html', 'htm', 'xml', 'xsl', 'svg'], parser: xml },
  { name: 'YAML', extensions: ['yaml', 'yml'], parser: yaml },
  { name: 'TOML', extensions: ['toml'], parser: toml },
  { name: 'Shell', extensions: ['sh', 'bash', 'zsh'], parser: shell },
  { name: 'Diff', extensions: ['diff', 'patch'], parser: diff },
  { name: 'Properties', extensions: ['ini', 'cfg', 'conf', 'env', 'properties'], parser: properties },
];
const cache = new Map<string, Language>();

export function languageFor(extension: string): { name: string; language?: Language } {
  const spec = specs.find(x => x.extensions.includes(extension));
  if (!spec) return { name: extension === 'csv' || extension === 'tsv' ? extension.toUpperCase() : 'Plain text' };
  let language = cache.get(spec.name);
  if (!language) {
    language = StreamLanguage.define(spec.parser);
    cache.set(spec.name, language);
  }
  return { name: spec.name, language };
}
