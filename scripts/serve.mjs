// Zero-dependency static server for local use: `npm start` (http://127.0.0.1:8080).
// Binds to loopback only. It serves ./dist and nothing else; it never receives imported data.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

export function start(port = Number(process.env.PORT ?? 8080)) {
  const server = createServer(async (req, res) => {
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self'; worker-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cache-Control', 'no-store');
    // Reject non-loopback Host values, including requests through DNS rebinding.
    if (!/^(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(req.headers.host ?? '')) {
      res.writeHead(403, { 'Content-Type': 'text/plain' }).end('Forbidden'); return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }).end(); return; }
    try {
      const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const file = resolve(join(root, normalize(path === '/' ? '/index.html' : path)));
      if (file !== root && !file.startsWith(root + sep)) throw new Error('outside root');
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found'); }
  });
  return new Promise((done, fail) => { server.once('error', fail); server.listen(port, '127.0.0.1', () => done(server)); });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = await start();
  console.log(`TroyPlan running at http://127.0.0.1:${server.address().port}`);
}
