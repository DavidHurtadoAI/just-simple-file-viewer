# Local verification

Verified on 2026-10-15 in Obsidian 1.13.4 and 1.14.4. The release candidate was rechecked in an isolated 1.14.4 desktop vault; the development vault also runs 1.14.4.

`npm run check` covers ESLint with no warnings, strict TypeScript, six unit tests, the production build and the bundle audit. `npm audit` reported zero vulnerabilities.

`integration.js` runs 26 checks in Obsidian: actual source editing and disk persistence, highlighting, search controls, line numbers and wrapping, UTF-8 BOM and CRLF, clean external reload, conflict protection, recovery copies on close, binary rejection, unknown extensions and extensionless files, native Markdown handling and viewport rendering of a 120,000-line file.

`advanced.js` runs seven additional checks: edits during an in-flight save, absence of false conflicts from our own writes, immediate saving on close, settings rendering, live settings changes, saving on plugin disable and editor cleanup.

On the release candidate run, the approximately 4.8 MiB fixture opened in 228 ms and saved in 286 ms. These are individual local measurements, not comparisons with other plugins or guaranteed device performance. Only a small viewport was rendered.

The tests connect to a separately launched Obsidian instance on local debugging port 9224. Its user profile is `qa/.runtime` and its vault is `qa/.vault`; both are ignored. `run.mjs` requires Node 22+ with built-in WebSocket support:

```sh
node qa/run.mjs qa/enable.js
node qa/run.mjs qa/reload.js
node qa/run.mjs
node qa/run.mjs qa/advanced.js
```

The test scripts create their own uniquely named fixtures. The main run writes `qa/results.json` and `qa/editor.png`. The isolated vault must contain the built `main.js`, `manifest.json` and `styles.css` in its plugin folder. Its community plugins must be enabled.

Mobile, legacy encodings, files above 20 MiB and full language-server behavior are outside this verification.
