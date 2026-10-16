import { FileView, normalizePath, Notice, Scope, setIcon, setTooltip, type TFile, type WorkspaceLeaf } from 'obsidian';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, HighlightStyle, indentOnInput, indentUnit, syntaxHighlighting } from '@codemirror/language';
import * as CodeMirrorLanguage from '@codemirror/language';
import { closeSearchPanel, openSearchPanel, search, searchKeymap } from '@codemirror/search';
import { tags } from '@lezer/highlight';
import type JustSimpleFileViewer from './main';
import { languageFor } from './languages';
import { checkedUpdate, conflictCopyPath, decodeText, extensionOf, HIGHLIGHT_LIMIT, MAX_FILE_BYTES, TextConflictError, textFormat, usesMonospace } from './text.ts';
import { CSV_PREVIEW_CHAR_LIMIT, parseCsvPreview } from './csv.ts';

export const VIEW_TYPE = 'just-simple-file-viewer';
const colors = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--color-purple)' },
  { tag: [tags.string, tags.special(tags.string)], color: 'var(--color-green)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--color-orange)' },
  { tag: tags.comment, color: 'var(--text-muted)', fontStyle: 'italic' },
  { tag: [tags.propertyName, tags.attributeName], color: 'var(--color-blue)' },
  { tag: [tags.tagName, tags.typeName, tags.className], color: 'var(--color-red)' },
  { tag: tags.meta, color: 'var(--color-cyan)' },
]);
// Obsidian's StreamLanguage fork emits native cm-* tokens. Feature-detect its
// matching highlighter; standard CodeMirror hosts can use normal highlight tags.
const streamHighlighter = (CodeMirrorLanguage as typeof CodeMirrorLanguage & {
  lineHighlighter?: Extension;
}).lineHighlighter ?? syntaxHighlighting(colors);

export class SimpleTextView extends FileView {
  editor: EditorView | null = null;
  private readonly options = new Compartment();
  private readonly language = new Compartment();
  private root!: HTMLElement;
  private editorHost!: HTMLElement;
  private tableHost!: HTMLElement;
  private tableAction!: HTMLElement;
  private csvTable = false;
  private tableCache = '';
  private tableDoc: EditorState['doc'] | null = null;
  private banner!: HTMLElement;
  private position!: HTMLElement;
  private mode!: HTMLElement;
  private saveState!: HTMLElement;
  private formatLabel!: HTMLElement;
  private base = '';
  private bom = '';
  private eol = '\n';
  private originalContent = '';
  private edited = false;
  private ready = false;
  private closing = false;
  private conflicted = false;
  private generation = 0;
  private timer: number | null = null;
  private queue: Promise<void> = Promise.resolve();
  private pendingWrite: string | null = null;
  private wrapped: boolean;
  private modeName = 'Plain text';

  constructor(leaf: WorkspaceLeaf, private readonly plugin: JustSimpleFileViewer) {
    super(leaf);
    this.navigation = true;
    this.scope = new Scope(this.app.scope);
    this.wrapped = plugin.settings.wordWrap;
    this.scope.register(['Mod'], 's', () => { void this.save(); return false; });
    this.scope.register(['Mod'], 'f', () => { this.find(); return false; });
    this.scope.register(['Mod'], 'h', () => { this.find(); return false; });
    this.scope.register(['Alt'], 'z', () => { this.toggleWrap(); return false; });
  }

  getViewType(): string { return VIEW_TYPE; }
  getDisplayText(): string { return this.file?.name ?? 'Text file'; }
  getIcon(): string { return 'file-code-2'; }

  async onOpen(): Promise<void> {
    this.contentEl.addClass('jsfv-content');
    this.root = this.contentEl.createDiv({ cls: 'jsfv-root' });
    this.banner = this.root.createDiv({ cls: 'jsfv-banner', attr: { role: 'status', 'aria-live': 'polite' } });
    this.banner.hidden = true;
    this.editorHost = this.root.createDiv({ cls: 'jsfv-editor' });
    this.tableHost = this.root.createDiv({ cls: 'jsfv-table markdown-rendered', attr: { tabindex: '0', role: 'region', 'aria-label': 'CSV table preview' } });
    this.tableHost.hidden = true;
    const status = this.root.createDiv({ cls: 'jsfv-status' });
    this.mode = status.createSpan({ cls: 'jsfv-mode' });
    this.formatLabel = status.createSpan();
    this.position = status.createSpan({ cls: 'jsfv-position' });
    this.saveState = status.createSpan({ cls: 'jsfv-save-state', attr: { 'aria-live': 'polite' } });
    this.editor = new EditorView({ parent: this.editorHost, state: this.makeState('') });
    this.addAction('search', 'Find and replace', () => this.find());
    this.addAction('wrap-text', 'Toggle word wrap', () => this.toggleWrap());
    this.tableAction = this.addAction('table', 'View CSV as table', () => this.setCsvView(this.csvTable ? 'text' : 'table'));
    this.addAction('save', 'Save file', () => { void this.save(); });
    this.registerEvent(this.app.vault.on('modify', file => {
      if (file === this.file) void this.refreshFromDisk();
    }));
    this.registerEvent(this.app.workspace.on('css-change', () => this.editor?.requestMeasure()));
    this.updateStatus();
    this.updatePresentation();
  }

  private settingsExtensions(): Extension {
    return [
      this.plugin.settings.lineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : [],
      this.wrapped ? EditorView.lineWrapping : [],
      EditorState.tabSize.of(this.plugin.settings.tabSize),
      indentUnit.of(' '.repeat(this.plugin.settings.tabSize)),
      EditorView.editable.of(this.ready && !this.closing),
      EditorState.readOnly.of(!this.ready || this.closing),
    ];
  }

  private languageExtension(length: number): Extension {
    const mode = languageFor(extensionOf(this.file?.path ?? ''));
    this.modeName = mode.name;
    const active = this.plugin.settings.highlightSyntax && length <= HIGHLIGHT_LIMIT;
    return active && mode.language ? [mode.language, streamHighlighter] : [];
  }

  private makeState(content: string): EditorState {
    return EditorState.create({
      doc: content,
      extensions: [
        history(), drawSelection(), highlightActiveLine(), bracketMatching(), indentOnInput(),
        search({ top: true }),
        keymap.of([{ key: 'Escape', run: closeSearchPanel }, ...searchKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
        EditorState.lineSeparator.of(this.eol),
        EditorState.allowMultipleSelections.of(true),
        EditorView.contentAttributes.of({ 'aria-label': 'Text file editor', spellcheck: 'false', autocapitalize: 'off' }),
        this.options.of(this.settingsExtensions()),
        this.language.of(this.languageExtension(content.length)),
        EditorView.updateListener.of(update => {
          if (update.docChanged && this.ready) {
            this.edited = true;
            // A document-sized string is only built when saving, not on every keystroke.
            this.scheduleSave();
            if ((update.startState.doc.length <= HIGHLIGHT_LIMIT) !== (update.state.doc.length <= HIGHLIGHT_LIMIT)) {
              queueMicrotask(() => this.applySettings());
            }
          }
          if (update.docChanged || update.selectionSet) this.updateStatus();
        }),
      ],
    });
  }

  applySettings(): void {
    if (!this.editor) return;
    this.editor.dispatch({ effects: [
      this.options.reconfigure(this.settingsExtensions()),
      this.language.reconfigure(this.languageExtension(this.editor.state.doc.length)),
    ] });
    this.updatePresentation();
    this.editor.requestMeasure();
    this.updateStatus();
  }

  private updatePresentation(): void {
    this.root.toggleClass('jsfv-monospace', usesMonospace(this.file?.path ?? '', this.plugin.settings.fontMode));
    const csv = extensionOf(this.file?.path ?? '') === 'csv';
    const table = csv && this.csvTable && this.ready;
    this.tableAction.hidden = !csv;
    setIcon(this.tableAction, table ? 'file-code-2' : 'table');
    setTooltip(this.tableAction, table ? 'Edit CSV as text' : 'View CSV as table');
    this.editorHost.hidden = table;
    this.tableHost.hidden = !table;
    if (!table || !this.editor) return;
    const cache = `${this.plugin.settings.csvDelimiter}:${this.plugin.settings.csvHeader}`;
    if (this.tableDoc === this.editor.state.doc && this.tableCache === cache) return;
    this.tableDoc = this.editor.state.doc;
    this.tableCache = cache;
    this.tableHost.empty();
    const controls = this.tableHost.createDiv({ cls: 'jsfv-table-controls' });
    controls.createEl('button', { text: 'Edit as text' }).addEventListener('click', () => this.setCsvView('text'));
    try {
      // Read only a bounded prefix, even when the editor holds a much larger file.
      const source = this.editor.state.sliceDoc(0, Math.min(this.editor.state.doc.length, CSV_PREVIEW_CHAR_LIMIT + 1));
      const preview = parseCsvPreview(source, this.plugin.settings.csvDelimiter);
      if (preview.truncated) controls.createSpan({ text: 'Preview limited to 500 rows, 100 columns and 1,048,576 characters. Open text for the full file.' });
      if (!preview.rows.length) {
        this.tableHost.createEl('p', { text: preview.truncated ? 'No complete row fits in the preview.' : 'Empty CSV file.' });
        return;
      }
      const grid = this.tableHost.createEl('table', { attr: { 'aria-label': this.file?.name ?? 'CSV' } });
      const columns = Math.max(...preview.rows.map(row => row.length));
      const header = this.plugin.settings.csvHeader;
      const head = header ? grid.createEl('thead') : null;
      const body = grid.createEl('tbody');
      preview.rows.forEach((row, index) => {
        const isHeader = header && index === 0;
        const tr = (isHeader ? head! : body).createEl('tr');
        for (let column = 0; column < columns; column++) {
          // Literal text preserves pipes, Markdown and HTML without interpreting them.
          tr.createEl(isHeader ? 'th' : 'td', { text: row[column] ?? '', ...(isHeader ? { attr: { scope: 'col' } } : {}) });
        }
      });
    } catch (error) {
      this.tableHost.createEl('p', { text: error instanceof Error ? error.message : 'Unable to preview this CSV. Switch to text to inspect it.' });
    }
  }

  setCsvView(value: 'table' | 'text', focus = true): void {
    this.csvTable = value === 'table';
    this.updatePresentation();
    this.updateStatus();
    if (focus) this.focusContent();
  }

  focusContent(): void {
    if (!this.tableHost.hidden) this.tableHost.focus();
    else { this.editor?.requestMeasure(); this.editor?.focus(); }
  }

  find(): void {
    if (!this.ready || !this.editor) return;
    this.setCsvView('text');
    openSearchPanel(this.editor);
  }

  toggleWrap(): void {
    this.setCsvView('text');
    this.wrapped = !this.wrapped;
    this.applySettings();
  }

  setWrap(value: boolean): void {
    this.wrapped = value;
    this.applySettings();
  }

  getViewData(): string {
    if (!this.edited) return this.base;
    return this.bom + (this.editor?.state.sliceDoc() ?? this.originalContent);
  }

  get isDirty(): boolean { return this.edited; }

  async onLoadFile(file: TFile): Promise<void> {
    await super.onLoadFile(file);
    this.closing = false;
    const generation = ++this.generation;
    this.ready = false;
    this.edited = false;
    this.conflicted = false;
    this.base = '';
    this.csvTable = this.plugin.settings.csvView === 'table';
    this.editor?.setState(this.makeState(''));
    this.updatePresentation();
    try {
      const raw = await this.readText(file);
      if (generation !== this.generation) return;
      this.acceptContent(raw);
    } catch (error) {
      if (generation !== this.generation) return;
      this.showMessage(error instanceof Error ? error.message : 'Unable to read this file.');
      this.applySettings();
    }
  }

  private async readText(file: TFile): Promise<string> {
    if (file.stat.size > MAX_FILE_BYTES) throw new Error('This file exceeds the 20 MB editing limit.');
    return decodeText(await this.app.vault.readBinary(file));
  }

  private acceptContent(raw: string): void {
    const format = textFormat(raw);
    this.base = raw;
    this.bom = format.bom;
    this.eol = format.eol;
    this.originalContent = format.content;
    this.edited = false;
    this.conflicted = false;
    this.ready = true;
    this.banner.hidden = true;
    this.editor?.setState(this.makeState(format.content));
    this.updatePresentation();
    this.updateStatus();
  }

  private async refreshFromDisk(): Promise<void> {
    const file = this.file;
    const generation = this.generation;
    if (!file || !this.ready) return;
    try {
      const raw = await this.readText(file);
      if (generation !== this.generation || raw === this.base || raw === this.pendingWrite || raw === this.getViewData()) return;
      if (this.edited) this.showConflict();
      else {
        const selection = this.editor?.state.selection.main.head ?? 0;
        const scrollTop = this.editor?.scrollDOM.scrollTop ?? 0;
        this.acceptContent(raw);
        this.editor?.dispatch({ selection: { anchor: Math.min(selection, this.editor.state.doc.length) } });
        this.editor?.scrollDOM.scrollTo({ top: scrollTop });
      }
    } catch (error) {
      if (generation === this.generation) {
        this.conflicted = true;
        this.showMessage(`${error instanceof Error ? error.message : 'Unable to read the file.'} Your local text has been kept.`);
      }
    }
  }

  private scheduleSave(): void {
    this.cancelSave();
    this.timer = this.contentEl.win.setTimeout(() => { this.timer = null; void this.save(); }, 750);
  }

  private cancelSave(): void {
    if (this.timer !== null) this.contentEl.win.clearTimeout(this.timer);
    this.timer = null;
  }

  // Serializing writes also handles edits made while a previous write is in flight.
  save(): Promise<void> {
    this.cancelSave();
    this.queue = this.queue.then(async () => {
      const file = this.file;
      const generation = this.generation;
      if (!file || !this.ready || !this.edited || this.conflicted) return;
      const edited = this.getViewData();
      const base = this.base;
      if (edited === base) { this.edited = false; this.updateStatus(); return; }
      this.saveState.setText('Saving…');
      this.pendingWrite = edited;
      try {
        await this.app.vault.process(file, current => checkedUpdate(current, base, edited));
        if (generation !== this.generation) return;
        this.base = edited;
        this.edited = this.getViewData() !== edited;
        this.updateStatus();
      } catch (error) {
        if (generation !== this.generation) return;
        if (error instanceof TextConflictError) this.showConflict();
        else {
          this.showMessage(`Unable to save. ${error instanceof Error ? error.message : 'Try again.'} Your edits are still in this tab.`);
          this.saveState.setText('Save failed');
        }
      } finally { this.pendingWrite = null; }
    });
    return this.queue;
  }

  private showMessage(message: string): void {
    this.banner.empty();
    this.banner.createSpan({ text: message });
    this.banner.hidden = false;
  }

  private showConflict(): void {
    this.conflicted = true;
    this.showMessage('The file changed on disk. Your local edits have been kept.');
    const copy = this.banner.createEl('button', { text: 'Save a copy' });
    copy.addEventListener('click', () => {
      const snapshot = this.getViewData();
      void this.saveCopy().then(() => {
        if (snapshot === this.getViewData()) return this.reload();
        new Notice('The copy was saved. Newer edits remain in this tab.');
      }).catch(error => {
        new Notice(`Unable to save a copy: ${error instanceof Error ? error.message : 'Try again.'}`);
      });
    });
    const reload = this.banner.createEl('button', { text: 'Discard edits and reload' });
    reload.addEventListener('click', () => { void this.reload(); });
    this.updateStatus();
  }

  async saveCopy(): Promise<TFile> {
    if (!this.file) throw new Error('No file is open.');
    const suffix = `${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 7)}`;
    const copy = await this.app.vault.create(normalizePath(conflictCopyPath(this.file.path, suffix)), this.getViewData());
    new Notice(`Local edits saved to ${copy.name}`);
    return copy;
  }

  private async reload(): Promise<void> {
    const file = this.file;
    const generation = this.generation;
    if (!file) return;
    try {
      const raw = await this.readText(file);
      if (generation === this.generation) this.acceptContent(raw);
    } catch (error) {
      if (generation === this.generation) this.showMessage(error instanceof Error ? error.message : 'Unable to reload the file.');
    }
  }

  private updateStatus(): void {
    if (!this.position || !this.editor) return;
    const state = this.editor.state;
    const cursor = state.selection.main.head;
    const line = state.doc.lineAt(cursor);
    const table = !this.tableHost.hidden;
    this.position.hidden = table;
    this.position.setText(`Ln ${line.number}, Col ${cursor - line.from + 1}`);
    this.mode.setText(table ? 'CSV table preview' : this.modeName + (state.doc.length > HIGHLIGHT_LIMIT ? ' · Large file' : ''));
    this.formatLabel.setText(`UTF-8${this.bom ? ' BOM' : ''} · ${this.eol === '\r\n' ? 'CRLF' : this.eol === '\r' ? 'CR' : 'LF'}`);
    this.saveState.setText(!this.ready ? 'Read only' : this.conflicted ? 'Conflict' : this.edited ? 'Unsaved' : 'Saved');
  }

  async onRename(file: TFile): Promise<void> {
    await super.onRename(file);
    this.applySettings();
  }

  async onUnloadFile(file: TFile): Promise<void> {
    this.closing = true;
    this.applySettings();
    await this.save();
    // A tab must never close over unsaved text: retain a separate file if saving failed.
    if (this.edited) await this.saveCopy();
    this.ready = false;
    ++this.generation;
    this.cancelSave();
    await super.onUnloadFile(file);
  }

  async onClose(): Promise<void> {
    await super.onClose();
    this.cancelSave();
    this.editor?.destroy();
    this.editor = null;
    this.contentEl.removeClass('jsfv-content');
    this.contentEl.empty();
  }
}
