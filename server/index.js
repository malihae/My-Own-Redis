import http from 'node:http';
import net from 'node:net';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Engine, createStore } from './engine.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 3000);
const token = process.env.STUDIO_TOKEN || '';
if (!['127.0.0.1', 'localhost', '::1'].includes(host) && token.length < 24) {
  throw new Error('Set STUDIO_TOKEN to at least 24 random characters before sharing outside localhost.');
}
const engine = new Engine(await createStore());
const dev = process.argv.includes('--dev');
const vite = dev ? await (await import('vite')).createServer({ root, server: { middlewareMode: true }, appType: 'custom' }) : null;
const sessions = new Map(); const limits = new Map();
function equal(a, b) { const x = Buffer.from(a); const y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); }
function json(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); }
async function body(req) { let input = ''; for await (const chunk of req) { input += chunk; if (Buffer.byteLength(input) > 100000) throw new Error('Request exceeds 100 KB.'); } return JSON.parse(input || '{}'); }
function authorized(req) {
  if (!token) return true;
  const cookie = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('studio='))?.slice(7);
  return cookie && (sessions.get(cookie) || 0) > Date.now();
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  if (!dev) res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'");
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      const expected = process.env.PUBLIC_ORIGIN || `http://${req.headers.host}`;
      if (req.headers.origin && req.headers.origin !== expected) return json(res, 403, { error: 'Cross-origin requests are not allowed.' });
      // Defend the localhost workspace against DNS rebinding.
      if (!token && !['localhost', '127.0.0.1', '[::1]', ...(process.env.PUBLIC_ORIGIN ? [new URL(process.env.PUBLIC_ORIGIN).hostname] : [])].includes(new URL('http://' + req.headers.host).hostname)) return json(res, 403, { error: 'Use localhost to access this workspace.' });
      const ip = req.socket.remoteAddress; const now = Date.now();
      const rate = limits.get(ip) || { n: 0, until: now + 60000 };
      if (now > rate.until) { rate.n = 0; rate.until = now + 60000; }
      if (++rate.n > 240) return json(res, 429, { error: 'Too many requests. Try again in a minute.' });
      limits.set(ip, rate);
      if (url.pathname === '/api/session' && req.method === 'GET') return json(res, 200, { authorized: !!authorized(req), protected: !!token });
      if (url.pathname === '/api/session' && req.method === 'POST') {
        const data = await body(req);
        if (typeof data.token !== 'string' || !equal(data.token, token)) return json(res, 401, { error: 'That access key is not correct.' });
        const id = randomBytes(32).toString('hex'); sessions.set(id, now + 12 * 60 * 60 * 1000);
        const secure = process.env.PUBLIC_ORIGIN?.startsWith('https:') ? '; Secure' : '';
        res.setHeader('Set-Cookie', `studio=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${secure}`);
        return json(res, 200, { authorized: true });
      }
      if (!authorized(req)) return json(res, 401, { error: 'Enter your workspace access key.' });
      if (url.pathname === '/api/state' && req.method === 'GET') return json(res, 200, await engine.snapshot());
      if (url.pathname === '/api/command' && req.method === 'POST') {
        const data = await body(req);
        if (typeof data.command !== 'string' && !Array.isArray(data.command)) return json(res, 400, { error: 'Provide a command.' });
        return json(res, 200, await engine.execute(data.command));
      }
      return json(res, 404, { error: 'API route not found.' });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    if (dev) {
      vite.middlewares(req, res, async () => {
        try { const html = await vite.transformIndexHtml(req.url, await readFile(path.join(root, 'index.html'), 'utf8')); res.setHeader('Content-Type', 'text/html'); res.end(html); }
        catch { res.writeHead(500); res.end('Unable to render the development page.'); }
      }); return;
    }
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/index.html';
    const file = path.resolve(root, 'dist', '.' + pathname);
    if (!file.startsWith(path.join(root, 'dist') + path.sep)) { res.writeHead(403); return res.end(); }
    try {
      const bytes = await readFile(file);
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff' };
      res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream'); res.end(bytes);
    } catch { res.writeHead(404); res.end('File not found. Run npm run build before npm start.'); }
  } catch (error) { if (!res.headersSent) json(res, 400, { error: error instanceof SyntaxError ? 'Invalid JSON request.' : 'Request failed. Check the server connection and try again.' }); else res.end(); }
});
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} is occupied. Stop the earlier server or change PORT in .env.` : error.message); process.exit(1); });
server.listen(port, host, () => console.log(`MyRedis Studio: http://${host}:${server.address().port} | ${engine.store.mode}`));

// Your original plain-text TCP client continues to work on localhost:8000.
const tcpPort = Number(process.env.TCP_PORT ?? 8000);
let tcp;
if (tcpPort !== 0) {
  tcp = net.createServer({ allowHalfOpen: true }, socket => {
    socket.setEncoding('utf8'); socket.setTimeout(300000, () => socket.destroy());
    let pending = ''; let queue = Promise.resolve();
    socket.on('data', chunk => {
      pending += chunk;
      if (Buffer.byteLength(pending) > 100000) return socket.destroy();
      let end;
      while ((end = pending.indexOf('\n')) >= 0) {
        const command = pending.slice(0, end).trim(); pending = pending.slice(end + 1);
        if (!command) continue;
        queue = queue.then(async () => { const r = await engine.execute(command, 'tcp'); if (!socket.destroyed) socket.write((r.ok ? r.result === null ? '(nil)' : String(r.result) : 'ERROR: ' + r.error) + '\n'); });
      }
    });
    socket.on('end', () => queue.finally(() => socket.end()));
    socket.on('error', () => {});
  });
  // Keep the writable side open until queued command replies are sent.
  tcp.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `TCP port ${tcpPort} is occupied. Stop your earlier index.js. The web app is still available; restart Studio to enable TCP.` : error.message); });
  tcp.listen(tcpPort, '127.0.0.1');
}
const housekeeping = setInterval(() => { engine.store.purge?.(); const now = Date.now(); for (const [k, t] of sessions) if (t < now) sessions.delete(k); for (const [k, v] of limits) if (v.until < now) limits.delete(k); }, 1000);
housekeeping.unref();
async function stop() { clearInterval(housekeeping); server.close(); tcp?.close(); await vite?.close(); await engine.store.close(); process.exit(0); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
