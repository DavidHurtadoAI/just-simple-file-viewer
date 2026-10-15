import { Modal, normalizePath, Notice, Plugin, PluginSettingTab, Setting, TFile, type App, type SettingDefinition } from 'obsidian';
import { BINARY_EXTENSIONS, decodeText, DEFAULT_EXTENSIONS, extensionOf, MAX_FILE_BYTES, NATIVE_EXTENSIONS, parseExtensions } from './text.ts';
import { SimpleTextView, VIEW_TYPE } from './view';
import type { CsvDelimiter } from './csv.ts';

interface Settings {
  extensions: string;
  highlightSyntax: boolean;
  wordWrap: boolean;
  lineNumbers: boolean;
  tabSize: number;
  csvView: 'table' | 'text';
  csvDelimiter: CsvDelimiter;
  csvHeader: boolean;
}
const DEFAULT_SETTINGS: Settings = {
  extensions: DEFAULT_EXTENSIONS.join(', '),
  highlightSyntax: true,
  wordWrap: false,
  lineNumbers: true,
  tabSize: 4,
  csvView: 'table',
  csvDelimiter: 'auto',
  csvHeader: true,
};

export default class JustSimpleFileViewer extends Plugin {
  settings: Settings = { ...DEFAULT_SETTINGS };
  skippedExtensions: string[] = [];

  get views(): SimpleTextView[] {
    return this.app.workspace.getLeavesOfType(VIEW_TYPE)
      .map(leaf => leaf.view).filter((view): view is SimpleTextView => view instanceof SimpleTextView);
  }

  async onload(): Promise<void> {
    const saved = await this.loadData() as Partial<Settings> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...saved };
    if (typeof this.settings.extensions !== 'string') this.settings.extensions = DEFAULT_SETTINGS.extensions;
    if (![2, 4, 8].includes(this.settings.tabSize)) this.settings.tabSize = 4;
    if (!['table', 'text'].includes(this.settings.csvView)) this.settings.csvView = 'table';
    if (!['auto', 'comma', 'semicolon', 'tab'].includes(this.settings.csvDelimiter)) this.settings.csvDelimiter = 'auto';
    if (typeof this.settings.csvHeader !== 'boolean') this.settings.csvHeader = true;
    this.registerView(VIEW_TYPE, leaf => new SimpleTextView(leaf, this));
    const extensions: string[] = [];
    for (const extension of parseExtensions(this.settings.extensions)) {
      if (NATIVE_EXTENSIONS.has(extension) || BINARY_EXTENSIONS.has(extension)) {
        this.skippedExtensions.push(extension);
        continue;
      }
      extensions.push(extension);
    }
    this.registerTextExtensions(extensions);
    this.addSettingTab(new FileViewerSettings(this.app, this));
    this.addCommand({ id: 'open-text-file', name: 'Open text file', callback: () => new TextFilePathModal(this.app, this).open() });
    this.addCommand({
      id: 'open-current-as-text', name: 'Open current file as text',
      checkCallback: checking => {
        const file = this.app.workspace.getActiveFile();
        if (!file || BINARY_EXTENSIONS.has(extensionOf(file.path))) return false;
        if (!checking) void this.openAsText(file);
        return true;
      },
    });
    this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
      if (!(file instanceof TFile) || BINARY_EXTENSIONS.has(extensionOf(file.path))) return;
      menu.addItem(item => item.setTitle('Open as text').setIcon('file-code-2').onClick(() => { void this.openAsText(file); }));
    }));
  }

  private registerTextExtensions(extensions: string[]): void {
    if (!extensions.length) return;
    // Register in one batch so Obsidian only refreshes the explorer once.
    // If a view already owns an extension, split the batch to isolate it.
    try { this.registerExtensions(extensions, VIEW_TYPE); }
    catch {
      if (extensions.length === 1) this.skippedExtensions.push(extensions[0]!);
      else {
        const middle = Math.floor(extensions.length / 2);
        this.registerTextExtensions(extensions.slice(0, middle));
        this.registerTextExtensions(extensions.slice(middle));
      }
    }
  }

  async openAsText(file: TFile): Promise<boolean> {
    try {
      if (BINARY_EXTENSIONS.has(extensionOf(file.path))) throw new Error('This file type is not a plain-text format.');
      if (file.stat.size > MAX_FILE_BYTES) throw new Error('This file exceeds the 20 MB editing limit.');
      decodeText(await this.app.vault.readBinary(file));
      const existing = this.views.find(view => view.file === file);
      if (existing) { await this.app.workspace.revealLeaf(existing.leaf); existing.focusContent(); return true; }
      const leaf = this.app.workspace.getLeaf('tab');
      await leaf.setViewState({ type: VIEW_TYPE, state: { file: file.path }, active: true });
      await this.app.workspace.revealLeaf(leaf);
      if (leaf.view instanceof SimpleTextView) leaf.view.focusContent();
      return true;
    } catch (error) {
      new Notice(error instanceof Error ? error.message : 'Unable to open this file.');
      return false;
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    for (const view of this.views) view.applySettings();
  }
}

class TextFilePathModal extends Modal {
  private pathValue: string;
  private opening = false;

  constructor(app: App, private readonly plugin: JustSimpleFileViewer) {
    super(app);
    this.pathValue = app.workspace.getActiveFile()?.path ?? '';
    this.scope.register([], 'Enter', () => { void this.openPath(); return false; });
  }

  onOpen(): void {
    this.setTitle('Open text file');
    this.contentEl.createEl('p', { text: 'Enter a file path relative to your vault. You can also open files from the explorer context menu.' });
    new Setting(this.contentEl).setName('File path')
      .addText(input => {
        input.setPlaceholder('folder/example.json').setValue(this.pathValue)
          .onChange(value => { this.pathValue = value; });
        input.inputEl.setAttribute('aria-label', 'File path');
        input.inputEl.focus();
        input.inputEl.select();
      })
      .addButton(button => button.setButtonText('Open').setCta().onClick(() => { void this.openPath(); }));
  }

  private async openPath(): Promise<void> {
    if (this.opening) return;
    const file = this.app.vault.getFileByPath(normalizePath(this.pathValue.trim()));
    if (!file) { new Notice('File not found. Enter a path relative to your vault.'); return; }
    this.opening = true;
    try { if (await this.plugin.openAsText(file)) this.close(); }
    finally { this.opening = false; }
  }

  onClose(): void { this.contentEl.empty(); }
}

class FileViewerSettings extends PluginSettingTab {
  constructor(app: App, private readonly plugin: JustSimpleFileViewer) { super(app, plugin); }
  getSettingDefinitions(): SettingDefinition[] {
    return [
      { name: 'File extensions', desc: 'Open these extensions as text by default. Separate with commas. Reload the plugin after changing this list. Existing native views and other plugins take priority.', control: { type: 'textarea', key: 'extensions', rows: 5 } },
      { name: 'Excluded extensions', desc: this.plugin.skippedExtensions.join(', '), visible: () => this.plugin.skippedExtensions.length > 0 },
      { name: 'CSV default view', desc: 'Show a table styled like Markdown or edit the source text. Switch views with the button in the file header.', control: { type: 'dropdown', key: 'csvView', options: { table: 'Table', text: 'Text' } } },
      { name: 'CSV separator', desc: 'Automatic detection uses the first row, ignoring separators inside quotes.', control: { type: 'dropdown', key: 'csvDelimiter', options: { auto: 'Automatic', comma: 'Comma', semicolon: 'Semicolon', tab: 'Tab' } } },
      { name: 'CSV header row', desc: 'Use the first row as column headings.', control: { type: 'toggle', key: 'csvHeader' } },
      { name: 'Syntax highlighting', desc: 'Color supported languages. Files over one million characters use plain text to keep editing responsive.', control: { type: 'toggle', key: 'highlightSyntax' } },
      { name: 'Line numbers', control: { type: 'toggle', key: 'lineNumbers' } },
      { name: 'Word wrap', desc: 'Wrap long lines. Toggle the active tab with Alt+Z or its wrap button.', control: { type: 'toggle', key: 'wordWrap' } },
      { name: 'Indent size', control: { type: 'dropdown', key: 'tabSize', options: { '2': '2 spaces', '4': '4 spaces', '8': '8 spaces' } } },
    ];
  }
  getControlValue(key: string): unknown {
    if (key === 'tabSize') return String(this.plugin.settings.tabSize);
    return this.plugin.settings[key as keyof Settings];
  }
  async setControlValue(key: string, value: unknown): Promise<void> {
    const { settings } = this.plugin;
    if (key === 'extensions' && typeof value === 'string') settings.extensions = value;
    if (key === 'tabSize' && [2, 4, 8].includes(Number(value))) settings.tabSize = Number(value);
    if (key === 'csvView' && (value === 'table' || value === 'text')) {
      settings.csvView = value;
      for (const view of this.plugin.views) view.setCsvView(value, false);
    }
    if (key === 'csvDelimiter' && (value === 'auto' || value === 'comma' || value === 'semicolon' || value === 'tab')) settings.csvDelimiter = value;
    if (key === 'csvHeader' && typeof value === 'boolean') settings.csvHeader = value;
    if ((key === 'highlightSyntax' || key === 'lineNumbers' || key === 'wordWrap') && typeof value === 'boolean') {
      settings[key] = value;
      if (key === 'wordWrap') for (const view of this.plugin.views) view.setWrap(value);
    }
    await this.plugin.saveSettings();
  }
}
