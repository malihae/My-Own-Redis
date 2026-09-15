import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine, MemoryStore, tokenize } from '../server/engine.js';

test('Original PING, SET, GET, DEL flow and missing-key replies', async () => {
  const e = new Engine(new MemoryStore());
  assert.equal((await e.execute('PING')).result, 'PONG');
  assert.equal((await e.execute('SET name Maliha')).result, 'OK');
  assert.equal((await e.execute('GET name')).result, 'Maliha');
  assert.equal((await e.execute('TTL name')).result, -1);
  assert.equal((await e.execute('DEL name')).result, 1);
  assert.equal((await e.execute('GET name')).result, null);
  assert.equal((await e.execute('TTL name')).result, -2);
  assert.equal((await e.execute('DEL name')).result, 0);
});
test('Quoted Unicode, whitespace, empty values, and escaped newlines round-trip', async () => {
  const e = new Engine(new MemoryStore());
  const text = 'Maliha  Ehsan\nلاہور';
  assert.equal((await e.execute(`SET name ${JSON.stringify(text)}`)).ok, true);
  assert.equal((await e.execute('GET name')).result, text);
  await e.execute('SET empty ""'); assert.equal((await e.execute('GET empty')).result, '');
  assert.throws(() => tokenize('SET x "unfinished'));
});
test('Expiration is enforced at read time, even before cleanup runs', async () => {
  const store = new MemoryStore(); const e = new Engine(store);
  await e.execute('SET session active EX 10');
  assert.ok((await e.execute('TTL session')).result <= 10);
  store.data.get('session').expiresAt = Date.now() - 1;
  assert.equal((await e.execute('GET session')).result, null);
  assert.equal((await e.execute('TTL session')).result, -2);
  assert.equal((await e.snapshot()).entries.length, 0);
});
test('Overwriting, deleting, and PERSIST remove old expiration', async () => {
  const s = new MemoryStore(); const e = new Engine(s);
  await e.execute('SET x old EX 1'); await e.execute('SET x new');
  assert.equal(s.data.get('x').expiresAt, null);
  await e.execute('EXPIRE x 10'); assert.ok(s.data.get('x').expiresAt);
  assert.equal((await e.execute('PERSIST x')).result, 1);
  assert.equal((await e.execute('TTL x')).result, -1);
  await e.execute('DEL x'); await e.execute('SET x rebuilt');
  assert.equal((await e.execute('GET x')).result, 'rebuilt');
  await e.execute('EXPIRE x 0'); assert.equal((await e.execute('GET x')).result, null);
});
test('Invalid commands never overwrite valid values', async () => {
  const e = new Engine(new MemoryStore()); await e.execute('SET x safe');
  for (const command of ['SET x wrong EX 0', 'SET x wrong EX nope', 'SET x wrong EX 9999999999', 'GET', 'DEL x y', 'CONFIG GET *', 'PING extra']) assert.equal((await e.execute(command)).ok, false);
  assert.equal((await e.execute('GET x')).result, 'safe');
});
test('Concurrent clients share ordered mutations, and logs exclude values', async () => {
  const e = new Engine(new MemoryStore());
  await Promise.all(Array.from({ length: 30 }, (_, i) => e.execute(['SET', `k${i}`, 'PRIVATE_VALUE'])));
  const state = await e.snapshot(); assert.equal(state.entries.length, 30);
  assert.equal(JSON.stringify(state.events).includes('PRIVATE_VALUE'), false);
});
