import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const dist = new URL('../dist/', import.meta.url);
const own = readdirSync(dist).filter(name => /\.(js|html|css)$/.test(name) && name !== 'catalog.js');
const source = name => readFileSync(new URL(name, dist), 'utf8');

test('website code has no tracking, storage, logging, eval or HTML-injection APIs', () => {
  const banned = /\b(XMLHttpRequest|sendBeacon|WebSocket|EventSource|localStorage|indexedDB|caches|document\.cookie|console\.|eval\s*\(|new Function|innerHTML|outerHTML|insertAdjacentHTML|document\.write)\b|\bsessionStorage\b/;
  for (const name of own.filter(n => n.endsWith('.js'))) {
    const hit = source(name).split('\n').findIndex(line => banned.test(line.replace(/\/\/.*$/, '')));
    assert.equal(hit, -1, `${name}:${hit + 1} uses a banned API`);
  }
});

test('the only fetches are the app\'s own bundled files (stylesheet, font, program snapshots)', () => {
  const lines = own.filter(n => n.endsWith('.js')).flatMap(name => source(name).split('\n').filter(line => /\bfetch\(/.test(line)).map(line => `${name}: ${line.trim()}`));
  assert.ok(lines.length >= 3);
  assert.ok(lines.every(line => /fetch\((new URL\('\.\/(panel\.css|vendor\/dm-sans\.woff2)', import\.meta\.url\)|programUrl\(('index'|id))\)/.test(line)), lines.join('\n'));
});

test('index.html keeps a strict CSP (same-origin only), no inline code or styles', () => {
  const html = source('index.html');
  const csp = html.match(/Content-Security-Policy" content="([^"]+)"/)?.[1] ?? '';
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'self'", "object-src 'none'", "form-action 'none'", "base-uri 'none'"]) assert.ok(csp.includes(directive), directive);
  assert.ok(!/unsafe-|https?:/.test(csp));
  assert.ok(!/<script(?![^>]*\bsrc=)/i.test(html), 'inline script');
  assert.ok(!/\sstyle=/i.test(html), 'inline style attribute');
  assert.ok(!/\son\w+=/i.test(html), 'inline handler');
});

test('external links go only to the sites the app names', () => {
  for (const name of own) {
    for (const [url] of source(name).matchAll(/https?:\/\/[^\s'"`)]+/g)) {
      assert.match(url, /^(https:\/\/(webreg\.usc\.edu|classes\.usc\.edu|arr\.usc\.edu|troyplan\.vercel\.app|catalogue\.usc\.edu|www\.ratemyprofessors\.com)|http:\/\/(www\.w3\.org|127\.0\.0\.1:8080))/, `${name}: ${url}`);
    }
  }
});

test('PDF.js is vendored, pinned, and configured without eval or XFA', () => {
  const audit = source('audit.js');
  assert.match(audit, /isEvalSupported:false/);
  assert.match(audit, /enableXfa:false/);
  assert.match(audit, /\.\/vendor\/pdf\.mjs/);
  assert.match(readFileSync(new URL('vendor/pdf.mjs', dist), 'utf8').slice(0, 2000000), /6\.5\.438/);
});

test('program snapshots are static JSON from the public catalogue (no scripts)', () => {
  const index = JSON.parse(source('programs/index.json'));
  assert.match(index.source, /^https:\/\/catalogue\.usc\.edu\//);
  for (const program of index.programs.slice(0, 25)) assert.ok(!/<script|javascript:/i.test(source(`programs/${program.id}.json`)));
});

test('no persistent files are written by the app (gitignore covers PDFs and uploads)', () => {
  assert.match(readFileSync(new URL('../.gitignore', import.meta.url), 'utf8'), /\*\.pdf/);
});
