import esbuild from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';

const notices = (await Promise.all(['LICENSE', 'THIRD-PARTY-NOTICES.md'].map(file => readFile(file, 'utf8'))))
  .join('\n\n').replace(/\r\n/g, '\n');

const context = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: ['obsidian', '@codemirror/state', '@codemirror/view', '@codemirror/language',
    '@codemirror/commands', '@codemirror/search', '@lezer/highlight'],
  format: 'cjs',
  platform: 'browser',
  target: 'es2020',
  minify: true,
  legalComments: 'eof',
  banner: { js: `/*!\n${notices}\n*/` },
  outfile: 'main.js',
  metafile: true,
});
if (process.argv.includes('--watch')) await context.watch();
else {
  const result = await context.rebuild();
  await writeFile('build-meta.json', JSON.stringify(result.metafile, null, 2));
  await context.dispose();
}
