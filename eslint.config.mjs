import obsidianmd from 'eslint-plugin-obsidianmd';
export default [
  ...obsidianmd.configs.recommended,
  {
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      'obsidianmd/ui/sentence-case': ['error', { brands: ['Just Simple File Viewer', 'JSON', 'CSV', 'UTF-8', 'BOM', 'LF', 'CRLF', 'CodeMirror', 'Python', 'JavaScript', 'TypeScript', 'HTML', 'CSS', 'XML', 'YAML', 'TOML', 'SQL'] }],
    },
  },
];
