// One-off: renders dist/favicon.svg to the PNG sizes Chrome requires for extension icons.
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE || join(homedir(), '.npm-global/lib/node_modules/@playwright/cli/node_modules/playwright-core'));
const svg = readFileSync(new URL('../dist/favicon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
for (const size of [16, 48, 128]) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`);
  writeFileSync(new URL(`../extension/icons/icon${size}.png`, import.meta.url), await page.screenshot({ omitBackground: true, type: 'png' }));
}
await browser.close();
console.log('icons written');
