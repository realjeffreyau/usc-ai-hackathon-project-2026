import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const ext = new URL('../extension/', import.meta.url);
const dist = new URL('../dist/', import.meta.url);
const read = (base, name) => readFileSync(new URL(name, base), 'utf8');
const manifest = JSON.parse(read(ext, 'manifest.json'));

test('manifest: MV3, scoped to webreg.usc.edu, no permissions, no remote code', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.content_scripts.map(c => c.matches), [['https://webreg.usc.edu/*']]);
  assert.deepEqual(manifest.permissions ?? [], []);
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.optional_permissions, undefined);
  assert.deepEqual(manifest.web_accessible_resources.flatMap(r => r.matches), ['https://webreg.usc.edu/*']);
  assert.match(manifest.content_security_policy.extension_pages, /script-src 'self'/);
  assert.ok(!/unsafe-|https?:\/\//.test(manifest.content_security_policy.extension_pages));
  for (const directive of ["default-src 'none'", "connect-src 'self'", "object-src 'none'", "base-uri 'none'", "form-action 'none'"]) {
    assert.ok(manifest.content_security_policy.extension_pages.includes(directive), directive);
  }
  assert.ok(!JSON.stringify(manifest).includes('<all_urls>'));
  for (const size of ['16', '48', '128']) assert.ok(manifest.icons[size]);
});

const own = ['content.js', 'popup.js', 'demo.js', 'src/panel.js', 'src/fixtures.js', 'src/ai.js', 'src/webreg.js', 'src/board.js', 'src/programs.js'];
test('extension code: no network except its own bundled assets, no storage, logging, eval, or HTML injection', () => {
  const banned = /\b(XMLHttpRequest|sendBeacon|WebSocket|EventSource|localStorage|sessionStorage|indexedDB|caches|document\.cookie|console\.|eval\s*\(|new Function|innerHTML|outerHTML|insertAdjacentHTML|document\.write|chrome\.(storage|cookies|webRequest|history|downloads|scripting|identity))\b|\bsessionStorage\b/;
  for (const name of own) {
    const hit = read(ext, name).split('\n').findIndex(line => banned.test(line.replace(/\/\/.*$/, '')));
    assert.equal(hit, -1, `${name}:${hit + 1} uses a banned API`);
  }
  // fetch is allowed only for the extension's own CSS and font, resolved relative to the module.
  const fetches = own.flatMap(name => read(ext, name).split('\n').filter(line => /\bfetch\(/.test(line)).map(line => `${name}: ${line.trim()}`));
  assert.ok(fetches.every(line => /fetch\((new URL\('\.\/(panel\.css|vendor\/dm-sans\.woff2)', import\.meta\.url\)|programUrl\(('index'|id))\)/.test(line)), fetches.join('\n'));
});

test('extension never clicks, submits or edits WebReg; only src/webreg.js reads the page, and it is read-only', () => {
  for (const name of own) {
    const code = read(ext, name);
    assert.ok(!/\.click\(\)|\.submit\(\)|dispatchEvent|\.requestSubmit|execCommand\(['"](insert|delete)/.test(code), `${name} drives page controls`);
    if (name !== 'src/webreg.js') {
      assert.ok(!/document\.(querySelector|querySelectorAll|getElementsBy\w+)\(/.test(code), `${name} reads the host page`);
    }
  }
  const reader = read(ext, 'src/webreg.js');
  assert.ok(!/\.(value|checked|innerText|textContent|href|src)\s*=[^=]/.test(reader), 'webreg.js assigns to page properties');
  assert.ok(!/\b(fetch|XMLHttpRequest|localStorage|sessionStorage)\b/.test(reader));
  // The only page edit the panel makes is an outline on recommended rows (and removing it again).
  const panel = read(ext, 'src/panel.js');
  const pageWrites = panel.split('\n').filter(line => /\b(row|el)\.(style\.\w+|setAttribute|removeAttribute)/.test(line) && !/\bkey\b|block\.style/.test(line));
  assert.ok(pageWrites.every(line => /outline|data-trojan-planner/.test(line)), pageWrites.join('\n'));
});

test('shared modules in extension/src are in sync with dist (run: node scripts/build-extension.mjs)', () => {
  for (const file of ['audit.js', 'planner.js', 'logic.js', 'catalog.js', 'sample.js', 'webreg.js', 'ge.js', 'programs.js', 'board.js', 'panel.js', 'panel.css', 'fixtures.js', 'ge-data.js', 'ai.js']) {
    assert.equal(read(ext, 'src/' + file), read(dist, file), file);
  }
});

test('demo fixtures are fictional or public snapshot only', () => {
  const fixtures = read(ext, 'src/fixtures.js');
  assert.match(fixtures, /fictional/i);
  assert.match(fixtures, /NOT Rate My Professors data/);
  assert.ok(!/@usc\.edu|\b\d{10}\b/.test(fixtures), 'no emails or student-ID-like numbers');
  assert.ok(readdirSync(new URL('src/', ext)).every(name => !/\.pdf$/i.test(name)));
});
