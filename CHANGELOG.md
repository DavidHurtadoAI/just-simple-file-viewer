# Changelog

## 0.3.0

- Use Obsidian's configured text font, monospace font and text size in the source editor and CSV table preview.
- Choose fonts automatically by file type: monospace for code and configuration, standard text for prose, logs and CSV/TSV.
- Add a **Font** setting to force the standard or monospace font for every file; open tabs update immediately.

## 0.2.1

- Clarify in the README that the CSV table view is read-only and editing requires **Edit as text**, which edits the original CSV source.
- Documentation-only update; plugin behavior is unchanged.

## 0.2.0

- Preview CSV files as tables using Obsidian's Markdown table styles; switch to text for editing without converting the file.
- Configure the default CSV view, automatic or manual separator, and first-row headings.
- Handle quoted separators, escaped quotes and multiline cells as literal text.
- Bound previews to 500 rows, 100 columns and 1,048,576 source characters to keep them responsive; the full file remains editable as text.

## 0.1.2

- Replace the content-padding `!important` override with a more specific selector scoped to this plugin's file view, preserving the edge-to-edge editor layout.
- Reject `!important` declarations in the release audit.

## 0.1.1

- Open a specific vault-relative file path from the command palette without enumerating the vault. Explorer and context-menu opening continue to work as before.
- Publish only the three assets consumed by Obsidian: `main.js`, `manifest.json` and `styles.css`.
- Include the plugin and syntax-parser license notices directly in the JavaScript asset.

## 0.1.0

- First version: lightweight text editing in native Obsidian tabs.
- Selected syntax parsers, search and replace, line numbers, wrapping and automatic saving.
- UTF-8/BOM and line-ending preservation, binary checks and conflict recovery copies.
