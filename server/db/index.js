'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const dbPath = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(__dirname, '..', '..', 'data', 'linecollection.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

// Menjalankan fungsi dalam satu transaksi database (rollback otomatis jika error)
function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    throw e;
  }
}
const get = (sql, ...p) => db.prepare(sql).get(...p);
const all = (sql, ...p) => db.prepare(sql).all(...p);
const run = (sql, ...p) => db.prepare(sql).run(...p);

function migrate() {
  db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  db.prepare('INSERT OR IGNORE INTO schema_migrations(version) VALUES (1)').run();

  // v2: nome de usuário (login por usuário OU email). Seguro rodar várias vezes.
  const cols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
  if (!cols.includes('username')) db.exec('ALTER TABLE users ADD COLUMN username TEXT');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username COLLATE NOCASE)');
  const { suggestUsername } = require('../lib/validate');
  const missing = db.prepare('SELECT id, email FROM users WHERE username IS NULL').all();
  const taken = db.prepare('SELECT 1 FROM users WHERE username = ? COLLATE NOCASE');
  const setU = db.prepare('UPDATE users SET username = ? WHERE id = ?');
  for (const u of missing) setU.run(suggestUsername(String(u.email).split('@')[0], (x) => !!taken.get(x), { allowReserved: true }), u.id);
  db.prepare('INSERT OR IGNORE INTO schema_migrations(version) VALUES (2)').run();
}
migrate();

module.exports = { db, tx, get, all, run, dbPath, migrate };