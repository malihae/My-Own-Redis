import { performance } from 'node:perf_hooks';

export function tokenize(command) {
  if (typeof command !== 'string' || command.length > 70000) throw new Error('Command must be text under 70 KB.');
  const tokens = []; let current = ''; let quote = null; let started = false;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (ch === '\\' && quote) {
      if (++i >= command.length) throw new Error('Incomplete escape sequence.');
      const escaped = command[i];
      current += ({ n: '\n', r: '\r', t: '\t' })[escaped] ?? escaped;
    } else if (quote) {
      if (ch === quote) quote = null; else current += ch;
    } else if (ch === '"' || ch === "'") { quote = ch; started = true;
    } else if (/\s/.test(ch)) {
      if (started) { tokens.push(current); current = ''; started = false; }
    } else { current += ch; started = true; }
  }
  if (quote) throw new Error('Close the quote around your value.');
  if (started) tokens.push(current);
  if (!tokens.length) throw new Error('Enter a command first.');
  return tokens;
}

export class MemoryStore {
  mode = 'Custom engine';
  data = new Map();
  purge() { const now = Date.now(); for (const [k, entry] of this.data) if (entry.expiresAt && entry.expiresAt <= now) this.data.delete(k); }
  async set(key, value, seconds) {
    this.purge();
    if (!this.data.has(key) && this.data.size >= 1000) throw new Error('Workspace limit reached: 1,000 keys.');
    let size = Buffer.byteLength(key) + Buffer.byteLength(value);
    for (const [k, entry] of this.data) if (k !== key) size += Buffer.byteLength(k) + Buffer.byteLength(entry.value);
    if (size > 5 * 1024 * 1024) throw new Error('Workspace limit reached: 5 MB.');
    this.data.set(key, { value, expiresAt: seconds === null ? null : Date.now() + seconds * 1000 }); return 'OK';
  }
  async get(key) { this.purge(); return this.data.get(key)?.value ?? null; }
  async del(key) { this.purge(); return this.data.delete(key) ? 1 : 0; }
  async ttl(key) { this.purge(); const e = this.data.get(key); return !e ? -2 : e.expiresAt === null ? -1 : Math.max(0, Math.round((e.expiresAt - Date.now()) / 1000)); }
  async expire(key, seconds) { this.purge(); const entry = this.data.get(key); if (!entry) return 0; if (!seconds) this.data.delete(key); else entry.expiresAt = Date.now() + seconds * 1000; return 1; }
  async persist(key) { this.purge(); const entry = this.data.get(key); if (!entry || entry.expiresAt === null) return 0; entry.expiresAt = null; return 1; }
  async entries() { this.purge(); return [...this.data].map(([key, e]) => ({ key, ...e, bytes: Buffer.byteLength(e.value) })); }
  async ping() { return 'PONG'; }
  async close() {}
}

export async function createStore() {
  if (!process.env.REDIS_URL) return new MemoryStore();
  const { createClient } = await import('redis');
  const client = createClient({ url: process.env.REDIS_URL, socket: { connectTimeout: 5000, reconnectStrategy: false } });
  client.on('error', () => console.error('Redis connection error. Check your server-side connection settings.'));
  await client.connect();
  const prefix = process.env.REDIS_PREFIX || 'myredis-studio:';
  if (!/^[a-zA-Z0-9:_-]+$/.test(prefix)) throw new Error('REDIS_PREFIX may contain only letters, digits, colon, underscore, and hyphen.');
  const k = key => prefix + key;
  return {
    mode: 'Redis Cloud / external',
    ping: () => client.ping(),
    set: (key, value, seconds) => client.set(k(key), value, seconds === null ? {} : { EX: seconds }),
    get: key => client.get(k(key)), del: key => client.del(k(key)), ttl: key => client.ttl(k(key)),
    expire: async (key, seconds) => Number(await client.expire(k(key), seconds)),
    persist: async key => Number(await client.persist(k(key))),
    entries: async () => {
      const keys = [];
      for await (const page of client.scanIterator({ MATCH: prefix + '*', COUNT: 100, TYPE: 'string' })) {
        for (const key of page) { keys.push(key); if (keys.length >= 1000) break; }
        if (keys.length >= 1000) break;
      }
      const entries = [];
      for (let i = 0; i < keys.length; i += 50) {
        const batch = client.multi(); for (const key of keys.slice(i, i + 50)) { batch.get(key); batch.pTTL(key); }
        const results = await batch.exec(); const now = Date.now();
        for (let j = 0; j < results.length; j += 2) {
          const value = results[j]; const ttl = results[j + 1];
          if (value !== null && ttl !== -2) entries.push({ key: keys[i + j / 2].slice(prefix.length), value, expiresAt: ttl < 0 ? null : now + ttl, bytes: Buffer.byteLength(value) });
        }
      }
      return entries;
    },
    close: () => client.quit()
  };
}

export class Engine {
  constructor(store) { this.store = store; this.started = Date.now(); this.commands = 0; this.failures = 0; this.events = []; this.sequence = 0; this.queue = Promise.resolve(); }
  execute(command, source = 'web') {
    const job = this.queue.then(() => this.run(command, source));
    this.queue = job.catch(() => {}); return job;
  }
  async run(command, source) {
    const start = performance.now(); let result; let args = [];
    try {
      args = Array.isArray(command) ? command : tokenize(command);
      if (args.some(a => typeof a !== 'string')) throw new Error('Command arguments must be strings.');
      const op = args[0]?.toUpperCase(); const key = args[1];
      if (key !== undefined && (key.length === 0 || Buffer.byteLength(key) > 256)) throw new Error('Keys must contain 1–256 bytes.');
      const arity = n => { if (args.length !== n) throw new Error(`Wrong arguments for ${op}. See the command guide.`); };
      const seconds = value => { if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > 2147483) throw new Error('Expiration must be a whole number up to 2,147,483 seconds.'); return Number(value); };
      switch (op) {
        case 'PING': arity(1); result = await this.store.ping(); break;
        case 'SET': {
          if (args.length < 3) throw new Error('Use SET key value [EX seconds].');
          let ttl = null; let valueArgs = args.slice(2);
          if (valueArgs.length >= 2 && valueArgs.at(-2).toUpperCase() === 'EX') {
            ttl = seconds(valueArgs.at(-1)); if (ttl === 0 || valueArgs.length < 3) throw new Error('SET expiration must be positive and follow a value.'); valueArgs = valueArgs.slice(0, -2);
          }
          const value = valueArgs.join(' ');
          if (Buffer.byteLength(value) > 65536) throw new Error('Values are limited to 64 KB.');
          result = await this.store.set(key, value, ttl); break;
        }
        case 'GET': arity(2); result = await this.store.get(key); break;
        case 'DEL': arity(2); result = await this.store.del(key); break;
        case 'TTL': arity(2); result = await this.store.ttl(key); break;
        case 'EXPIRE': arity(3); result = await this.store.expire(key, seconds(args[2])); break;
        case 'PERSIST': arity(2); result = await this.store.persist(key); break;
        default: throw new Error('Supported commands: PING, SET, GET, DEL, TTL, EXPIRE, PERSIST.');
      }
      this.commands++;
      const event = { id: ++this.sequence, command: args[0].toUpperCase(), key: args[1] ?? null, source, at: Date.now(), ok: true, duration: +(performance.now() - start).toFixed(2) };
      this.events = [event, ...this.events].slice(0, 60);
      return { ...event, result };
    } catch (error) {
      this.failures++;
      const event = { id: ++this.sequence, command: args[0]?.toUpperCase() || 'INVALID', key: args[1] ?? null, source, at: Date.now(), ok: false, duration: +(performance.now() - start).toFixed(2), error: error.message };
      this.events = [event, ...this.events].slice(0, 60); return event;
    }
  }
  async snapshot() {
    await this.queue;
    const entries = (await this.store.entries()).sort((a, b) => a.key.localeCompare(b.key));
    return { mode: this.store.mode, entries, events: this.events, serverTime: Date.now(), uptime: Date.now() - this.started, commands: this.commands, failures: this.failures, bytes: entries.reduce((n, e) => n + e.bytes, 0), expiring: entries.filter(e => e.expiresAt !== null).length };
  }
}
