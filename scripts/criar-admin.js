'use strict';
// Cria (ou promove) o primeiro admin. Senha digitada no terminal, nunca gravada em arquivo.
require('dotenv').config({ quiet: true });
const readline = require('node:readline');
const { get, run, tx } = require('../server/db');
const { hashPassword } = require('../server/lib/security');
const { isEmail, passwordProblem } = require('../server/lib/validate');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(r => rl.question(q, r));

(async () => {
  const arg = process.argv.slice(2);
  const email = (arg[0] || await ask('Email do admin: ')).trim().toLowerCase();
  const pass = arg[1] || await ask('Senha (mín. 8, letras e números): ');
  rl.close();
  if (!isEmail(email)) return console.error('Email inválido.'), process.exit(1);
  const pp = passwordProblem(pass); if (pp) return console.error(pp), process.exit(1);
  const hash = await hashPassword(pass);
  const u = get('SELECT id FROM users WHERE email=?', email);
  tx(() => {
    if (u) { run("UPDATE users SET role='admin', is_active=1, password_hash=? WHERE id=?", hash, u.id); }
    else {
      const r = run("INSERT INTO users(email,password_hash,name,role) VALUES (?,?,?, 'admin')", email, hash, 'Administrador');
      run('INSERT INTO profiles(user_id) VALUES (?)', r.lastInsertRowid);
    }
  });
  console.log(`✅ Admin pronto: ${email}\nAcesse /entrar e depois /admin`);
})();
