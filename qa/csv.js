(async () => {
  if (!app.vault.adapter.basePath.replaceAll('\\', '/').endsWith('/qa/.vault')) throw Error('Use the isolated QA vault');
  const p = app.plugins.plugins['just-simple-file-viewer'];
  const originalSettings = { ...p.settings };
  const checks = [];
  const timings = {};
  const check = (ok, label) => { if (!ok) throw Error(label); checks.push(label); };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const until = async fn => {
    for (let i = 0; i < 80; i++) { if (await fn()) return; await wait(50); }
    throw Error('Timed out waiting for CSV update');
  };
  const folder = `CSV ${Date.now()}`;
  await app.vault.createFolder(folder);
  const create = (name, source) => app.vault.create(`${folder}/${name}`, source);
  const leaf = app.workspace.getLeaf('tab');
  const open = async file => { await leaf.openFile(file); await app.workspace.revealLeaf(leaf); return leaf.view; };
  try {
    Object.assign(p.settings, { csvView: 'table', csvDelimiter: 'auto', csvHeader: true });
    const raw = '\uFEFFname;note;amount\r\nMálaga;"a,b; **bold** <img src=x onerror=alert(1)> ""quoted""";12,50\r\nDavid;"two\r\nlines";42';
    const file = await create('quoted.csv', raw);
    let v = await open(file);
    check(!v.tableHost.hidden && v.editorHost.hidden, 'CSV opens as a table by default');
    check(v.tableHost.querySelectorAll('th').length === 3 && v.tableHost.querySelectorAll('tbody tr').length === 2, 'Semicolon detection and header layout render correctly');
    check(v.tableHost.querySelector('td:nth-child(2)').textContent === 'a,b; **bold** <img src=x onerror=alert(1)> "quoted"', 'CSV Markdown and HTML render as literal text');
    check(!v.tableHost.querySelector('img,script,strong,a'), 'Cell contents create no active markup');
    check(v.tableHost.querySelectorAll('tbody tr')[1].children[1].textContent === 'two\r\nlines', 'Multiline cells retain their contents');
    check(v.tableHost.classList.contains('markdown-rendered'), 'Preview uses native Markdown table styling');
    v.tableHost.querySelector('button').click();
    check(v.tableHost.hidden && !v.editorHost.hidden, 'Edit as text button switches to the source editor');
    const selection = v.editor.state.doc.toString().indexOf('Málaga');
    v.editor.dispatch({ selection: { anchor: selection }, changes: { from: selection, to: selection + 6, insert: 'Sevilla' } });
    v.tableAction.click();
    check(!v.tableHost.hidden && v.tableHost.querySelector('td').textContent === 'Sevilla', 'Table button previews current unsaved edits');
    await v.save();
    const saved = raw.replace('Málaga', 'Sevilla');
    check(new TextDecoder('utf-8', { ignoreBOM: true }).decode(await app.vault.readBinary(file)) === saved, 'Saving from table mode preserves BOM, CRLF, quotes and missing final newline');
    v.tableAction.click();
    check(v.editor.state.selection.main.head > 0, 'Switching views preserves the source selection');
    v.tableAction.click();
    v.find();
    check(v.tableHost.hidden && !!v.editor.dom.querySelector('.cm-search'), 'Find switches to source editing');
    v.setCsvView('table');
    await app.vault.modify(file, 'name;city\nAna;Madrid\n');
    await until(() => v.tableHost.querySelector('td')?.textContent === 'Ana');
    check(!v.isDirty && v.tableHost.querySelectorAll('th').length === 2, 'External changes refresh a clean table');

    app.setting.open();
    app.setting.openTabById('just-simple-file-viewer');
    await wait(150);
    const settings = p.settingTab.containerEl;
    const control = name => [...settings.querySelectorAll('.setting-item')].find(el => el.querySelector('.setting-item-name')?.textContent === name)?.querySelector('select,input,.checkbox-container');
    const select = async (name, value) => {
      const el = control(name);
      check(!!el, `${name} setting is available`);
      el.value = value;
      el.dispatchEvent(new el.win.Event('change', { bubbles: true }));
      await wait(150);
    };
    await select('CSV default view', 'text');
    check(v.tableHost.hidden && p.settings.csvView === 'text', 'Default view setting updates open CSV tabs');
    await select('CSV default view', 'table');
    await select('CSV separator', 'comma');
    check(v.tableHost.querySelectorAll('th').length === 1, 'Manual separator overrides automatic detection');
    await select('CSV separator', 'auto');
    const headerToggle = control('CSV header row');
    check(!!headerToggle, 'Header row setting is available');
    headerToggle.click();
    await wait(150);
    check(!p.settings.csvHeader && !v.tableHost.querySelector('thead') && v.tableHost.querySelectorAll('tbody tr').length === 2, 'Header toggle treats every row as data');
    headerToggle.click();
    await wait(150);
    app.setting.close();

    const invalid = await create('invalid.csv', 'name,note\nAna,"unfinished');
    v = await open(invalid);
    check(v.tableHost.textContent.includes('Unclosed CSV quote') && !v.tableHost.querySelector('table'), 'Malformed CSV offers source editing without displaying an incorrect table');
    v.tableHost.querySelector('button').click();
    check(!v.editorHost.hidden && v.editor.state.doc.toString().includes('unfinished'), 'Malformed CSV remains fully editable');
    const big = await create('large.csv', 'name,value\n' + 'David,42\n'.repeat(120_000));
    const start = performance.now();
    v = await open(big);
    timings.largeTableOpenMs = Math.round(performance.now() - start);
    check(v.tableHost.querySelectorAll('tr').length === 500 && v.tableHost.textContent.includes('Preview limited'), 'Large CSV has a bounded preview and a visible limit notice');
    v.tableHost.querySelector('button').click();
    check(v.editor.state.doc.lines === 120_002, 'Full large CSV remains available in the source editor');
    check(await app.vault.read(big) === 'name,value\n' + 'David,42\n'.repeat(120_000), 'Previewing and toggling never modify CSV bytes');
    const empty = await create('empty.csv', '');
    v = await open(empty);
    check(v.tableHost.textContent.includes('Empty CSV file'), 'Empty CSV has a useful preview state');
    const text = await create('ordinary.txt', 'plain text');
    v = await open(text);
    check(v.tableHost.hidden && v.tableAction.hidden && !v.editorHost.hidden, 'Other file types keep the plain source editor');
    return { count: checks.length, checks, timings, version: p.manifest.version };
  } finally {
    app.setting.close();
    Object.assign(p.settings, originalSettings);
    await p.saveSettings();
  }
})()
