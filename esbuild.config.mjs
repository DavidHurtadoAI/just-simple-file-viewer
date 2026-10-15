import esbuild from 'esbuild';

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
  outfile: 'main.js',
  metafile: true,
});
if (process.argv.includes('--watch')) await context.watch();
else {
  const result = await context.rebuild();
  const { writeFile } = await import('node:fs/promises');
  await writeFile('build-meta.json', JSON.stringify(result.metafile, null, 2));
  await context.dispose();
}
