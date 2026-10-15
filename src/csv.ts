export type CsvDelimiter = 'auto' | 'comma' | 'semicolon' | 'tab';
export const CSV_PREVIEW_CHAR_LIMIT = 1_048_576;
export const CSV_PREVIEW_ROW_LIMIT = 500;
export const CSV_PREVIEW_COLUMN_LIMIT = 100;

export interface CsvPreview {
  rows: string[][];
  truncated: boolean;
}

function detectDelimiter(text: string): string {
  const counts = new Map([ [',', 0], [';', 0], ['\t', 0] ]);
  let quoted = false;
  // Only inspect the first logical record; quoted delimiters do not count.
  for (let i = 0; i < Math.min(text.length, 65_536); i++) {
    const char = text[i]!;
    if (char === '"') {
      if (quoted && text[i + 1] === '"') i++;
      else quoted = !quoted;
    } else if (!quoted) {
      if (char === '\n' || char === '\r') break;
      if (counts.has(char)) counts.set(char, counts.get(char)! + 1);
    }
  }
  return [...counts].reduce((best, candidate) => candidate[1] > best[1] ? candidate : best)[0];
}

/** A bounded, literal-text preview. Never changes or serializes the source CSV. */
export function parseCsvPreview(text: string, option: CsvDelimiter = 'auto'): CsvPreview {
  const delimiter = option === 'auto' ? detectDelimiter(text)
    : option === 'semicolon' ? ';' : option === 'tab' ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let closedQuote = false;
  let truncated = false;
  const limit = Math.min(text.length, CSV_PREVIEW_CHAR_LIMIT);
  const fieldEnd = (): void => {
    if (row.length < CSV_PREVIEW_COLUMN_LIMIT) row.push(field);
    else truncated = true;
    field = '';
    closedQuote = false;
  };
  for (let i = text.startsWith('\uFEFF') ? 1 : 0; i < limit; i++) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"' && i + 1 < limit) {
          if (row.length < CSV_PREVIEW_COLUMN_LIMIT) field += '"';
          i++;
        } else { quoted = false; closedQuote = true; }
      } else if (row.length < CSV_PREVIEW_COLUMN_LIMIT) field += char;
    } else if (char === delimiter) {
      fieldEnd();
    } else if (char === '\r' || char === '\n') {
      fieldEnd();
      rows.push(row);
      row = [];
      if (char === '\r' && text[i + 1] === '\n') i++;
      if (rows.length === CSV_PREVIEW_ROW_LIMIT) return { rows, truncated: truncated || i + 1 < text.length };
    } else if (char === '"' && !field && !closedQuote) {
      quoted = true;
    } else {
      if (char === '"' || closedQuote) throw new Error('Invalid CSV quoting. Switch to text to inspect or edit the source.');
      if (row.length < CSV_PREVIEW_COLUMN_LIMIT) field += char;
    }
  }
  // Discard an incomplete record at the size limit rather than showing partial data.
  if (text.length > limit) return { rows, truncated: true };
  if (quoted) throw new Error('Unclosed CSV quote. Switch to text to inspect or edit the source.');
  const content = text.startsWith('\uFEFF') ? text.slice(1) : text;
  if (row.length || field || closedQuote || (content && !/[\r\n]$/.test(content))) {
    fieldEnd();
    rows.push(row);
  }
  return { rows, truncated };
}
