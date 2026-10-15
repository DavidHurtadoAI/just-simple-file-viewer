import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkedUpdate, conflictCopyPath, decodeText, extensionOf, MAX_FILE_BYTES, parseExtensions, TextConflictError, textFormat } from '../src/text.ts';
import { EditorState } from '@codemirror/state';

const bytes = text => new TextEncoder().encode(text).buffer;

test('UTF-8 preserves accents, emoji, BOM and CRLF byte for byte', () => {
  const original = '\uFEFF{"ciudad":"Málaga","emoji":"🌍"}\r\n';
  assert.equal(decodeText(bytes(original)), original);
  const format = textFormat(original);
  assert.equal(format.bom, '\uFEFF');
  assert.equal(format.eol, '\r\n');
  const state = EditorState.create({ doc: format.content, extensions: EditorState.lineSeparator.of(format.eol) });
  assert.equal(format.bom + state.sliceDoc(), original);
  const changed = state.update({ changes: { from: 0, insert: '// new\r\n' } }).state;
  assert.equal(format.bom + changed.sliceDoc(), '\uFEFF// new\r\n' + format.content);
});

test('LF, CRLF, CR, empty files and missing final newline round-trip', () => {
  for (const original of ['', 'abc', 'a\nb\n', 'a\r\nb\r\n', 'a\rb\r']) {
    const f = textFormat(decodeText(bytes(original)));
    const state = EditorState.create({ doc: f.content, extensions: EditorState.lineSeparator.of(f.eol) });
    assert.equal(f.bom + state.sliceDoc(), original);
  }
});

test('binary controls, UTF-16 and invalid UTF-8 are rejected before editing', () => {
  for (const buffer of [new Uint8Array([0, 1, 2]).buffer, new Uint8Array([0xff, 0xfe, 65, 0]).buffer, new Uint8Array([0xc3, 0x28]).buffer]) {
    assert.throws(() => decodeText(buffer));
  }
  assert.throws(() => decodeText(new ArrayBuffer(MAX_FILE_BYTES + 1)), /20 MB/);
});

test('extension parsing handles case, dots, duplicates and rejects paths', () => {
  assert.deepEqual(parseExtensions('.JSON, py; PY\nconfig ../exe ** .'), ['json', 'py', 'config']);
  assert.equal(extensionOf('folder/data.JSON'), 'json');
  assert.equal(extensionOf('folder.ext/Makefile'), '');
  assert.equal(extensionOf('.env'), 'env');
});

test('atomic saves refuse to overwrite an external edit, including binary changes', () => {
  assert.equal(checkedUpdate('base', 'base', 'local'), 'local');
  assert.equal(checkedUpdate('local', 'base', 'local'), 'local');
  assert.throws(() => checkedUpdate('external', 'base', 'local'), TextConflictError);
  assert.throws(() => checkedUpdate('\0binary', 'base', 'local'), /binary/);
  assert.equal(checkedUpdate('', '', 'new text'), 'new text');
});

test('recovery copies preserve extension and folder for dotted and extensionless files', () => {
  assert.equal(conflictCopyPath('folder/data.json', '123'), 'folder/data (local copy 123).json');
  assert.equal(conflictCopyPath('folder.ext/Makefile', '123'), 'folder.ext/Makefile (local copy 123)');
  assert.equal(conflictCopyPath('.env', '123'), '.env (local copy 123)');
});
