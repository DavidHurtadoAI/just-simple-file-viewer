# Local verification

Verified on 2026-10-15: the initial editor was tested in Obsidian 1.13.4 and 1.14.4. Version 0.1.1 passed all 43 live checks in an isolated 1.14.4 desktop vault; the development vault also runs 1.14.4.

`npm run check` covers ESLint with no warnings, strict TypeScript, six unit tests, the production build and the bundle audit. `npm audit` reported zero vulnerabilities.

For 0.1.2, the CSS specificity change was checked live in the development vault: content padding remained zero and the root retained the same full-height bounds. The release audit now rejects `!important` declarations in `styles.css`.

`integration.js` runs 26 checks in Obsidian: actual source editing and disk persistence, highlighting, search controls, line numbers and wrapping, UTF-8 BOM and CRLF, clean external reload, conflict protection, recovery copies on close, binary rejection, unknown extensions and extensionless files, native Markdown handling and viewport rendering of a 120,000-line file.

`advanced.js` runs seven additional checks: edits during an in-flight save, absence of false conflicts from our own writes, immediate saving on close, settings rendering, live settings changes, saving on plugin disable and editor cleanup.

`open-path.js` runs ten checks for 0.1.1: opening the path dialog without requesting a vault file list, missing and outside paths, exact Unicode paths, unknown extensions, active-file prefill, extensionless files, binary rejection, and Enter/Escape handling. The release audit also rejects vault-wide enumeration in the shipped bundle and unsupported ZIP assets in the release workflow.

On the 0.1.1 release candidate run, the approximately 4.8 MiB fixture opened in 125 ms and saved in 133 ms. These are individual local measurements, not comparisons with other plugins or guaranteed device performance. Only a small viewport was rendered.

The tests connect to a separately launched Obsidian instance on local debugging port 9224. Its user profile is `qa/.runtime` and its vault is `qa/.vault`; both are ignored. `run.mjs` requires Node 22+ with built-in WebSocket support:

```sh
node qa/run.mjs qa/enable.js
node qa/run.mjs qa/reload.js
node qa/run.mjs
node qa/run.mjs qa/advanced.js
node qa/run.mjs qa/open-path.js
```

The test scripts create their own uniquely named fixtures. The main run writes `qa/results.json` and `qa/editor.png`. The isolated vault must contain the built `main.js`, `manifest.json` and `styles.css` in its plugin folder. Its community plugins must be enabled.

Mobile, legacy encodings, files above 20 MiB and full language-server behavior are outside this verification.
