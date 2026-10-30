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

  // v3: pagamento manual (transferência/PIX + comprovante)
  const paySql = (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='payments'").get() || {}).sql || '';
  if (paySql && !paySql.includes("'manual'")) {           // recria a tabela payments aceitando provider 'manual' (SQLite não altera CHECK)
    db.exec('PRAGMA foreign_keys = OFF');
    try {
      db.exec('BEGIN');
      db.exec(`CREATE TABLE payments_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
        provider TEXT NOT NULL CHECK (provider IN ('mercadopago','sandbox','manual')),
        provider_ref TEXT, provider_payment_id TEXT,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled','refunded')),
        method TEXT, amount_cents INTEGER NOT NULL, currency TEXT NOT NULL DEFAULT 'BRL', raw_status TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')))`);
      db.exec(`INSERT INTO payments_new(id,order_id,provider,provider_ref,provider_payment_id,status,method,amount_cents,currency,raw_status,created_at,updated_at)
               SELECT id,order_id,provider,provider_ref,provider_payment_id,status,method,amount_cents,currency,raw_status,created_at,updated_at FROM payments`);
      db.exec('DROP TABLE payments');
      db.exec('ALTER TABLE payments_new RENAME TO payments');
      db.exec('CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id)');
      db.exec('CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_provider_payment ON payments(provider, provider_payment_id) WHERE provider_payment_id IS NOT NULL');
      db.exec('COMMIT');
    } catch (e) { try { db.exec('ROLLBACK'); } catch (_) {} throw e; }
    finally { db.exec('PRAGMA foreign_keys = ON'); }
  }
  db.exec(`CREATE TABLE IF NOT EXISTS payment_proofs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL, original_name TEXT, mime TEXT NOT NULL, size INTEGER NOT NULL, note TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','replaced')),
    reject_reason TEXT, reviewed_by INTEGER REFERENCES users(id), reviewed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_proofs_order ON payment_proofs(order_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_proofs_status ON payment_proofs(status)');
  db.prepare('INSERT OR IGNORE INTO schema_migrations(version) VALUES (3)').run();
}
migrate();

module.exports = { db, tx, get, all, run, dbPath, migrate };