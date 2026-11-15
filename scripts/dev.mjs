// Dev loop: serves dist/ on http://127.0.0.1:8080 (no-store, so a refresh always shows the latest files) and
// copies the shared modules into extension/src/ whenever dist/ changes. Reload the extension in chrome://extensions
// after a sync (Chrome cannot be reloaded from here). Run: npm run dev
import { watch } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const build = fileURLToPath(new URL('./build-extension.mjs', import.meta.url));
try {
  const server = await start();
  console.log(`Local site: http://127.0.0.1:${server.address().port}  (refresh to see changes)`);
} catch (error) {
  if (error.code !== 'EADDRINUSE') throw error;
  console.log('Local site already running on http://127.0.0.1:8080 (it serves files fresh, refresh to see changes)');
}

let timer;
watch(dist, { recursive: true }, (_event, name) => {
  if (!name || name.startsWith('vendor')) return;
  console.log(`[dev] changed: ${name}`);
  if (!/\.(js)$/.test(name)) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    try { execFileSync(process.execPath, [build], { stdio: 'inherit' }); console.log('[dev] extension/src synced. Reload the extension in chrome://extensions.'); }
    catch { console.log('[dev] extension sync failed'); }
  }, 150);
});
