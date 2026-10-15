import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsvPreview, CSV_PREVIEW_CHAR_LIMIT } from '../src/csv.ts';

test('CSV quotes, escaped quotes, embedded separators and multiline values remain literal', () => {
  const source = '\uFEFFname,note,empty\r\n"Málaga","a,b;\t| **bold** <b>x</b> ""quoted""",\r\n"two\r\nlines",42,end';
  assert.deepEqual(parseCsvPreview(source), { rows: [
    ['name', 'note', 'empty'],
    ['Málaga', 'a,b;\t| **bold** <b>x</b> "quoted"', ''],
    ['two\r\nlines', '42', 'end'],
  ], truncated: false });
});

test('automatic detection ignores quoted punctuation and manual separators override detection', () => {
  assert.deepEqual(parseCsvPreview('"a,b,c";value\nDavid;12,50').rows, [['a,b,c', 'value'], ['David', '12,50']]);
  assert.deepEqual(parseCsvPreview('name\tcity\nDavid\tMadrid').rows, [['name', 'city'], ['David', 'Madrid']]);
  assert.deepEqual(parseCsvPreview('a,b;c\n1,2;3', 'semicolon').rows, [['a,b', 'c'], ['1,2', '3']]);
  assert.deepEqual(parseCsvPreview('a;b\n1;2', 'comma').rows, [['a;b'], ['1;2']]);
  assert.deepEqual(parseCsvPreview('a,b\tc', 'tab').rows, [['a,b', 'c']]);
});

test('empty files, blank rows, uneven rows, final separators and line endings are handled', () => {
  assert.deepEqual(parseCsvPreview('').rows, []);
  assert.deepEqual(parseCsvPreview('\uFEFF').rows, []);
  assert.deepEqual(parseCsvPreview('""').rows, [['']]);
  for (const eol of ['\n', '\r\n', '\r']) {
    assert.deepEqual(parseCsvPreview(`a,b${eol}${eol}one${eol}x,y,${eol}`).rows, [['a', 'b'], [''], ['one'], ['x', 'y', '']]);
  }
});

test('malformed quoting is reported instead of silently displaying incorrect cells', () => {
  for (const source of ['a,"unfinished', 'a,b"c', '"a"after,b', '"a""']) assert.throws(() => parseCsvPreview(source), /quot/i);
});

test('previews bound rows, columns and scanned text without returning partial records', () => {
  assert.equal(parseCsvPreview('a,b\n'.repeat(500)).truncated, false);
  const manyRows = parseCsvPreview('a,b\n'.repeat(100_000));
  assert.equal(manyRows.rows.length, 500);
  assert.equal(manyRows.truncated, true);
  const manyColumns = parseCsvPreview(Array.from({ length: 200 }, (_, i) => i).join(','));
  assert.equal(manyColumns.rows[0].length, 100);
  assert.equal(manyColumns.truncated, true);
  const longCell = parseCsvPreview('a,b\n"' + 'x'.repeat(CSV_PREVIEW_CHAR_LIMIT));
  assert.deepEqual(longCell.rows, [['a', 'b']]);
  assert.equal(longCell.truncated, true);
});
