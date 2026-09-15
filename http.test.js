import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

test('HTTP access control, origin guard, command execution and static frontend', { timeout: 15000 }, async () => {
  const token = 'test-only-access-key-123456789';
  const child = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: '0', TCP_PORT: '0', HOST: '127.0.0.1', STUDIO_TOKEN: token, REDIS_URL: '', PUBLIC_ORIGIN: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const origin = await new Promise((resolve, reject) => {
      let output = ''; const timer = setTimeout(() => reject(new Error('Server did not start')), 5000);
      child.once('exit', () => { clearTimeout(timer); reject(new Error('Server exited before ready')); });
      child.stdout.on('data', chunk => { output += chunk; const match = output.match(/http:\/\/127\.0\.0\.1:\d+/); if (match) { clearTimeout(timer); resolve(match[0]); } });
    });
    assert.equal((await fetch(origin + '/api/state')).status, 401);
    const wrong = await fetch(origin + '/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'wrong' }) });
    assert.equal(wrong.status, 401);
    const login = await fetch(origin + '/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
    assert.equal(login.status, 200); const cookie = login.headers.get('set-cookie').split(';')[0];
    const blocked = await fetch(origin + '/api/command', { method: 'POST', headers: { Cookie: cookie, Origin: 'https://untrusted.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ command: 'SET x bad' }) });
    assert.equal(blocked.status, 403);
    for (const [command, result] of [['SET name Maliha', 'OK'], ['GET name', 'Maliha'], ['DEL name', 1]]) {
      const response = await fetch(origin + '/api/command', { method: 'POST', headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ command }) });
      assert.equal((await response.json()).result, result);
    }
    const state = await fetch(origin + '/api/state', { headers: { Cookie: cookie } }); assert.equal((await state.json()).entries.length, 0);
    const page = await fetch(origin); assert.equal(page.status, 200); assert.ok((await page.text()).includes('MyRedis Studio')); assert.ok(page.headers.get('content-security-policy'));
  } finally { child.kill(); await once(child, 'exit'); }
});
