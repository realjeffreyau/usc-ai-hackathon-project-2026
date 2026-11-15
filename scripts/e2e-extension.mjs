// Real-Chrome test of the unpacked TroyPlan extension. WebReg is simulated at its real URL (https://webreg.usc.edu/) by a
// route that returns a fictional page, so the content script injects exactly as it would on the real site.
// Optional: REAL_WEBREG=1 also loads the real, signed-out https://webreg.usc.edu/Login (GET only, no credentials).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fictionalAudit, makePdf } from '../tests/pdf-fixture.mjs';
import { coursebinHtml, coursesListHtml } from '../tests/mock-coursebin.mjs';

const require = createRequire(import.meta.url);
const candidates = [process.env.PLAYWRIGHT_CORE, join(homedir(), '.npm-global/lib/node_modules/@playwright/cli/node_modules/playwright-core'), 'playwright-core', 'playwright'].filter(Boolean);
let chromium;
for (const name of candidates) { try { ({ chromium } = require(name)); break; } catch { /* next */ } }
if (!chromium) throw new Error('playwright-core not found. Set PLAYWRIGHT_CORE=/path/to/playwright-core');
const chrome = process.env.CHROME_PATH || join(homedir(), 'Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const extensionDir = fileURLToPath(new URL('../extension/', import.meta.url));
const shots = process.env.SHOTS_DIR;
if (shots) mkdirSync(shots, { recursive: true });

// A fictional stand-in for WebReg with deliberately hostile global CSS and a fake Register button.
const MOCK = `<!doctype html><html><head><meta charset="utf-8"><title>WebReg mock (fictional)</title>
<style>*{font-family:"Comic Sans MS",cursive!important;color:lime!important}button,select,input,a{all:revert!important;background:lime!important;border-radius:0!important}
body{margin:0;background:#eee} h1,h2,h3{font-size:60px!important}</style></head>
<body><h1>WebReg</h1><button id="register" onclick="window.__registerClicked=true">Register</button><button id="pay" onclick="window.__registerClicked=true">Add class</button></body></html>`;

let step = 0;
const ok = message => console.log(`  ✓ ${String(++step).padStart(2, '0')} ${message}`);
const requests = [];
const problems = [];
const IGNORED = /Indexing all PDF objects|standardFontDataUrl|Unable to create a text session/;

const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'tp-ext-')), {
  executablePath: chrome, headless: false, viewport: { width: 1280, height: 900 }, acceptDownloads: false,
  args: ['--headless=new', `--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`, '--no-first-run'],
});
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://webreg.usc.edu' });
await context.route('https://webreg.usc.edu/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: ({ '/CourseBin': coursebinHtml, '/Courses': coursesListHtml })[new URL(route.request().url()).pathname]?.() ?? MOCK }));
context.on('request', request => requests.push({ url: request.url(), method: request.method(), body: request.postData() }));
const watch = page => { page.on('console', message => { if (['error', 'warning'].includes(message.type()) && !IGNORED.test(message.text())) problems.push(message.text()); }); page.on('pageerror', error => problems.push('pageerror: ' + error.message)); return page; };
const shot = async (page, name) => { if (shots) await page.screenshot({ path: join(shots, name + '.png') }); };
const setWidth = (page, width) => page.evaluate(w => document.getElementById('trojan-planner-host').shadowRoot.querySelector('.tp').style.setProperty('--panel-w', `${w}px`), width);
const isOpen = page => page.waitForFunction(() => document.getElementById('trojan-planner-host').shadowRoot.querySelector('.panel').classList.contains('open'));
const activeKey = page => page.evaluate(() => document.getElementById('trojan-planner-host').shadowRoot.activeElement?.getAttribute('data-fk'));
const toastText = page => page.locator('.toast').innerText();

try {
  console.log('Install, launcher and shell');
  const page = watch(await context.newPage());
  await page.goto('https://webreg.usc.edu/Home');
  await page.waitForSelector('#trojan-planner-host', { state: 'attached', timeout: 10000 });
  assert.equal(await page.locator('#trojan-planner-host').count(), 1);
  const launcher = page.locator('.launcher');
  await launcher.waitFor({ state: 'visible' });
  assert.match(await launcher.innerText(), /TroyPlan/);
  const css = await page.evaluate(() => {
    const root = document.getElementById('trojan-planner-host').shadowRoot, style = getComputedStyle(root.querySelector('.launcher'));
    return { bg: style.backgroundColor, font: style.fontFamily, pageButton: getComputedStyle(document.getElementById('register')).backgroundColor };
  });
  assert.equal(css.bg, 'rgb(143, 29, 44)');
  assert.ok(!/Comic/.test(css.font));
  assert.equal(css.pageButton, 'rgb(0, 255, 0)');
  ok('extension loads; one "TroyPlan" launcher on webreg.usc.edu; styles isolated from hostile WebReg CSS');

  await launcher.click();
  await isOpen(page);
  assert.equal(await page.locator('#register').isVisible(), true, 'WebReg stays visible and usable');
  assert.match(await page.locator('.head').innerText(), /TroyPlan/);
  assert.equal(await page.locator('.head [data-fk=close]').getAttribute('aria-label'), 'Close TroyPlan');
  const website = page.locator('.head a.headlink');
  assert.match(await website.getAttribute('href'), /^https:\/\/troyplan\.vercel\.app\/$/);
  assert.equal(await website.getAttribute('target'), '_blank');
  assert.deepEqual(await page.locator('.tabs .tab').allInnerTexts(), ['Degree Progress', 'Plan Semester']);
  ok('compact header (TroyPlan, data label, Open website, Close) and exactly two tabs: Degree Progress and Plan Semester');

  await page.locator('[data-fk=mode-toggle]').click();
  await page.waitForSelector('.datapill.demo');
  await page.waitForSelector('.programs summary:has-text("Biomedical Engineering (BS)")', { timeout: 15000 });
  assert.equal(await page.locator('.datapill').count(), 1);
  assert.equal(await page.locator('.databar, .banner').count(), 0);
  const mentions = await page.evaluate(() => (document.getElementById('trojan-planner-host').shadowRoot.querySelector('.panel').innerText.match(/demo data/gi) ?? []).length);
  assert.equal(mentions, 1, '"Demo data" appears once');
  ok('"Demo data" is one small label in the header (it is also the Demo/Live switch), not a banner or repeated text');
  await shot(page, 'd01-progress');

  console.log('Degree Progress with real catalogue requirements');
  const groups = await page.locator('#tp-req-h').locator('xpath=..').innerText();
  assert.match(groups, /GE-B Humanistic Inquiry/);
  assert.match(groups, /Math Requirement/);
  assert.match(groups, /Major Requirements · Biomedical Engineering/);
  const fy = page.locator('.fylink a');
  assert.match(await fy.getAttribute('href'), /#four-year$/);
  assert.equal(await fy.getAttribute('target'), '_blank');
  ok('requirements come from the bundled USC Catalogue (Biomedical Engineering BS); the drawer links to the full Four-Year Plan on the website');

  console.log('GE Finder to schedule');
  await page.locator('.req:has-text("GE-B Humanistic Inquiry") button:has-text("Find courses")').click();
  await page.waitForSelector('.geres');
  assert.equal(await page.locator('[data-fk=ge-cat]').inputValue(), 'GE-B');
  await page.locator('#tp-prompt').fill('Find me a GE-B with a highly rated professor, no classes before 10, and keep me at 16 units or less');
  await page.locator('#tp-prompt').press('Enter');
  await page.waitForFunction(() => document.getElementById('trojan-planner-host').shadowRoot.querySelector('[data-fk=ge-start]')?.value === '600');
  const best = page.locator('.geres').first();
  assert.match(await best.innerText(), /Stories That Shaped Cities/);
  await best.locator('button:has-text("Add to plan")').click();
  await page.waitForSelector('.plancard');
  assert.equal(await page.locator('[data-fk=sub-schedule]').getAttribute('aria-selected'), 'true');
  assert.equal(await activeKey(page), 'card-HMNT-215', 'focus lands on the new course card');
  ok('Find courses next to an unmet GE opens the GE Finder; Add to plan lands on that course\'s card in the schedule');

  console.log('Schedule list');
  assert.match(await page.locator('#tp-sum-h').innerText(), /Spring 2027 · 12 units · no conflicts/);
  const card = page.locator('.plancard:has-text("HMNT 215")');
  const cardText = await card.innerText();
  assert.match(cardText, /Stories That Shaped Cities/);
  assert.match(cardText, /4 units/);
  assert.match(cardText, /Counts toward\s*GE-B Humanistic Inquiry/);
  assert.equal(await card.locator('.secrow').count(), 1, 'one compact row per required section');
  assert.match(await card.locator('.secrow').innerText(), /Lecture\s*98215\s*Mon\/Wed 4:30 PM - 5:45 PM/);
  assert.equal(await card.locator('details.more').getAttribute('open'), null);
  assert.ok(!/reviews|Rate My Professors|seats open/.test(cardText), 'ratings, review counts, seats and links are collapsed under Section details');
  await card.locator('summary:has-text("Section details")').click();
  const detail = await card.innerText();
  assert.equal((detail.match(/Ellis Marlowe/g) ?? []).length, 1, 'a shared instructor appears once per card');
  assert.match(detail, /52 reviews/);
  assert.match(detail, /Sample rating/);
  assert.match(detail, /seats open/);
  assert.equal(await card.locator('a[href^="https://www.ratemyprofessors.com/"]').count(), 1);
  assert.equal(await page.locator('.plancard.reg').count(), 2, 'registered classes are listed, quieter');
  await card.locator('summary:has-text("Section details")').click();
  ok('summary line, one card per course (requirement, one row per required section); instructor, rating, reviews, seats and link live under Section details');
  await shot(page, 'd02-schedule');

  console.log('Compare, conflict, swap, copy');
  await page.locator('[data-fk=compare]').click();
  assert.equal(await page.locator('[data-fk=compare]').getAttribute('aria-expanded'), 'true');
  await page.locator('[data-fk=load-bin]').click();
  await page.waitForSelector('.plancard.has-conflict');
  assert.match(await page.locator('#tp-sum-h').innerText(), /Spring 2027 · 12 units · 1 conflict/);
  assert.match(await page.locator('.overlaps').innerText(), /HMNT 215 \(98215\) overlaps SOCI 150 \(99150\) on Mon\/Wed, 4:30 PM - 5:20 PM/);
  const hit = page.locator('.plancard.has-conflict');
  assert.match(await hit.innerText(), /Overlaps SOCI 150 \(99150\) on Mon\/Wed 4:30 PM - 5:20 PM/);
  assert.equal(await hit.locator('.secrow.bad .tag.bad').innerText(), 'Conflict');
  assert.equal(await page.locator('[data-fk=compare]').getAttribute('aria-expanded'), 'false', 'the compare control collapses after loading');
  assert.match(await page.locator('#tp-tab-plan .count').innerText(), /1/);
  await shot(page, 'd03-conflict');
  await hit.locator('button:has-text("Swap section")').click();
  await page.waitForFunction(() => /no conflicts/.test(document.getElementById('trojan-planner-host').shadowRoot.querySelector('#tp-sum-h').textContent));
  assert.equal(await page.locator('.plancard.has-conflict').count(), 0);
  assert.equal(await activeKey(page), 'card-HMNT-215', 'focus stays on the swapped card');
  assert.match(await toastText(page), /HMNT 215 moved to 98216 \(Priya Danvers\)\. No conflicts\./);
  assert.equal(await page.locator('.toast').getAttribute('aria-live'), 'polite', 'the change is announced');
  assert.match(await page.locator('.plancard:has-text("HMNT 215") .secrow').innerText(), /98216/);
  ok('load sample myCourseBin from a small control; overlap shown above the list with when; Swap section on the affected card clears it, updates the count, keeps focus on that card and announces it');

  await page.locator('[data-fk=copy]').click();
  await page.waitForSelector('.ok-text[role=status]');
  assert.match(await page.locator('.ok-text[role=status]').innerText(), /Copied 1 section number: 98216/);
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), '98216');
  ok('Copy section numbers appears with a plan; a brief confirmation follows and the clipboard holds 98216');
  await shot(page, 'd04-swapped');

  console.log('Drawer widths');
  for (const width of [360, 400, 480]) {
    await setWidth(page, width);
    await page.waitForTimeout(200);
    const report = await page.evaluate(() => {
      const root = document.getElementById('trojan-planner-host').shadowRoot;
      const panel = root.querySelector('.panel').getBoundingClientRect();
      const body = root.querySelector('.body'), tabs = root.querySelector('.tabs').getBoundingClientRect();
      const first = root.querySelector('.view:not([hidden]) > *:not([hidden])')?.getBoundingClientRect();
      const close = root.querySelector('[data-fk=close]').getBoundingClientRect();
      const long = [...root.querySelectorAll('.pc-head h3')].filter(el => el.scrollWidth > el.clientWidth + 1).length;
      const wide = [...root.querySelectorAll('.body *')].filter(el => el.getBoundingClientRect().right > panel.right + 1 && getComputedStyle(el).position !== 'fixed' && !el.closest('details:not([open]) > :not(summary)')).length;
      return { overflow: body.scrollWidth - body.clientWidth, closeVisible: close.right <= panel.right + 1 && close.left >= panel.left, tabsBottom: tabs.bottom, firstTop: first?.top ?? 0, long, wide };
    });
    assert.equal(report.overflow <= 1, true, `${width}px horizontal overflow ${report.overflow}`);
    assert.equal(report.closeVisible, true, `${width}px Close button clipped`);
    assert.ok(report.firstTop >= report.tabsBottom - 1, `${width}px content overlaps the tabs`);
    assert.equal(report.long, 0, `${width}px long titles clipped`);
    assert.equal(report.wide, 0, `${width}px something extends past the drawer`);
  }
  ok('at 360, 400 and 480 px: no horizontal overflow, Close always visible, tabs never overlap the first card, long titles wrap, nothing clipped');

  console.log('Keyboard and focus');
  await setWidth(page, 440);
  await page.locator('#tp-tab-progress').click();
  await page.locator('#tp-tab-progress').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#tp-tab-plan').getAttribute('aria-selected'), 'true');
  assert.equal(await page.evaluate(() => document.getElementById('trojan-planner-host').shadowRoot.activeElement?.id), 'tp-tab-plan');
  await page.keyboard.press('Home');
  assert.equal(await page.locator('#tp-tab-progress').getAttribute('aria-selected'), 'true');
  await page.locator('#tp-tab-plan').click();
  const small = await page.evaluate(() => { const root = document.getElementById('trojan-planner-host').shadowRoot; return [...root.querySelectorAll('button, a[href], input, select, summary')].filter(el => el.offsetParent !== null && !el.closest('[hidden]') && (el.getBoundingClientRect().height < 24 || el.getBoundingClientRect().width < 24) && !el.classList.contains('sr') && el.type !== 'file').map(el => el.outerHTML.slice(0, 60)); });
  assert.deepEqual(small, [], 'every visible control is at least 24 by 24 px');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.getElementById('trojan-planner-host').shadowRoot.querySelector('.panel').classList.contains('open'));
  assert.equal(await page.evaluate(() => document.getElementById('trojan-planner-host').shadowRoot.activeElement?.className), 'launcher');
  await page.locator('.launcher').click();
  assert.equal(await page.locator('.plancard:has-text("HMNT 215")').count(), 1, 'closing and reopening keeps the plan');
  ok('arrow keys and Home move between tabs; controls are at least 24 px; Escape closes and returns focus to the launcher; the plan survives close and reopen');

  console.log('Safety');
  assert.equal(await page.evaluate(() => window.__registerClicked), undefined);
  const outside = requests.filter(r => !/^(https:\/\/webreg\.usc\.edu\/|chrome-extension:\/\/|data:|chrome:\/\/)/.test(r.url));
  assert.deepEqual(outside.map(r => r.url), []);
  assert.ok(requests.every(r => r.method === 'GET' && !r.body));
  ok(`no WebReg controls clicked; ${requests.length} requests, all GET to the page or the extension itself`);
  await page.evaluate(() => { document.body.innerHTML = '<p>WebReg re-rendered</p>'; });
  await page.waitForTimeout(150);
  assert.equal(await page.locator('#trojan-planner-host').count(), 1);
  await page.goto('https://webreg.usc.edu/Home');
  await page.waitForSelector('#trojan-planner-host', { state: 'attached' });
  assert.equal(await page.locator('#trojan-planner-host').count(), 1);
  ok('planner survives WebReg rebuilding its page and never duplicates on reload');

  console.log('STARS import in the drawer');
  await page.locator('.launcher').click();
  await page.waitForSelector('.datapill.live');
  await page.locator('button:has-text("Import STARS report instead")').click();
  await page.setInputFiles('#tp-file', { name: 'bad.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not a pdf') });
  await page.waitForFunction(() => /could not be read as a PDF/.test(document.getElementById('trojan-planner-host').shadowRoot.textContent));
  await page.setInputFiles('#tp-file', { name: 'fictional-audit.pdf', mimeType: 'application/pdf', buffer: makePdf(fictionalAudit) });
  await page.waitForSelector('.stats', { timeout: 20000 });
  const imported = await page.locator('.stats').innerText();
  for (const value of ['128', '66', '12', '50']) assert.ok(imported.includes(value), value);
  assert.match(await page.locator('.pending').innerText(), /not used for prerequisites until you confirm/);
  assert.deepEqual(requests.filter(r => !/^(https:\/\/webreg\.usc\.edu\/|chrome-extension:\/\/|data:)/.test(r.url)), []);
  ok('invalid PDF rejected; a fictional text PDF is read in the WebReg tab; credit hints wait for confirmation; nothing leaves the browser');

  console.log('Popup and demo page');
  let origin = (await context.serviceWorkers()[0]?.url())?.split('/').slice(0, 3).join('/');
  if (!origin) {
    const ext = await context.newPage();
    await ext.goto('chrome://extensions');
    origin = 'chrome-extension://' + await ext.evaluate(() => document.querySelector('extensions-manager').shadowRoot.querySelector('extensions-item-list').shadowRoot.querySelector('extensions-item').id);
    await ext.close();
  }
  const popup = await context.newPage();
  await popup.goto(`${origin}/popup.html`);
  assert.match(await popup.title(), /TroyPlan/);
  const [demoTab] = await Promise.all([context.waitForEvent('page'), popup.locator('#demo').click()]);
  watch(demoTab);
  await demoTab.waitForLoadState();
  await demoTab.waitForSelector('#trojan-planner-host', { state: 'attached' });
  await demoTab.waitForSelector('.panel.open');
  assert.ok(await demoTab.locator('.datapill.demo').count() === 1);
  ok('popup "Try demo" outside WebReg opens the rehearsal page with the sample student loaded');
  const popup2 = await context.newPage();
  await popup2.goto(`${origin}/popup.html`);
  const reply = await popup2.evaluate(async () => {
    const seen = [];
    for (const tab of await chrome.tabs.query({})) { try { const r = await chrome.tabs.sendMessage(tab.id, { type: 'trojan-planner:open', demo: true }); seen.push(r); if (r?.ok) return r; } catch { /* not a planner tab */ } }
    return { ok: false, seen };
  });
  assert.equal(reply.ok, true, JSON.stringify(reply));
  ok('popup message opens the drawer on the WebReg tab');

  console.log('Real myCourseBin page (fictional mock of the real markup)');
  const bin = watch(await context.newPage());
  await bin.goto('https://webreg.usc.edu/CourseBin');
  await bin.waitForSelector('.launcher');
  await bin.locator('.launcher').click();
  assert.equal(await bin.locator('#tp-tab-plan').getAttribute('aria-selected'), 'true');
  await bin.locator('[data-fk=read-bin]').click();
  await bin.waitForSelector('#tp-live-h');
  assert.match(await bin.locator('#tp-live-h').locator('xpath=../..').innerText(), /1 class registered \(4 units\)/);
  await bin.locator('#tp-prompt').fill('avoid classes before 10 am');
  await bin.locator('#tp-prompt').press('Enter');
  await bin.waitForFunction(() => /No classes before 10:00 AM/.test(document.getElementById('trojan-planner-host').shadowRoot.querySelector('.chips')?.textContent ?? ''));
  const rec = await bin.locator('#tp-rec-h').locator('xpath=..').innerText();
  assert.ok(!rec.includes('10001') && rec.includes('10002') && rec.includes('10003') && rec.includes('30001'));
  const marked = await bin.evaluate(() => [...document.querySelectorAll('[data-trojan-planner]')].map(el => el.id).sort());
  assert.deepEqual(marked, ['section_10002', 'section_10003', 'section_30001']);
  await bin.locator('[data-fk=copy]').click();
  await bin.waitForFunction(() => /Copied/.test(document.getElementById('trojan-planner-host').shadowRoot.textContent));
  assert.equal(await bin.evaluate(() => navigator.clipboard.readText()), '10002 10003 30001');
  await bin.locator('button:has-text("Show on page")').first().click();
  assert.deepEqual(await bin.evaluate(() => window.__clicks), [], 'nothing on the WebReg page was clicked');
  ok('real myCourseBin markup: saved classes read, registered ones locked, sections chosen from the saved ones, only those rows outlined, numbers copied, zero clicks on page links');
  await bin.close();

  console.log('Live mode on a course list (fictional mock)');
  const live = watch(await context.newPage());
  await live.goto('https://webreg.usc.edu/CourseBin');
  await live.waitForSelector('.launcher');
  await live.locator('.launcher').click();
  await live.locator('[data-fk=read-bin]').click();
  await live.waitForSelector('#tp-live-h');
  await live.goto('https://webreg.usc.edu/Courses?Program=QQQ');
  await live.waitForSelector('.launcher');
  await live.locator('.launcher').click();
  await live.locator('#tp-tab-plan').click();
  await live.locator('[data-fk=sub-ge]').click();
  assert.match(await live.locator('#tp-livege-h').locator('xpath=..').innerText(), /not read on this page/);
  await live.locator('button:has-text("Read this page")').click();
  await live.waitForSelector('.geres');
  const liveText = await live.locator('.geres').first().innerText();
  assert.match(liveText, /Invented GE Course One/);
  assert.match(liveText, /Lecture 50001/);
  assert.match(liveText, /Discussion 50002/);
  assert.match(liveText, /Rating not loaded/);
  assert.match(liveText, /Prerequisites and clearance were not read/);
  assert.match(liveText, /18 seats open \(live seat count\)/);
  assert.match(liveText, /Not checked against your registered classes/, 'honest when the schedule is unknown');
  assert.ok(!/fits around your/.test(liveText));
  assert.match(await live.locator('.geres').nth(1).innerText(), /1 seat open \(live seat count\)/);
  assert.ok(!/Sample rating|sample seat|Demo data/i.test(await live.locator('#tp-view-plan').innerText()), 'no demo labels in Live');
  await live.locator('.geres').first().locator('button:has-text("Add to plan")').click();
  await live.waitForSelector('.plancard');
  assert.deepEqual(await live.evaluate(() => window.__clicks), []);
  ok('Live: no data is stored between pages, so the finder says it was not checked against registered classes; real GE-flagged sections get live seats and "rating not loaded"; no demo labels');
  await live.close();

  if (process.env.REAL_WEBREG) {
    console.log('Real webreg.usc.edu (signed out)');
    await context.unroute('https://webreg.usc.edu/**');
    const real = watch(await context.newPage());
    const response = await real.goto('https://webreg.usc.edu/Login', { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log(`  info  ${response.status()} ${real.url()}`);
    await real.waitForSelector('#trojan-planner-host', { state: 'attached', timeout: 15000 });
    await real.locator('.launcher').click();
    await real.locator('[data-fk=mode-toggle]').click();
    await real.waitForSelector('.datapill.demo');
    await real.locator('.req:has-text("GE-B") button').click();
    await real.waitForSelector('.geres', { timeout: 15000 });
    await real.locator('.geres').first().locator('button:has-text("Add to plan")').click();
    await real.waitForSelector('.plancard');
    ok('real signed-out WebReg page: launcher appears, the drawer opens and the demo flow runs');
  }

  assert.deepEqual(problems, [], 'no console errors, warnings or CSP violations');
  ok('no console errors, warnings or CSP violations on the page');
  console.log('\nAll extension checks passed.');
} catch (error) {
  console.error('\nEXTENSION E2E FAILED:', error.message);
  if (problems.length) console.error('Browser problems:\n' + problems.join('\n'));
  process.exitCode = 1;
} finally {
  await context.close();
}
