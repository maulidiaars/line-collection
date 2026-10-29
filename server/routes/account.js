'use strict';
const express = require('express');
const { get, all, run } = require('../db');
const S = require('../lib/security');
const { clean, passwordProblem } = require('../lib/validate');
const { requireAuth } = require('../security-mw');

const router = express.Router();
router.use(requireAuth);

router.get('/summary', (req, res) => {
  const id = req.user.id;
  res.json({
    plugins: get("SELECT COUNT(*) c FROM entitlements WHERE user_id=? AND status='active'", id).c,
    orders: get('SELECT COUNT(*) c FROM orders WHERE user_id=?', id).c,
    paidOrders: get("SELECT COUNT(*) c FROM orders WHERE user_id=? AND status='paid'", id).c,
    pendingOrders: get("SELECT COUNT(*) c FROM orders WHERE user_id=? AND status='pending'", id).c,
    unread: get('SELECT COUNT(*) c FROM notifications WHERE user_id=? AND read_at IS NULL', id).c,
    recent: all('SELECT id,order_number,status,total_cents,created_at FROM orders WHERE user_id=? ORDER BY id DESC LIMIT 3', id),
  });
});

router.get('/profile', (req, res) => {
  const u = get('SELECT id,email,name,created_at FROM users WHERE id=?', req.user.id);
  const p = get('SELECT phone,country,daw,bio FROM profiles WHERE user_id=?', req.user.id) || {};
  res.json({ ...u, ...p });
});

router.put('/profile', (req, res) => {
  const name = clean(req.body.name, 80);
  if (name.length < 2) return res.status(400).json({ error: 'Informe um nome válido.' });
  // Campos permitidos (lista fechada). role/email/is_active NUNCA são aceitos aqui.
  run("UPDATE users SET name=?, updated_at=datetime('now') WHERE id=?", name, req.user.id);
  run(`INSERT INTO profiles(user_id,phone,country,daw,bio) VALUES (?,?,?,?,?)
       ON CONFLICT(user_id) DO UPDATE SET phone=excluded.phone,country=excluded.country,daw=excluded.daw,bio=excluded.bio,updated_at=datetime('now')`,
    req.user.id, clean(req.body.phone, 30), clean(req.body.country, 60), clean(req.body.daw, 60), clean(req.body.bio, 300));
  res.json({ ok: true });
});

router.post('/password', async (req, res, next) => {
  try {
    const { current, password, confirm } = req.body;
    const u = get('SELECT password_hash FROM users WHERE id=?', req.user.id);
    if (!(await S.verifyPassword(String(current || ''), u.password_hash))) return res.status(400).json({ error: 'Senha atual incorreta.' });
    const pp = passwordProblem(password); if (pp) return res.status(400).json({ error: pp });
    if (password !== confirm) return res.status(400).json({ error: 'Confirmação de senha não confere.' });
    run("UPDATE users SET password_hash=?, updated_at=datetime('now') WHERE id=?", await S.hashPassword(password), req.user.id);
    run('DELETE FROM sessions WHERE user_id=? AND id<>?', req.user.id, req.session.id); // derruba outros dispositivos
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.get('/plugins', (req, res) => {
  const rows = all(`SELECT e.id, e.source, e.reason, e.granted_at, e.order_id, o.order_number,
        p.id product_id, p.slug, p.name, p.category, p.accent, p.image
      FROM entitlements e JOIN products p ON p.id=e.product_id LEFT JOIN orders o ON o.id=e.order_id
      WHERE e.user_id=? AND e.status='active' ORDER BY p.sort_order`, req.user.id);
  res.json(rows.map(r => {
    const v = get('SELECT id,version,file_size,original_name FROM product_versions WHERE product_id=? AND is_current=1 AND file_path IS NOT NULL ORDER BY id DESC LIMIT 1', r.product_id);
    return { ...r, version: v ? v.version : null, versionId: v ? v.id : null, fileAvailable: !!v, fileSize: v ? v.file_size : null };
  }));
});

router.get('/orders', (req, res) => {
  const orders = all('SELECT * FROM orders WHERE user_id=? ORDER BY id DESC', req.user.id);
  res.json(orders.map(o => ({ ...o,
    items: all('SELECT product_name,unit_price_cents FROM order_items WHERE order_id=?', o.id),
    payments: all('SELECT id,provider,status,method,amount_cents,created_at FROM payments WHERE order_id=? ORDER BY id DESC', o.id) })));
});

router.get('/payments', (req, res) => {
  res.json(all(`SELECT pay.id, pay.provider, pay.status, pay.method, pay.amount_cents, pay.created_at, o.order_number
    FROM payments pay JOIN orders o ON o.id=pay.order_id WHERE o.user_id=? ORDER BY pay.id DESC`, req.user.id));
});

router.get('/notifications', (req, res) => {
  res.json(all('SELECT id,type,title,body,link,read_at,created_at FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 100', req.user.id));
});
router.post('/notifications/read', (req, res) => {
  const id = parseInt(req.body.id, 10);
  if (id) run("UPDATE notifications SET read_at=datetime('now') WHERE id=? AND user_id=? AND read_at IS NULL", id, req.user.id);
  else run("UPDATE notifications SET read_at=datetime('now') WHERE user_id=? AND read_at IS NULL", req.user.id);
  res.json({ ok: true });
});

module.exports = router;
