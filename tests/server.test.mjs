import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { start } from '../scripts/serve.mjs';

test('preview serves only public assets and rejects writes and untrusted hosts', async () => {
  const server = await start(0);
  const port = server.address().port;
  const get = (path, options = {}) => new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, ...options }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
  try {
    const page = await get('/');
    assert.equal(page.status, 200);
    assert.match(page.headers['content-security-policy'], /frame-ancestors 'none'/);
    assert.equal(page.headers['x-content-type-options'], 'nosniff');
    assert.equal(page.headers['cache-control'], 'no-store');
    assert.equal((await get('/', { headers: { Host: 'untrusted.example' } })).status, 403);
    assert.equal((await get('/', { method: 'POST' })).status, 405);
    for (const path of ['/../package.json', '/%2e%2e%2fpackage.json', '/.env', '/%zz']) {
      assert.equal((await get(path)).status, 404, path);
    }
    assert.equal((await get('/', { method: 'HEAD' })).body, '');
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
