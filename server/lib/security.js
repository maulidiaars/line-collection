'use strict';
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { config } = require('../config');
const { get, run } = require('../db');

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
const hashPassword = (pw) => bcrypt.hash(pw, 12);
const verifyPassword = (pw, hash) => bcrypt.compare(pw, hash);

function timingSafeEqualStr(a, b) {
  const A = Buffer.from(String(a)), B = Buffer.from(String(b));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

const COOKIE = 'lc_session';
// "Lembrar de mim" marcado -> cookie de 30 dias. Desmarcado -> cookie de SESSÃO (some ao fechar o navegador).
function cookieOpts(remember) {
  const o = { httpOnly: true, sameSite: 'lax', secure: config.isProd, path: '/' };
  if (remember) o.maxAge = config.sessionDays * 864e5;
  return o;
}

function createSession(res, userId, ua, remember = false) {
  const token = randomToken(32);
  const csrf = randomToken(24);
  const expires = new Date(Date.now() + (remember ? config.sessionDays : 1) * 864e5).toISOString();
  run('INSERT INTO sessions(id,user_id,csrf_token,user_agent,expires_at) VALUES (?,?,?,?,?)',
    sha256(token), userId, csrf, String(ua || '').slice(0, 200), expires);
  res.cookie(COOKIE, token, cookieOpts(remember));
}

function destroySession(req, res) {
  const t = req.cookies && req.cookies[COOKIE];
  if (t) run('DELETE FROM sessions WHERE id = ?', sha256(t));
  res.clearCookie(COOKIE, { path: '/' });
}

// Middleware: muat pengguna dari cookie sesi
function loadUser(req, _res, next) {
  req.user = null; req.session = null;
  const t = req.cookies && req.cookies[COOKIE];
  if (t) {
    const s = get(`SELECT s.id sid, s.csrf_token, s.expires_at, u.id, u.email, u.name, u.role, u.is_active
                   FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`, sha256(t));
    if (s && new Date(s.expires_at) > new Date() && s.is_active) {
      req.user = { id: s.id, email: s.email, name: s.name, role: s.role };
      req.session = { id: s.sid, csrf: s.csrf_token };
    } else if (s) {
      run('DELETE FROM sessions WHERE id = ?', s.sid);
    }
  }
  next();
}

const requireAuth = (req, res, next) =>
  req.user ? next() : res.status(401).json({ error: 'Faça login para continuar.' });

// Admin dicek di SERVER dari database, bukan dari data yang dikirim browser
const requireAdmin = (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Faça login para continuar.' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso negado.' });
  next();
};

// CSRF: semua request yang mengubah data wajib membawa token dari sesi
function csrfProtect(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.path.startsWith('/api/webhooks/')) return next(); // diverifikasi dengan tanda tangan
  if (!req.session) return next(); // belum login: endpoint publik punya proteksi sendiri
  const sent = req.get('x-csrf-token') || '';
  if (!timingSafeEqualStr(sent, req.session.csrf)) return res.status(403).json({ error: 'Token de segurança inválido. Recarregue a página.' });
  next();
}

function audit(adminId, action, targetType, targetId, details, ip) {
  run('INSERT INTO audit_log(admin_id,action,target_type,target_id,details,ip) VALUES (?,?,?,?,?,?)',
    adminId, action, targetType || null, targetId == null ? null : String(targetId),
    details ? JSON.stringify(details) : null, ip || null);
}

module.exports = { sha256, randomToken, hashPassword, verifyPassword, timingSafeEqualStr,
  createSession, destroySession, loadUser, requireAuth, requireAdmin, csrfProtect, audit, COOKIE };