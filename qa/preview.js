(async () => {
  if (!app.vault.adapter.basePath.replaceAll('\\', '/').endsWith('/qa/.vault')) throw Error('Use the isolated QA vault');
  const plugin = app.plugins.plugins['just-simple-file-viewer'];
  for (const view of plugin.views) await view.leaf.setViewState({ type: 'empty' });
  const source = JSON.stringify({
    plugin: 'Just Simple File Viewer',
    purpose: 'Read and edit text files inside Obsidian',
    minimal: true,
    editor: 'CodeMirror, already built into Obsidian',
    files: ['JSON', 'CSV', 'Python', 'TXT', 'and more'],
    features: { syntaxHighlighting: true, findAndReplace: true, automaticSaving: true },
    localOnly: true,
    answer: 42,
  }, null, 2) + '\n';
  const file = app.vault.getFileByPath('Example.json') ?? await app.vault.create('Example.json', source);
  await plugin.openAsText(file);
  const active = plugin.views.find(view => view.file === file).leaf;
  const leaves = [];
  app.workspace.iterateAllLeaves(leaf => leaves.push(leaf));
  for (const leaf of leaves) if (leaf !== active && leaf.getRoot() === app.workspace.rootSplit) leaf.detach();
  app.workspace.leftSplit.collapse();
  app.workspace.rightSplit.collapse();
  document.querySelectorAll('.notice').forEach(el => el.remove());
  await new Promise(resolve => setTimeout(resolve, 200));
  const bounds = active.view.containerEl.getBoundingClientRect();
  return { file: file.path, version: plugin.manifest.version,
    screenshotClip: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, scale: 1 } };
})()
