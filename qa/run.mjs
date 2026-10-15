import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const tabs = await (await fetch('http://127.0.0.1:9224/json/list')).json();
const tab = tabs.find(x => x.type === 'page' && x.url.includes('index.html'));
if (!tab) throw new Error('Isolated test vault not found on port 9224');
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let id = 0;
const pending = new Map();
ws.onmessage = event => {
  const data = JSON.parse(event.data);
  if (data.method === 'Runtime.consoleAPICalled' && data.params.type === 'error') {
    console.error(data.params.args.map(x => x.description ?? x.value).join(' '));
  }
  if (data.id) {
    const request = pending.get(data.id);
    if (request) { pending.delete(data.id); clearTimeout(request.timeout); data.error ? request.reject(data.error) : request.resolve(data.result); }
  }
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const requestId = ++id;
  const timeout = setTimeout(() => { pending.delete(requestId); reject(new Error(`Timed out: ${method}`)); }, 45000);
  pending.set(requestId, { resolve, reject, timeout });
  ws.send(JSON.stringify({ id: requestId, method, params }));
});
try {
  await send('Runtime.enable');
  if (process.argv[3]) await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 850, deviceScaleFactor: 1, mobile: false });
  const expression = await readFile(process.argv[2] ?? 'qa/integration.js', 'utf8');
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  console.log(JSON.stringify(result.result.value, null, 2));
  if (!process.argv[2] || process.argv[3]) {
    const imagePath = process.argv[3] ?? 'qa/editor.png';
    await mkdir(dirname(imagePath), { recursive: true });
    if (!process.argv[2]) await writeFile('qa/results.json', JSON.stringify(result.result.value, null, 2));
    const clip = result.result.value?.screenshotClip;
    const screenshot = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip } : {}) });
    await writeFile(imagePath, Buffer.from(screenshot.data, 'base64'));
  }
} finally { ws.close(); }
