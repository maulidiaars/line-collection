'use strict';
// Infraestrutura de teste: banco e storage temporários + servidor real em porta aleatória.
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-test-'));
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = path.join(tmp, 'test.db');
process.env.STORAGE_DIR = path.join(tmp, 'storage');
process.env.SESSION_SECRET = 'x'.repeat(48);
process.env.BASE_URL = process.env.BASE_URL || 'http://localhost:0';
require('../server/db/seed.js');
const app = require('../server/index.js');
const { run, get } = require('../server/db');
const { hashPassword } = require('../server/lib/security');

let server, base;
async function start() {
  await new Promise(r => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
  return base;
}
const stop = () => new Promise(r => server.close(r));

// Cliente HTTP com cookie jar e token CSRF automático
class Client {
  constructor() { this.cookie = ''; this.csrf = null; }
  async req(method, url, body, opts = {}) {
    const h = { Accept: 'application/json' };
    if (this.cookie) h.Cookie = this.cookie;
    if (this.csrf && !opts.noCsrf) h['X-CSRF-Token'] = this.csrf;
    let b; if (body instanceof FormData) b = body; else if (body !== undefined) { h['Content-Type'] = 'application/json'; b = JSON.stringify(body); }
    Object.assign(h, opts.headers || {});
    const r = await fetch(base + url, { method, headers: h, body: b, redirect: 'manual' });
    const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
    for (const c of sc) { const kv = c.split(';')[0]; if (kv.endsWith('=')) { this.cookie = ''; } else this.cookie = kv; }
    let json = null; const ct = r.headers.get('content-type') || '';
    if (ct.includes('json')) json = await r.json(); else await r.arrayBuffer().then(buf => { r.buf = Buffer.from(buf); });
    return { status: r.status, json, res: r, buf: r.buf };
  }
  get(u, o) { return this.req('GET', u, undefined, o); }
  post(u, b, o) { return this.req('POST', u, b ?? {}, o); }
  put(u, b, o) { return this.req('PUT', u, b ?? {}, o); }
  async refreshCsrf() { const m = await this.get('/api/auth/me'); this.csrf = m.json.csrf || null; return m.json; }
  async register(name, email, password = 'Senha1234') {
    const r = await this.post('/api/auth/register', { name, email, password, confirm: password });
    await this.refreshCsrf(); return r;
  }
  async login(email, password = 'Senha1234') {
    const r = await this.post('/api/auth/login', { email, password }); await this.refreshCsrf(); return r;
  }
}
async function makeAdmin(email = 'admin@test.com', password = 'Admin1234') {
  const h = await hashPassword(password);
  const r = run("INSERT INTO users(email,password_hash,name,role) VALUES (?,?,?, 'admin')", email, h, 'Admin Teste');
  run('INSERT INTO profiles(user_id) VALUES (?)', r.lastInsertRowid);
  const c = new Client(); await c.login(email, password); return c;
}
module.exports = { start, stop, Client, makeAdmin, get, run, tmp, base: () => base };
