(async () => {
  if (!app.plugins.isEnabled()) await app.plugins.setEnable(true);
  await app.plugins.loadManifests();
  await app.plugins.enablePluginAndSave('just-simple-file-viewer');
  return {
    vault: app.vault.getName(),
    loaded: Object.keys(app.plugins.plugins),
    manifests: Object.keys(app.plugins.manifests),
    enabled: [...app.plugins.enabledPlugins],
    state: Object.fromEntries(Object.entries(app.plugins).map(([k,v]) => [k, typeof v === 'boolean' ? v : typeof v])),
    notices: [...document.querySelectorAll('.notice')].map(x => x.textContent),
  };
})()
