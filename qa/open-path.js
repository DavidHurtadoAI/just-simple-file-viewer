(async () => {
  if (!app.vault.adapter.basePath.replaceAll('\\', '/').endsWith('/qa/.vault')) throw Error('Use the isolated QA vault');
  const p = app.plugins.plugins['just-simple-file-viewer'];
  const checks = [];
  const check = (ok, label) => { if (!ok) throw Error(label); checks.push(label); };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const until = async (fn, label) => {
    for (let i = 0; i < 80; i++) { if (fn()) return; await wait(50); }
    throw Error(`Timed out: ${label}`);
  };
  const dialog = () => [...document.querySelectorAll('.modal')].filter(el => el.querySelector('input[aria-label="File path"]')).at(-1);
  for (let previous = dialog(); previous; previous = dialog()) {
    previous.querySelector('input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
    await until(() => !previous.isConnected, 'previous QA dialog closed');
  }
  const folder = `Paths ${Date.now()}`;
  await app.vault.createFolder(folder);
  const custom = await app.vault.create(`${folder}/Málaga.custom`, '{"text":"á 🌍"}\n');
  const noext = await app.vault.create(`${folder}/Makefile`, 'build:\n\techo hello\n');
  const binary = await app.vault.createBinary(`${folder}/binary.txt`, new Uint8Array([0, 1, 255]).buffer);
  let enumerations = 0;
  const enumerate = app.vault.getFiles;
  app.vault.getFiles = function() { enumerations++; throw Error('Unexpected vault enumeration'); };
  try { app.commands.executeCommandById('just-simple-file-viewer:open-text-file'); }
  finally { app.vault.getFiles = enumerate; }
  let modal = dialog();
  check(!!modal, 'The command opens the file-path dialog');
  check(enumerations === 0, 'Opening the dialog never requests the vault file list');
  const enterPath = path => {
    const input = modal.querySelector('input[aria-label="File path"]');
    input.value = path;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return input;
  };
  const clickOpen = () => modal.querySelector('button.mod-cta').click();
  const before = p.views.length;
  enterPath(`${folder}/missing.txt`);
  clickOpen();
  await wait(80);
  check(modal.isConnected && p.views.length === before, 'A missing path keeps the dialog open without opening a tab');
  enterPath('../outside.txt');
  clickOpen();
  await wait(80);
  check(modal.isConnected && p.views.length === before, 'A path outside the vault cannot be opened');
  enterPath(`  ${custom.path}  `);
  clickOpen();
  await until(() => !modal.isConnected, 'custom path opened');
  check(p.views.some(view => view.file === custom && view.getViewData().includes('á 🌍')), 'An exact Unicode path opens an unknown text extension');
  app.commands.executeCommandById('just-simple-file-viewer:open-text-file');
  modal = dialog();
  check(modal.querySelector('input').value === custom.path, 'The dialog starts with the active file path');
  const input = enterPath(noext.path);
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
  await until(() => !modal.isConnected, 'Enter confirms path');
  check(p.views.some(view => view.file === noext && view.ready), 'Enter opens an extensionless file');
  app.commands.executeCommandById('just-simple-file-viewer:open-text-file');
  modal = dialog();
  enterPath(binary.path);
  clickOpen();
  await wait(100);
  check(modal.isConnected && !p.views.some(view => view.file === binary), 'A binary file is rejected and the dialog stays open');
  check(new Uint8Array(await app.vault.readBinary(binary))[2] === 255, 'Rejected binary contents remain unchanged');
  modal.querySelector('input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
  await until(() => !modal.isConnected, 'Escape closes dialog');
  check(!modal.isConnected, 'Escape closes the file-path dialog');
  return { count: checks.length, checks };
})()
