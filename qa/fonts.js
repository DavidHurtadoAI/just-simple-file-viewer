(async () => {
  if (!app.vault.adapter.basePath.replaceAll('\\', '/').endsWith('/qa/.vault')) throw Error('Use the isolated QA vault');
  let p = app.plugins.plugins['just-simple-file-viewer'];
  const savedSettings = { ...p.settings };
  const savedTextFont = app.vault.getConfig('textFontFamily');
  const savedMonoFont = app.vault.getConfig('monospaceFontFamily');
  const savedSize = app.getBaseFontSize();
  const checks = [];
  const check = (ok, label) => { if (!ok) throw Error(label); checks.push(label); };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const style = el => el.win.getComputedStyle(el);
  const hasFont = (el, font) => style(el).fontFamily.startsWith(font) || style(el).fontFamily.startsWith(`"${font}"`);
  const folder = `Fonts ${Date.now()}`;
  await app.vault.createFolder(folder);
  const leaf = app.workspace.getLeaf('tab');
  const open = async file => {
    await leaf.setViewState({ type: p.manifest.id, state: { file: file.path }, active: true });
    await app.workspace.revealLeaf(leaf);
    return leaf.view;
  };
  const cases = [
    ['plain.txt', 'Hello Málaga 🌍\nStandard text font', false],
    ['events.log', 'An ordinary log line\n', false],
    ['data.csv', 'name,city\nDavid,Madrid\n', false],
    ['data.tsv', 'name\tcity\nDavid\tMadrid\n', false],
    ['unknown.customtext', 'Unknown extensions use the text font', false],
    ['config.json', '{"ready":true}\n', true],
    ['example.python', 'def hello():\n    return 42\n', true],
    ['query.sql', 'SELECT * FROM example;\n', true],
    ['main.go', 'package main\n', true],
    ['settings.yaml', 'enabled: true\n', true],
    ['Makefile', 'build:\n\techo hello\n', true],
  ];
  const files = [];
  try {
    check(p.settings.fontMode === 'auto', 'Existing settings migrate to automatic typography');
    app.vault.setConfig('textFontFamily', 'Georgia');
    app.vault.setConfig('monospaceFontFamily', 'Courier New');
    app.updateFontFamily();
    app.setBaseFontSize(22);
    await wait(100);
    check(style(document.body).getPropertyValue('--font-text-size') === '22px', 'Native Appearance text size is used as the reference');
    for (const [name, source, mono] of cases) {
      const file = await app.vault.create(`${folder}/${name}`, source);
      files.push(file);
      const v = await open(file);
      check(hasFont(v.editor.contentDOM, mono ? 'Courier New' : 'Georgia') && style(v.editor.contentDOM).fontSize === '22px', `${name} uses the configured ${mono ? 'monospace' : 'text'} font and size`);
      if (name.endsWith('.csv')) {
        check(!v.tableHost.hidden && hasFont(v.tableHost.querySelector('td'), 'Georgia') && style(v.tableHost.querySelector('td')).fontSize === '22px', 'CSV preview uses the configured standard text font and size');
        check(!v.tableHost.querySelector('td').isContentEditable, 'CSV cells remain read-only');
        v.tableHost.querySelector('button').click();
        check(hasFont(v.editor.contentDOM, 'Georgia'), 'Edit as text keeps the standard CSV font');
      }
    }

    const text = files[0];
    let v = await open(text);
    const doc = v.editor.state.doc;
    v.editor.dispatch({ selection: { anchor: 4 } });
    const csvLeaf = app.workspace.getLeaf('tab');
    await csvLeaf.openFile(files[2]);
    const csv = csvLeaf.view;
    const table = csv.tableHost.querySelector('table');
    app.setting.open();
    app.setting.openTabById(p.manifest.id);
    await wait(150);
    const select = [...p.settingTab.containerEl.querySelectorAll('.setting-item')]
      .find(el => el.querySelector('.setting-item-name')?.textContent === 'Font')?.querySelector('select');
    check(!!select && select.options.length === 3, 'Font setting exposes automatic, standard and monospace choices');
    const choose = async value => {
      select.value = value;
      select.dispatchEvent(new select.win.Event('change', { bubbles: true }));
      await wait(150);
    };
    await choose('monospace');
    check(hasFont(v.editor.contentDOM, 'Courier New') && hasFont(csv.tableHost.querySelector('td'), 'Courier New'), 'Monospace override updates open text editors and CSV tables');
    check(v.editor.state.doc === doc && v.editor.state.selection.main.head === 4 && csv.tableHost.querySelector('table') === table, 'Font changes preserve the source, cursor and existing table DOM');
    await choose('text');
    const code = await open(files[5]);
    check(hasFont(code.editor.contentDOM, 'Georgia'), 'Standard override applies to code files');
    app.setting.close();
    await app.plugins.disablePlugin(p.manifest.id);
    await app.plugins.enablePlugin(p.manifest.id);
    p = app.plugins.plugins['just-simple-file-viewer'];
    check(p.settings.fontMode === 'text', 'Forced font preference persists across plugin reload');

    p.settings.fontMode = 'auto';
    await p.saveSettings();
    v = await open(text);
    app.vault.setConfig('textFontFamily', 'Verdana');
    app.vault.setConfig('monospaceFontFamily', 'Consolas');
    app.updateFontFamily();
    app.setBaseFontSize(19);
    await wait(150);
    check(hasFont(v.editor.contentDOM, 'Verdana') && style(v.editor.contentDOM).fontSize === '19px', 'Changing Obsidian Appearance updates an already open editor');
    const raw = await app.vault.read(text);
    await app.vault.rename(text, `${folder}/renamed.py`);
    await wait(150);
    check(hasFont(v.editor.contentDOM, 'Consolas') && style(v.editor.contentDOM).fontSize === '19px', 'Renaming text to code updates the automatic font');
    check(await app.vault.read(text) === raw && !v.isDirty, 'Typography and renaming preserve file contents');
    const updatedCsv = await open(files[2]);
    check(hasFont(updatedCsv.tableHost.querySelector('td'), 'Verdana') && style(updatedCsv.tableHost.querySelector('td')).fontSize === '19px', 'CSV table follows updated native Appearance settings');
    return { version: p.manifest.version, count: checks.length, checks };
  } finally {
    app.setting.close();
    app.vault.setConfig('textFontFamily', savedTextFont);
    app.vault.setConfig('monospaceFontFamily', savedMonoFont);
    app.updateFontFamily();
    app.setBaseFontSize(savedSize);
    const current = app.plugins.plugins['just-simple-file-viewer'];
    if (current) { Object.assign(current.settings, savedSettings); await current.saveSettings(); }
  }
})()
