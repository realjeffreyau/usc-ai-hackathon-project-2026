import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
const require = createRequire(import.meta.url);
export function browserTools() {
  for (const name of [process.env.PLAYWRIGHT_CORE, 'playwright-core', 'playwright', join(homedir(), '.npm-global/lib/node_modules/@playwright/cli/node_modules/playwright-core')].filter(Boolean)) {
    try { return require(name); } catch { /* try another installed package */ }
  }
  throw new Error('Install Playwright separately and set PLAYWRIGHT_CORE to its package directory.');
}
export function chromePath() {
  if (process.env.CHROME_PATH || process.env.CHROMIUM_PATH) return process.env.CHROME_PATH || process.env.CHROMIUM_PATH;
  const cached = join(homedir(), 'Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
  return existsSync(cached) ? cached : undefined;
}
export async function storageState(page) {
  return page.evaluate(async () => ({ local: localStorage.length, session: sessionStorage.length, cookies: document.cookie, databases: await indexedDB.databases(), caches: await caches.keys() }));
}
