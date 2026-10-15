(async () => {
  const p = app.plugins.plugins['just-simple-file-viewer'];
  const checks = [];
  const check = (ok, label) => { if (!ok) throw new Error(label); checks.push(label); };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  // Dismiss the first-open trust prompt in this newly authored test vault.
  [...document.querySelectorAll('.modal button')].find(x => x.textContent.includes('Confiar en el autor'))?.click();
  const path = `race-${Date.now()}.txt`;
  const file = await app.vault.create(path, 'base');
  const leaf = app.workspace.getLeaf('tab');
  await leaf.openFile(file);
  await app.workspace.revealLeaf(leaf);
  const v = leaf.view;
  const originalProcess = app.vault.process;
  let release;
  let entered;
  const enteredPromise = new Promise(r => { entered = r; });
  const gate = new Promise(r => { release = r; });
  try {
    app.vault.process = async function(target, fn, options) {
      if (target === file) { entered(); await gate; }
      return originalProcess.call(this, target, fn, options);
    };
    v.editor.dispatch({ changes: { from: 4, insert: '-first' } });
    const first = v.save();
    await enteredPromise;
    v.editor.dispatch({ changes: { from: v.editor.state.doc.length, insert: '-second' } });
    const second = v.save();
    release();
    await first;
    await second;
    check(await app.vault.read(file) === 'base-first-second', 'Edits during an in-flight save are preserved');
    check(!v.conflicted && !v.isDirty, 'Own writes do not cause false conflicts');
  } finally { release(); app.vault.process = originalProcess; }
  v.editor.dispatch({ changes: { from: 0, insert: 'closed-' } });
  await leaf.setViewState({ type: 'empty' });
  check(await app.vault.read(file) === 'closed-base-first-second', 'Closing before the autosave delay saves immediately');
  app.setting.open();
  app.setting.openTabById('just-simple-file-viewer');
  await wait(150);
  check(p.settingTab.containerEl.querySelectorAll('.setting-item').length >= 5, 'Settings render on the stable host');
  app.setting.close();
  await leaf.openFile(file);
  const current = leaf.view;
  p.settings.lineNumbers = false;
  current.applySettings();
  check(!current.editor.dom.querySelector('.cm-lineNumbers'), 'Line number setting updates without rebuilding the document');
  p.settings.lineNumbers = true;
  current.applySettings();
  current.editor.dispatch({ changes: { from: 0, insert: 'disable-' } });
  await app.plugins.disablePlugin('just-simple-file-viewer');
  await wait(150);
  check(await app.vault.read(file) === 'disable-closed-base-first-second', 'Disabling the plugin flushes pending edits');
  check(p.views.length === 0, 'Editor instances are removed when the plugin unloads');
  await app.plugins.enablePlugin('just-simple-file-viewer');
  const updated = app.plugins.plugins['just-simple-file-viewer'];
  const json = await app.vault.create(`preview-${Date.now()}.json`, '{"ready":true}\n');
  await updated.openAsText(json);
  return { count: checks.length, checks };
})()
