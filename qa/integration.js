// Execute in the renderer of an isolated Obsidian test vault via CDP or the CLI.
(async () => {
  const checks = [];
  const timings = {};
  const check = (condition, label) => {
    if (!condition) throw new Error(label);
    checks.push(label);
  };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const until = async (fn, label) => {
    for (let i = 0; i < 80; i++) { if (await fn()) return; await wait(100); }
    throw new Error(`Timed out: ${label}`);
  };
  const plugin = app.plugins.plugins['just-simple-file-viewer'];
  check(!!plugin, 'Plugin loads with host CodeMirror modules');
  let leaf = app.workspace.getLeaf('tab');
  const open = async file => {
    await leaf.openFile(file);
    await app.workspace.revealLeaf(leaf);
    await until(() => leaf.view.ready || !leaf.view.banner?.hidden, 'file loaded');
    return leaf.view;
  };
  const folder = `Fixtures ${Date.now()}`;
  const create = (name, data) => app.vault.create(`${folder}/${name}`, data);
  await app.vault.createFolder(folder);
  const txt = await create('plain.txt', 'Hello Málaga 🌍\nSecond line');
  const json = await create('settings.json', '{\n  "name": "Just Simple File Viewer",\n  "enabled": true,\n  "count": 42\n}\n');
  const csv = await create('table.csv', 'name,city\r\nDavid,Madrid\r\n');
  const py = await create('example.python', 'def greet(name):\n    # A local file, never executed\n    return f"Hello {name}"\n');
  const bom = await create('bom.txt', '\uFEFFone\r\ntwo\r\n');
  const unknown = await create('custom.xyztext', 'custom extension');
  const noext = await create('Makefile', 'build:\n\techo hello\n');
  const native = await create('native.md', '# Native markdown');
  const bad = await app.vault.createBinary(`${folder}/binary.txt`, new Uint8Array([0, 1, 2, 255]).buffer);
  let v = await open(json);
  check(v.getViewType() === 'just-simple-file-viewer', 'JSON opens in a native file tab');
  check(v.editor.state.doc.lines === 6, 'JSON source lines are preserved');
  await wait(200);
  check(v.editor.dom.querySelectorAll('.cm-line span').length > 2, 'JSON syntax is highlighted');
  check(v.editor.dom.querySelectorAll('.cm-gutterElement').length > 0, 'Line numbers are visible');
  const before = await app.vault.read(json);
  v.editor.dispatch({ changes: { from: before.indexOf('42'), to: before.indexOf('42') + 2, insert: '43' } });
  await until(async () => (await app.vault.read(json)).includes('43'), 'automatic save');
  check(!v.isDirty, 'Automatic save clears dirty state');
  v.find();
  check(!!v.editor.dom.querySelector('.cm-search input[name="search"]'), 'Find panel opens');
  check(!!v.editor.dom.querySelector('.cm-search input[name="replace"]'), 'Replace panel is available');
  v.toggleWrap();
  check(v.editor.dom.querySelector('.cm-lineWrapping'), 'Word wrapping can be toggled');
  v = await open(csv);
  v.editor.dispatch({ changes: { from: 0, to: 4, insert: 'person' } });
  await v.save();
  check((await app.vault.read(csv)) === 'person,city\r\nDavid,Madrid\r\n', 'CSV edits preserve CRLF');
  v = await open(py);
  await wait(100);
  check(v.modeName === 'Python' && v.editor.dom.querySelector('.cm-line span'), '.python gets Python highlighting');
  v = await open(bom);
  v.editor.dispatch({ changes: { from: 0, insert: 'new\r\n' } });
  await v.save();
  check(new TextDecoder('utf-8', { ignoreBOM: true }).decode(await app.vault.readBinary(bom)) === '\uFEFFnew\r\none\r\ntwo\r\n', 'UTF-8 BOM survives actual disk saving');
  v = await open(txt);
  await app.vault.modify(txt, 'Externally changed\n');
  await until(() => v.editor.state.doc.toString() === 'Externally changed\n', 'clean external reload');
  check(!v.isDirty, 'External changes reload a clean tab');
  v.editor.dispatch({ changes: { from: 0, insert: 'LOCAL ' } });
  await app.vault.modify(txt, 'REMOTE\n');
  await until(() => v.conflicted, 'dirty external conflict');
  await v.save();
  check(await app.vault.read(txt) === 'REMOTE\n', 'Conflicting local edits never overwrite disk');
  check(v.getViewData().startsWith('LOCAL '), 'Conflicts retain local edits in the tab');
  let recovery;
  const recoveryListener = app.vault.on('create', file => {
    if (file.path.startsWith(`${folder}/plain (local copy`)) recovery = file;
  });
  try { await leaf.setViewState({ type: 'empty' }); }
  finally { app.vault.offref(recoveryListener); }
  check(!!recovery && (await app.vault.read(recovery)).startsWith('LOCAL '), 'Closing a conflict tab saves a recovery copy');
  v = await open(bad);
  check(!v.ready && v.banner.textContent.includes('UTF-8'), 'Binary data under a text extension is blocked');
  check(!v.editor.contentDOM.isContentEditable, 'Blocked file cannot be edited');
  check(new Uint8Array(await app.vault.readBinary(bad))[3] === 255, 'Blocked binary bytes remain unchanged');
  await plugin.openAsText(unknown);
  const customView = [...plugin.views].find(x => x.file === unknown);
  check(customView?.ready, 'Unknown text extensions open explicitly');
  await plugin.openAsText(noext);
  check([...plugin.views].some(x => x.file === noext && x.ready), 'Extensionless text files open explicitly');
  await leaf.openFile(native);
  check(leaf.view.getViewType() === 'markdown', 'Markdown keeps its native viewer');
  const large = await create('large.log', 'A long but ordinary line of text 0123456789\n'.repeat(120000));
  const started = performance.now();
  v = await open(large);
  timings.largeFileOpenMs = Math.round(performance.now() - started);
  check(v.editor.state.doc.lines === 120001, 'Large file opens with all 120000 source lines');
  check(v.editor.dom.querySelectorAll('.cm-line').length < 500, 'Large files render only the viewport');
  check(v.mode.textContent.includes('Large file'), 'Large files enter plain-text mode');
  v.editor.dispatch({ changes: { from: 0, insert: 'Edited\n' } });
  const saved = performance.now();
  await v.save();
  timings.largeFileSaveMs = Math.round(performance.now() - saved);
  check((await app.vault.read(large)).startsWith('Edited\n'), 'Large file saves correctly');
  // Leave a readable JSON fixture on screen for visual verification.
  await open(json);
  const results = { checks, timings, count: checks.length, version: plugin.manifest.version };
  await app.vault.adapter.write('results.json', JSON.stringify(results, null, 2));
  return results;
})()
