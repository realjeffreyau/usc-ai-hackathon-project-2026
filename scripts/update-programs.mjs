// Builds dist/programs/ from the public USC Catalogue (https://catalogue.usc.edu). Build-time only: the app itself never
// contacts the catalogue. Needs Playwright (the catalogue sits behind a browser challenge that plain HTTP clients fail).
// Usage: PLAYWRIGHT_CORE=/path/to/playwright-core [CHROMIUM_PATH=...] node scripts/update-programs.mjs
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const CAT = 22; // catoid
const out = fileURLToPath(new URL('../dist/programs/', import.meta.url));
mkdirSync(out, { recursive: true });
let chromium;
for (const name of [process.env.PLAYWRIGHT_CORE, join(homedir(), '.npm-global/lib/node_modules/@playwright/cli/node_modules/playwright-core'), 'playwright-core'].filter(Boolean)) { try { ({ chromium } = require(name)); break; } catch { /* next */ } }
if (!chromium) throw new Error('playwright-core not found');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const list = await browser.newPage();
await list.goto(`https://catalogue.usc.edu/content.php?catoid=${CAT}&navoid=9396`, { waitUntil: 'networkidle', timeout: 90000 });
const all = await list.evaluate(() => [...document.querySelectorAll('a[href*="preview_program.php"]')].map(a => ({
  id: Number(new URL(a.href).searchParams.get('poid')), name: a.textContent.replace(/\s+/g, ' ').trim() })));
const catalogName = await list.evaluate(() => (document.title.match(/\d{4}-\d{4}/) ?? [''])[0] || (document.body.innerText.match(/\d{4}-\d{4}\s+USC Catalogue/) ?? [''])[0]);
const wanted = [...new Map(all.map(p => [p.id, p])).values()]
  .filter(p => /\((BA|BS|BFA|BM|BArch|BSN|BSW|BSEd)\)$/.test(p.name) || /Minor$/.test(p.name))
  .map(p => ({ ...p, kind: /Minor$/.test(p.name) ? 'minor' : 'major', degree: (p.name.match(/\(([A-Za-z]+)\)$/) ?? [])[1] ?? 'Minor' }));
console.log(`${wanted.length} undergraduate programs (${wanted.filter(p => p.kind === 'major').length} majors, ${wanted.filter(p => p.kind === 'minor').length} minors). Catalog: ${catalogName}`);

// Runs in the page: turns headings, rule text and course rows into requirement groups.
const parse = () => {
  const root = document.querySelector('#acalog-content, .block_content') || document.body;
  const txt = el => el.textContent.replace(/\s+/g, ' ').trim();
  const groups = []; const notes = [];
  let h2 = '', h3 = '', h4 = '', cur = null, intro = '', totalUnits = null;
  const open = () => { if (!cur) { cur = { section: h2, sub: h3, rule: h4, courses: [], notes: [] }; groups.push(cur); } return cur; };
  for (const el of root.querySelectorAll('h1,h2,h3,h4,h5,p,li')) {
    if (el.closest('nav,header,footer,.navbar,.acalog-hierarchy-nav')) continue;
    const tag = el.tagName.toLowerCase(), t = txt(el);
    if (!t || t === 'Close') continue;
    if (tag === 'li' && !el.classList.contains('acalog-course') && el.querySelector('li')) continue;
    if (tag === 'h1') continue;
    if (tag === 'h2') { h2 = t; h3 = ''; h4 = ''; cur = null; const m = /Total units:\s*(\d+)/i.exec(t); if (m) totalUnits = Number(m[1]); continue; }
    if (tag === 'h3') { h3 = t; h4 = ''; cur = null; continue; }
    if (tag === 'h4' || tag === 'h5') { h4 = t; cur = null; continue; }
    if (tag === 'p') { if (!intro && !groups.length && t.length > 40) intro = t.slice(0, 420); else if (cur || groups.length) notes.push(t.slice(0, 240)); continue; }
    if (el.classList.contains('acalog-course')) {
      const link = el.querySelector('a'); const label = txt(link ?? el);
      const m = /^([A-Z]{2,5})\s+(\d{3}[A-Za-z]*)\s*(.*)$/.exec(label);
      if (!m) { open().notes.push(label.slice(0, 160)); continue; }
      const units = (/Units:\s*([\d.]+(?:-[\d.]+)?)/i.exec(txt(el)) ?? [])[1] ?? '';
      open().courses.push({ code: `${m[1]} ${m[2].replace(/[a-z]+$/, s => s)}`, title: m[3].slice(0, 110), units, or: /\bor\s*$/i.test(txt(el)) });
      continue;
    }
    if (tag === 'li') { const note = t.slice(0, 220); const u = /Units:\s*(\d+)/i.exec(note); open().notes.push(note); if (u && /general education/i.test(note)) open().units = Number(u[1]); }
  }
  return { intro, totalUnits, groups: groups.filter(g => g.courses.length || g.notes.length) };
};

const queue = [...wanted];
let done = 0;
const worker = async () => {
  const page = await browser.newPage();
  while (queue.length) {
    const prog = queue.shift();
    const file = join(out, `${prog.id}.json`);
    if (existsSync(file) && !process.env.FORCE) { done += 1; continue; }
    try {
      await page.goto(`https://catalogue.usc.edu/preview_program.php?catoid=${CAT}&poid=${prog.id}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForSelector('h1', { timeout: 30000 });
      const data = await page.evaluate(parse);
      writeFileSync(file, JSON.stringify({ id: prog.id, name: prog.name, kind: prog.kind, degree: prog.degree, catalog: catalogName, source: `https://catalogue.usc.edu/preview_program.php?catoid=${CAT}&poid=${prog.id}`, ...data }));
    } catch (error) { console.log(`skip ${prog.id} ${prog.name}: ${error.message.split('\n')[0]}`); }
    done += 1;
    if (done % 25 === 0) console.log(`${done}/${wanted.length}`);
    await sleep(700 + Math.random() * 500);
  }
  await page.close();
};
await Promise.all([worker(), worker(), worker()]);
const index = wanted.filter(p => existsSync(join(out, `${p.id}.json`))).sort((a, b) => a.name.localeCompare(b.name)).map(({ id, name, kind, degree }) => ({ id, name, kind, degree }));
writeFileSync(join(out, 'index.json'), JSON.stringify({ catalog: catalogName, source: `https://catalogue.usc.edu/content.php?catoid=${CAT}&navoid=9396`, programs: index }));
console.log(`wrote ${index.length} programs to ${out}`);
await browser.close();
