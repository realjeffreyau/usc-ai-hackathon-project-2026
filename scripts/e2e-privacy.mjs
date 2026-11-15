// Real-browser checks using fictional data only. SHOTS_DIR captures the actual demo UI for documentation.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { start } from './serve.mjs';
import { browserTools, chromePath, storageState } from './browser-support.mjs';
import { fictionalAudit, makePdf } from '../tests/pdf-fixture.mjs';
const { chromium } = browserTools();
const server = process.env.QA_BASE_URL ? null : await start(0);
const origin = process.env.QA_BASE_URL ? new URL(process.env.QA_BASE_URL).origin : `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: chromePath() });
const context = await browser.newContext({ viewport: { width: 1600, height: 1050 }, serviceWorkers: 'block' });
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
const requests = [], problems = [], failures = [];
context.on('request', r => requests.push({ url: r.url(), method: r.method(), body: r.postData() }));
context.on('response', r => { if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`); });
const page = await context.newPage();
page.setDefaultTimeout(10000);
page.on('pageerror', e => problems.push(e.message));
page.on('console', m => { if (['warning', 'error'].includes(m.type()) && !/Indexing all PDF objects|standardFontDataUrl|Unable to create a text session because the service is not running/.test(m.text())) problems.push(m.text()); });
let checks = 0;
const ok = message => console.log(`PASS ${++checks}: ${message}`);
const waitText = (selector, text) => page.locator(selector).filter({ hasText: text }).waitFor();
async function shot(name) {
  if (!process.env.SHOTS_DIR) return;
  mkdirSync(process.env.SHOTS_DIR, { recursive: true });
  await page.waitForFunction(() => !document.getElementById('trojan-planner-host').shadowRoot.querySelector('.toast')?.textContent);
  await page.evaluate(() => { window.scrollTo(0, 0); document.getElementById('trojan-planner-host').shadowRoot.querySelector('.body').scrollTo(0, 0); });
  if (name === 'semester-plan') {
    await page.locator('.card').filter({ has: page.locator('.cal') }).screenshot({ path: join(process.env.SHOTS_DIR, `${name}.png`) });
  } else {
    await page.screenshot({ path: join(process.env.SHOTS_DIR, `${name}.png`), fullPage: name === 'four-year-plan' });
  }
}
try {
  await page.goto(origin);
  await waitText('.programs summary', /Biomedical Engineering/);
  assert.equal(await page.title(), 'TroyPlan');
  const progress = await page.locator('#tp-view-progress').innerText();
  for (const text of ['fictional profile', '128', '62', '14', '52', 'Remaining', 'In progress', 'Complete']) assert.ok(progress.includes(text), text);
  assert.equal(await page.getByRole('tab').count(), 3);
  ok('fictional audit, separate unit totals, catalogue program, and three main tabs');
  await shot('degree-progress');
  await page.locator('#tp-tab-four').click();
  await waitText('#tp-view-four', /course order and prerequisites/);
  assert.ok(await page.locator('.bcard').count() > 10);
  await page.locator('.bcard').filter({ hasText: 'MATH 245' }).first().click();
  await page.locator('#bd-head').waitFor();
  assert.match(await page.locator('.bdetail').innerText(), /Prerequisites/);
  await page.locator('.bdetail').getByRole('button', { name: 'Close', exact: true }).click();
  ok('four-year board shows catalogue courses and inspectable prerequisite details');
  await shot('four-year-plan');
  await page.locator('#tp-tab-progress').click();
  await page.locator('[data-fk="find-GE-B_Humanistic_Inquiry"]').click();
  await page.locator('#tp-prompt').fill('Find me a GE-B with a highly rated professor, no classes before 10, and keep me at 16 units or less');
  await page.locator('[data-fk=build]').click();
  await page.locator('.geres').first().waitFor();
  await page.waitForFunction(() => document.getElementById('trojan-planner-host').shadowRoot.querySelector('[data-fk=ge-start]')?.value === '600');
  assert.equal(await page.locator('[data-fk=ge-start]').inputValue(), '600');
  assert.equal(await page.locator('[data-fk=ge-units]').inputValue(), '16');
  assert.match(await page.locator('.geres').first().innerText(), /Stories That Shaped Cities[\s\S]*Sample rating/);
  ok('goal interpretation, editable preferences, and explicitly fictional instructor ranking');
  await shot('ge-finder');
  await page.locator('.geres').first().getByRole('button', { name: 'Add to plan', exact: true }).click();
  await page.locator('[data-fk=sub-schedule]').click();
  await waitText('#tp-sum-h', /12 units.*no conflicts/);
  await page.locator('[data-fk=compare]').click();
  await page.locator('[data-fk=load-bin]').click();
  await waitText('#tp-sum-h', /conflict/);
  assert.ok(await page.locator('.ev.conflict').count() > 0);
  await page.getByRole('button', { name: 'Swap section', exact: true }).first().click();
  await waitText('#tp-sum-h', /no conflicts/);
  assert.equal(await page.locator('.ev.conflict').count(), 0);
  ok('GE addition, calendar conflict from sample myCourseBin, and a conflict-clearing section swap');
  await page.locator('[data-fk=copy]').click();
  assert.match(await page.evaluate(() => navigator.clipboard.readText()), /^\d{5}(?: \d{5})*$/);
  ok('section numbers copied only by an explicit click');
  await shot('semester-plan');
  await page.locator('#tp-tab-progress').click();
  await page.getByRole('button', { name: 'Find courses for Pre-Major Requirements · Math Requirement', exact: true }).click();
  await page.locator('.plancard').first().waitFor();
  assert.equal(await page.locator('[data-fk=sub-schedule]').getAttribute('aria-selected'), 'true');
  ok('returning from GE Finder to a degree requirement opens the schedule correctly');
  await page.locator('[data-fk=compare]').click();
  await page.locator('#tp-bin').fill('99999');
  await page.locator('#tp-compare-body').getByRole('button', { name: /Check/ }).click();
  await waitText('#tp-view-plan', /outside the snapshot|not in the snapshot/i);
  ok('myCourseBin IDs outside the snapshot are flagged');
  await page.locator('#tp-tab-progress').click();
  await page.getByRole('button', { name: 'Switch', exact: true }).click();
  await page.getByRole('button', { name: 'Import STARS report instead', exact: true }).click();
  await page.locator('#tp-file').setInputFiles({ name: 'invalid.pdf', mimeType: 'application/pdf', buffer: Buffer.from('invalid') });
  await waitText('#tp-view-progress', /could not be read as a PDF/);
  ok('invalid PDF rejected without uploading it');
  await page.locator('#tp-file').setInputFiles({ name: 'fictional-audit.pdf', mimeType: 'application/pdf', buffer: makePdf(fictionalAudit) });
  await waitText('#tp-view-progress', /Imported audit/);
  await page.locator('[data-fk=confirm]').waitFor();
  assert.equal(await page.locator('#tp-file').count(), 0);
  ok('fictional PDF parsed locally; credit hints need confirmation and import fields are removed');
  await page.getByRole('button', { name: 'Switch', exact: true }).click();
  await page.getByRole('button', { name: 'Import STARS report instead', exact: true }).click();
  await page.locator('#tp-paste').fill('NO UNMET REQUIREMENT <script>alert(1)</script>');
  await page.getByRole('button', { name: 'Read pasted text', exact: true }).click();
  await waitText('#tp-view-progress', /<script>alert\(1\)<\/script>/);
  assert.equal(await page.locator('#tp-view-progress script').count(), 0);
  ok('hostile imported markup renders as text');
  assert.deepEqual(await storageState(page), { local: 0, session: 0, cookies: '', databases: [], caches: [] });
  assert.ok(requests.every(r => new URL(r.url).origin === origin && r.method === 'GET' && !r.body && !r.url.includes('FICTIONAL-MARKER') && !r.url.includes('fictional-audit')));
  assert.deepEqual(failures, []); assert.deepEqual(problems, []);
  ok('no report data in requests, no browser persistence, no failed requests or browser errors');
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    for (const id of ['progress', 'four', 'plan']) {
      await page.locator(`#tp-tab-${id}`).click();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px ${id} page overflow`);
    }
  }
  ok('main views fit mobile and tablet widths');
  console.log(`${checks} browser checks passed.`);
} finally {
  await context.close(); await browser.close(); if (server) { server.closeAllConnections(); await new Promise(r => server.close(r)); }
}
