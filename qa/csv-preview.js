(async () => {
  if (!app.vault.adapter.basePath.replaceAll('\\', '/').endsWith('/qa/.vault')) throw Error('Use the isolated QA vault');
  const p = app.plugins.plugins['just-simple-file-viewer'];
  const source = 'Name,City,Role,Notes\nDavid,Madrid,Author,"Simple text files, inside Obsidian"\nAna,Málaga,Editor,"CSV stays CSV — edit the source when needed"\nLuis,Valencia,Developer,"No spreadsheet engine or extra dependencies"\nSara,Bilbao,Designer,"Native Markdown table styles"\n';
  const file = app.vault.getFileByPath('Example.csv') ?? await app.vault.create('Example.csv', source);
  await p.openAsText(file);
  const v = p.views.find(view => view.file === file);
  v.setCsvView('table');
  const active = v.leaf;
  const leaves = [];
  app.workspace.iterateAllLeaves(leaf => leaves.push(leaf));
  for (const leaf of leaves) if (leaf !== active && leaf.getRoot() === app.workspace.rootSplit) leaf.detach();
  app.workspace.leftSplit.collapse();
  app.workspace.rightSplit.collapse();
  document.querySelectorAll('.notice').forEach(el => el.remove());
  await new Promise(resolve => setTimeout(resolve, 200));
  const bounds = v.containerEl.getBoundingClientRect();
  const table = v.tableHost.querySelector('table');
  return { file: file.path, version: p.manifest.version, bounds: table.getBoundingClientRect().toJSON(),
    headerBorder: getComputedStyle(table.querySelector('th')).borderBottomWidth,
    screenshotClip: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, scale: 1 } };
})()
