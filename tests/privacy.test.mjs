import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const dist = new URL('../dist/', import.meta.url);
const own = readdirSync(dist).filter(name => /\.(js|html|css)$/.test(name));
const source = name => readFileSync(new URL(name, dist), 'utf8');

test('app code loads only bundled assets and has no storage, logging or eval APIs', () => {
  const banned = /\b(XMLHttpRequest|sendBeacon|WebSocket|EventSource|localStorage|sessionStorage|indexedDB|caches|document\.cookie|console\.|eval\s*\(|new Function|innerHTML|outerHTML|insertAdjacentHTML|document\.write)\b/;
  for (const name of own.filter(n => n.endsWith('.js'))) {
    const hit = source(name).split('\n').findIndex(line => banned.test(line.replace(/\/\/.*$/, '')));
    assert.equal(hit, -1, `${name}:${hit + 1} uses a banned API`);
    for (const line of source(name).split('\n').filter(line => /\bfetch\(/.test(line))) {
      assert.ok(name === 'panel.js' && /fetch\((?:new URL\('\.\/(?:panel\.css|vendor\/dm-sans\.woff2)', import\.meta\.url\)|programUrl\((?:'index'|id)\))\)/.test(line), `${name}: unexpected network request`);
    }
  }
});

test('index.html keeps the strict CSP, no inline code/styles, no third-party hosts', () => {
  const html = source('index.html');
  const csp = html.match(/Content-Security-Policy" content="([^"]+)"/)?.[1] ?? '';
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'self'", "object-src 'none'", "form-action 'none'", "base-uri 'none'"]) {
    assert.ok(csp.includes(directive), directive);
  }
  assert.ok(!/unsafe-/.test(csp));
  assert.ok(!/<script(?![^>]*\bsrc=)/i.test(html), 'inline script');
  assert.ok(!/\sstyle=/i.test(html), 'inline style attribute');
  assert.ok(!/\son\w+=/i.test(html), 'inline handler');
  for (const name of own.filter(n => n !== 'catalog.js')) {
    const text = source(name);
    for (const [url] of text.matchAll(/https?:\/\/[^\s'"`)]+/g)) {
      if (url === 'http://www.w3.org/2000/svg' || url === 'http://127.0.0.1:8080/') continue; // SVG namespace, not a network destination
      assert.match(url, /^https:\/\/(webreg\.usc\.edu|classes\.usc\.edu|arr\.usc\.edu|troyplan\.vercel\.app|catalogue\.usc\.edu|www\.ratemyprofessors\.com|www\.w3\.org)/, `${name}: ${url}`);
    }
  }
});

test('PDF.js is vendored, pinned, and configured without eval or XFA', () => {
  const audit = source('audit.js');
  assert.match(audit, /isEvalSupported:false/);
  assert.match(audit, /enableXfa:false/);
  assert.match(audit, /enableScripting:false/);
  assert.match(audit, /\.\/vendor\/pdf\.mjs/);
  assert.match(readFileSync(new URL('vendor/pdf.mjs', dist), 'utf8').slice(0, 2000000), /6\.5\.438/);
});

test('no persistent files are written by the app (gitignore covers PDFs and uploads)', () => {
  const ignore = readFileSync(new URL('../.gitignore', import.meta.url), 'utf8');
  assert.match(ignore, /\*\.pdf/);
});
