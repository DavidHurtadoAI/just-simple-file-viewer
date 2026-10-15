(async () => {
  for (const v of [...app.plugins.plugins['just-simple-file-viewer'].views]) await v.leaf.setViewState({ type: 'empty' });
  await app.plugins.disablePlugin('just-simple-file-viewer');
  await app.plugins.loadManifests();
  await app.plugins.enablePlugin('just-simple-file-viewer');
  return { loaded: !!app.plugins.plugins['just-simple-file-viewer'] };
})()
