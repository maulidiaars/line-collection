'use strict';
const express = require('express');
const rateLimit = require('express-rate-limit');
const { get, run, tx } = require('../db');
const S = require('../lib/security');
const { clean, isEmail, passwordProblem, normUsername, usernameProblem, suggestUsername } = require('../lib/validate');
const { sendMail } = require('../lib/mailer');
const { notify } = require('../lib/notify');
const { config } = require('../config');

const router = express.Router();
const limiter = (max, minutes) => rateLimit({ windowMs: minutes * 60e3, max, standardHeaders: true, legacyHeaders: false, skip: () => process.env.NODE_ENV === 'test',
  message: { error: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' } });

const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, username: u.username || null, role: u.role });
const fail = (res, status, error, field) => res.status(status).json(field ? { error, field } : { error });
const usernameTaken = (u) => !!get('SELECT 1 FROM users WHERE username = ? COLLATE NOCASE', u);

// Verifica se um nome de usuário está livre (usado pelo formulário de cadastro enquanto a pessoa digita)
router.get('/username-check', limiter(60, 5), (req, res) => {
  const u = normUsername(req.query.u);
  const p = usernameProblem(u);
  if (p) return res.json({ available: false, reason: p });
  if (usernameTaken(u)) return res.json({ available: false, reason: 'Este usuário já está em uso.' });
  res.json({ available: true });
});

router.post('/register', limiter(10, 15), async (req, res, next) => {
  try {
    const name = clean(req.body.name, 80), email = clean(req.body.email, 254).toLowerCase();
    const { password, confirm } = req.body;
    if (name.length < 2) return fail(res, 400, 'Informe seu nome completo (mínimo 2 caracteres).', 'name');
    // compat: clientes antigos (sem o campo) recebem um usuário gerado a partir do email
    let username = req.body.username === undefined ? null : normUsername(req.body.username);
    if (username !== null) {
      const up = usernameProblem(username); if (up) return fail(res, 400, up, 'username');
      if (usernameTaken(username)) return fail(res, 409, 'Este usuário já está em uso.', 'username');
    }
    if (!isEmail(email)) return fail(res, 400, 'Email inválido.', 'email');
    const pp = passwordProblem(password); if (pp) return fail(res, 400, pp, 'password');
    if (confirm !== undefined && password !== confirm) return fail(res, 400, 'A confirmação de senha não confere.', 'confirm');
    if (get('SELECT 1 FROM users WHERE email = ?', email)) return fail(res, 409, 'Este email já está cadastrado. Faça login.', 'email');
    if (username === null) username = suggestUsername(email.split('@')[0], usernameTaken);
    const hash = await S.hashPassword(password);
    let uid;
    try {
      uid = tx(() => {
        const r = run('INSERT INTO users(email,password_hash,name,username) VALUES (?,?,?,?)', email, hash, name, username);
        run('INSERT INTO profiles(user_id) VALUES (?)', r.lastInsertRowid);
        notify(r.lastInsertRowid, 'welcome', 'Bem-vindo à Line Collection', 'Sua conta foi criada. Explore os plugins e comece quando quiser.', '/#plugins');
        return Number(r.lastInsertRowid);
      });
    } catch (e) { // corrida: duas registrações simultâneas com o mesmo email/usuário -> UNIQUE constraint
      if (/UNIQUE/i.test(e.message)) {
        return /username/i.test(e.message) ? fail(res, 409, 'Este usuário já está em uso.', 'username')
          : fail(res, 409, 'Este email já está cadastrado. Faça login.', 'email');
      }
      throw e;
    }
    S.createSession(res, uid, req.get('user-agent'), req.body.remember === true);
    res.status(201).json({ ok: true, user: { id: uid, email, name, username, role: 'customer' } });
  } catch (e) { next(e); }
});

const MAX_FAILS = 5, LOCK_MIN = 15;
router.post('/login', limiter(20, 15), async (req, res, next) => {
  try {
    // aceita usuário OU email (campo "identifier"; "username"/"email" mantidos por compatibilidade)
    const ident = clean(req.body.identifier ?? req.body.username ?? req.body.email, 254).toLowerCase(), password = String(req.body.password ?? '');
    if (!ident) return fail(res, 400, 'Informe seu usuário ou email.', 'identifier');
    if (!password) return fail(res, 400, 'Informe sua senha.', 'password');
    const generic = { error: 'Usuário/email ou senha incorretos.', field: 'password' };
    const u = ident.includes('@') ? get('SELECT * FROM users WHERE email = ?', ident) : get('SELECT * FROM users WHERE username = ? COLLATE NOCASE', ident);
    if (!u) { await S.hashPassword('dummy-password'); return res.status(401).json(generic); } // samakan waktu respons
    if (u.locked_until && new Date(u.locked_until) > new Date())
      return fail(res, 429, 'Conta bloqueada temporariamente por muitas tentativas erradas. Tente de novo em alguns minutos.', 'password');
    if (!(await S.verifyPassword(password, u.password_hash))) {
      const fails = u.failed_logins + 1;
      if (fails >= MAX_FAILS) run("UPDATE users SET failed_logins=0, locked_until=datetime('now', ?) WHERE id=?", `+${LOCK_MIN} minutes`, u.id);
      else run('UPDATE users SET failed_logins=? WHERE id=?', fails, u.id);
      return res.status(401).json(generic);
    }
    if (!u.is_active) return fail(res, 403, 'Esta conta está desativada. Entre em contato com o suporte.', 'identifier');
    run('UPDATE users SET failed_logins=0, locked_until=NULL WHERE id=?', u.id);
    S.createSession(res, u.id, req.get('user-agent'), req.body.remember === true);
    res.json({ ok: true, user: publicUser(u) });
  } catch (e) { next(e); }
});

router.post('/logout', (req, res) => { S.destroySession(req, res); res.json({ ok: true }); });

router.get('/me', (req, res) => {
  if (!req.user) return res.json({ user: null });
  const unread = get('SELECT COUNT(*) c FROM notifications WHERE user_id=? AND read_at IS NULL', req.user.id).c;
  const un = get('SELECT username FROM users WHERE id=?', req.user.id);
  res.json({ user: { ...req.user, username: (un && un.username) || null }, csrf: req.session.csrf, unread });
});

router.post('/forgot', limiter(5, 15), async (req, res, next) => {
  try {
    const email = clean(req.body.email, 254).toLowerCase();
    const msg = { ok: true, message: 'Se o email estiver cadastrado, enviaremos um link para redefinir a senha.' };
    const u = isEmail(email) ? get('SELECT id,email,is_active FROM users WHERE email = ?', email) : null;
    if (u && u.is_active) {
      const token = S.randomToken(32);
      run('DELETE FROM password_resets WHERE user_id = ?', u.id);
      run("INSERT INTO password_resets(token_hash,user_id,expires_at) VALUES (?,?,datetime('now','+30 minutes'))", S.sha256(token), u.id);
      await sendMail({ to: u.email, subject: 'Redefinir senha — Line Collection',
        text: `Para redefinir sua senha, abra o link (vale por 30 minutos):\n${config.baseUrl}/redefinir-senha?token=${token}\n\nSe você não pediu isso, ignore este email.` });
    }
    res.json(msg); // resposta idêntica, exista o email ou não
  } catch (e) { next(e); }
});

router.post('/reset', limiter(10, 15), async (req, res, next) => {
  try {
    const { token, password, confirm } = req.body;
    const pp = passwordProblem(password); if (pp) return res.status(400).json({ error: pp });
    if (password !== confirm) return res.status(400).json({ error: 'Confirmação de senha não confere.' });
    const r = get("SELECT * FROM password_resets WHERE token_hash=? AND used_at IS NULL AND expires_at > datetime('now')", S.sha256(String(token || '')));
    if (!r) return res.status(400).json({ error: 'Link inválido ou expirado. Peça um novo.' });
    const hash = await S.hashPassword(password);
    tx(() => {
      run("UPDATE users SET password_hash=?, failed_logins=0, locked_until=NULL, updated_at=datetime('now') WHERE id=?", hash, r.user_id);
      run("UPDATE password_resets SET used_at=datetime('now') WHERE token_hash=?", r.token_hash);
      run('DELETE FROM sessions WHERE user_id=?', r.user_id); // encerra todas as sessões antigas
      notify(r.user_id, 'security', 'Senha alterada', 'Sua senha foi redefinida. Se não foi você, entre em contato com o suporte.', '/conta/configuracoes');
    });
    res.json({ ok: true, message: 'Senha redefinida. Faça login com a nova senha.' });
  } catch (e) { next(e); }
});

module.exports = router;