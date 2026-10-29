'use strict';
const express = require('express');
const multer = require('multer');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { get, all, run, tx } = require('../db');
const S = require('../lib/security');
const shop = require('../lib/shop');
const { notify } = require('../lib/notify');
const { clean } = require('../lib/validate');
const { config } = require('../config');

const router = express.Router();
router.use(S.requireAdmin); // TODAS as rotas /api/admin exigem admin verificado no banco

const A = (req, action, type, id, details) => S.audit(req.user.id, action, type, id, details, req.ip);
const int = (v, d = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };

// ---------- Ringkasan ----------
router.get('/summary', (req, res) => {
  const rev = get("SELECT COALESCE(SUM(total_cents),0) s FROM orders WHERE status='paid'").s; // SOMENTE pesanan paga & terverifikasi
  res.json({
    users: get("SELECT COUNT(*) c FROM users WHERE role='customer'").c,
    orders: get('SELECT COUNT(*) c FROM orders').c,
    paid: get("SELECT COUNT(*) c FROM orders WHERE status='paid'").c,
    pending: get("SELECT COUNT(*) c FROM orders WHERE status='pending'").c,
    failed: get("SELECT COUNT(*) c FROM orders WHERE status IN ('failed','cancelled')").c,
    refunded: get("SELECT COUNT(*) c FROM orders WHERE status='refunded'").c,
    revenueCents: rev,
    manualGrants: get("SELECT COUNT(*) c FROM entitlements WHERE source='admin_grant' AND status='active'").c,
    top: all(`SELECT oi.product_name name, COUNT(*) sold, SUM(oi.unit_price_cents) cents FROM order_items oi
              JOIN orders o ON o.id=oi.order_id WHERE o.status='paid' GROUP BY oi.product_id ORDER BY sold DESC LIMIT 5`),
    activity: all(`SELECT a.action, a.target_type, a.target_id, a.created_at, u.email admin FROM audit_log a LEFT JOIN users u ON u.id=a.admin_id ORDER BY a.id DESC LIMIT 10`),
    recentOrders: all(`SELECT o.order_number, o.status, o.total_cents, o.created_at, u.email FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.id DESC LIMIT 8`),
  });
});

// ---------- Produk ----------
router.get('/products', (req, res) => {
  res.json(all('SELECT * FROM products ORDER BY sort_order').map(p => ({
    ...p, features: JSON.parse(p.features || '[]'),
    includes: p.kind === 'bundle' ? all('SELECT plugin_id FROM bundle_items WHERE bundle_id=?', p.id).map(r => r.plugin_id) : [],
    sold: get("SELECT COUNT(*) c FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.product_id=? AND o.status='paid'", p.id).c,
    versions: all('SELECT id,version,platform,original_name,file_size,sha256,is_current,changelog,created_at,file_path IS NOT NULL has_file FROM product_versions WHERE product_id=? ORDER BY id DESC', p.id),
  })));
});

function readProductBody(b, isNew) {
  const name = clean(b.name, 80);
  if (name.length < 2) throw shop.httpErr(400, 'Informe o nome do produto.');
  const price = int(b.priceCents, -1);
  if (price < 0 || price > 100000000) throw shop.httpErr(400, 'Preço inválido.');
  let launch = b.launchPriceCents === '' || b.launchPriceCents == null ? null : int(b.launchPriceCents, -1);
  if (launch !== null && (launch < 0 || launch > price)) throw shop.httpErr(400, 'Preço de lançamento inválido (deve ser ≤ preço normal).');
  const features = Array.isArray(b.features) ? b.features.map(f => clean(f, 300)).filter(Boolean).slice(0, 20) : [];
  const accent = /^#[0-9a-fA-F]{6}$/.test(b.accent || '') ? b.accent : '#33E6FF';
  return { name, price, launch, features, accent, category: clean(b.category, 80), description: clean(b.description, 2000), isActive: b.isActive ? 1 : 0 };
}
const slugify = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);

router.post('/products', (req, res, next) => {
  try {
    const d = readProductBody(req.body, true);
    const kind = req.body.kind === 'bundle' ? 'bundle' : 'plugin';
    let slug = slugify(clean(req.body.slug, 50) || d.name); if (!slug) throw shop.httpErr(400, 'Slug inválido.');
    if (get('SELECT 1 FROM products WHERE slug=?', slug)) throw shop.httpErr(409, 'Slug já existe.');
    const id = tx(() => {
      const r = run(`INSERT INTO products(slug,name,category,description,features,accent,kind,price_cents,launch_price_cents,is_active,sort_order)
        VALUES (?,?,?,?,?,?,?,?,?,?,(SELECT COALESCE(MAX(sort_order),0)+1 FROM products))`,
        slug, d.name, d.category, d.description, JSON.stringify(d.features), d.accent, kind, d.price, d.launch, d.isActive);
      if (kind === 'bundle') setBundleItems(Number(r.lastInsertRowid), req.body.includes);
      return Number(r.lastInsertRowid);
    });
    A(req, 'product.create', 'product', id, { slug, kind, price: d.price });
    res.status(201).json({ id });
  } catch (e) { next(e); }
});

function setBundleItems(bundleId, ids) {
  const list = [...new Set((Array.isArray(ids) ? ids : []).map(Number))];
  if (!list.length) throw shop.httpErr(400, 'Bundle precisa ter pelo menos 1 plugin.');
  for (const pid of list) {
    const p = get('SELECT kind FROM products WHERE id=?', pid);
    if (!p || p.kind !== 'plugin') throw shop.httpErr(400, 'Bundle só pode conter plugins existentes.');
  }
  run('DELETE FROM bundle_items WHERE bundle_id=?', bundleId);
  for (const pid of list) run('INSERT INTO bundle_items(bundle_id,plugin_id) VALUES (?,?)', bundleId, pid);
}

router.put('/products/:id', (req, res, next) => {
  try {
    const p = get('SELECT * FROM products WHERE id=?', int(req.params.id));
    if (!p) throw shop.httpErr(404, 'Produto não encontrado.');
    const d = readProductBody(req.body, false);
    tx(() => {
      run(`UPDATE products SET name=?,category=?,description=?,features=?,accent=?,price_cents=?,launch_price_cents=?,is_active=?,updated_at=datetime('now') WHERE id=?`,
        d.name, d.category, d.description, JSON.stringify(d.features), d.accent, d.price, d.launch, d.isActive, p.id);
      if (p.kind === 'bundle' && req.body.includes) setBundleItems(p.id, req.body.includes);
    });
    A(req, 'product.update', 'product', p.id, { before: { price: p.price_cents, launch: p.launch_price_cents, active: p.is_active }, after: { price: d.price, launch: d.launch, active: d.isActive } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.put('/settings/launch', (req, res) => {
  const on = req.body.active ? '1' : '0';
  run("INSERT INTO settings(key,value) VALUES ('launch_active',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", on);
  A(req, 'settings.launch', 'settings', 'launch_active', { active: on });
  res.json({ ok: true, active: on === '1' });
});
router.get('/settings', (req, res) => res.json({ launchActive: shop.launchActive(), paymentProvider: config.paymentProvider }));

// ---------- Upload ----------
const MAGIC = { // validasi isi file (bukan hanya ekstensi)
  '.zip': (b) => b[0] === 0x50 && b[1] === 0x4b,
  '.exe': (b) => b[0] === 0x4d && b[1] === 0x5a,
  '.msi': (b) => b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0,
  '.7z':  (b) => b[0] === 0x37 && b[1] === 0x7a && b[2] === 0xbc && b[3] === 0xaf,
};
const tmpDir = () => { const d = path.join(config.storageDir, 'tmp'); fs.mkdirSync(d, { recursive: true }); return d; };
const upload = multer({ storage: multer.diskStorage({ destination: (_r, _f, cb) => cb(null, tmpDir()), filename: (_r, _f, cb) => cb(null, crypto.randomUUID()) }),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1 } });

router.post('/products/:id/versions', upload.single('file'), async (req, res, next) => {
  const tmp = req.file && req.file.path;
  try {
    const p = get("SELECT * FROM products WHERE id=? AND kind='plugin'", int(req.params.id));
    if (!p) throw shop.httpErr(404, 'Plugin não encontrado (bundle não tem arquivo próprio).');
    const version = clean(req.body.version, 20);
    if (!/^\d+\.\d+(\.\d+)?([-.][0-9A-Za-z.]+)?$/.test(version)) throw shop.httpErr(400, 'Versão inválida. Use formato 1.0.0');
    if (!req.file) throw shop.httpErr(400, 'Selecione o arquivo do plugin.');
    const ext = path.extname(req.file.originalname).toLowerCase();
    if (!MAGIC[ext]) throw shop.httpErr(400, 'Tipo de arquivo não permitido. Use .zip, .exe, .msi ou .7z.');
    const head = Buffer.alloc(8); const fd = fs.openSync(tmp, 'r'); fs.readSync(fd, head, 0, 8, 0); fs.closeSync(fd);
    if (!MAGIC[ext](head)) throw shop.httpErr(400, `O conteúdo do arquivo não corresponde a um ${ext} válido.`);
    const hash = crypto.createHash('sha256'); await new Promise((ok, ko) => fs.createReadStream(tmp).on('data', c => hash.update(c)).on('end', ok).on('error', ko));
    const stored = crypto.randomBytes(16).toString('hex') + ext;
    const dir = path.join(config.storageDir, 'files'); fs.mkdirSync(dir, { recursive: true });
    fs.renameSync(tmp, path.join(dir, stored));
    const makeCurrent = req.body.makeCurrent !== 'false';
    const vid = tx(() => {
      if (makeCurrent) run('UPDATE product_versions SET is_current=0 WHERE product_id=?', p.id);
      const dup = get('SELECT id FROM product_versions WHERE product_id=? AND version=? AND platform=?', p.id, version, 'windows-vst3');
      if (dup) throw shop.httpErr(409, `A versão ${version} já existe para este plugin.`);
      return Number(run(`INSERT INTO product_versions(product_id,version,changelog,file_path,original_name,file_size,sha256,is_current) VALUES (?,?,?,?,?,?,?,?)`,
        p.id, version, clean(req.body.changelog, 1000), stored, path.basename(req.file.originalname).slice(0, 120), req.file.size, hash.digest('hex'), makeCurrent ? 1 : 0).lastInsertRowid);
    });
    A(req, 'version.upload', 'product', p.id, { version, size: req.file.size });
    if (makeCurrent) for (const e of all("SELECT user_id FROM entitlements WHERE product_id=? AND status='active'", p.id))
      notify(e.user_id, 'new_version', `Nova versão: ${p.name} ${version}`, 'Uma nova versão está disponível para download em Meus Plugins.', '/conta/plugins');
    res.status(201).json({ id: vid });
  } catch (e) {
    if (tmp && fs.existsSync(tmp)) fs.unlinkSync(tmp);
    if (e.code === 'LIMIT_FILE_SIZE') e = shop.httpErr(413, `Arquivo maior que ${config.maxUploadMb} MB.`);
    next(e);
  }
});

router.put('/versions/:id/current', (req, res, next) => {
  try {
    const v = get('SELECT * FROM product_versions WHERE id=?', int(req.params.id));
    if (!v) throw shop.httpErr(404, 'Versão não encontrada.');
    tx(() => { run('UPDATE product_versions SET is_current=0 WHERE product_id=?', v.product_id); run('UPDATE product_versions SET is_current=1 WHERE id=?', v.id); });
    A(req, 'version.set_current', 'version', v.id, { version: v.version });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Imagem de produto (publik) — hanya png/jpg/webp, dicek magic bytes
const imgUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024, files: 1 } });
router.post('/products/:id/image', imgUpload.single('image'), (req, res, next) => {
  try {
    const p = get('SELECT id FROM products WHERE id=?', int(req.params.id));
    if (!p) throw shop.httpErr(404, 'Produto não encontrado.');
    if (!req.file) throw shop.httpErr(400, 'Selecione uma imagem.');
    const b = req.file.buffer; let ext = null;
    if (b[0] === 0x89 && b[1] === 0x50) ext = 'png'; else if (b[0] === 0xff && b[1] === 0xd8) ext = 'jpg';
    else if (b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP') ext = 'webp';
    if (!ext) throw shop.httpErr(400, 'Imagem inválida. Use PNG, JPG ou WEBP.');
    const name = `produto-${p.id}-${crypto.randomBytes(4).toString('hex')}`;
    const dir = path.join(__dirname, '..', '..', 'public', 'assets', 'img', 'uploads'); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${name}.${ext}`), b);
    run("UPDATE products SET image=?, updated_at=datetime('now') WHERE id=?", `uploads/${name}`, p.id);
    A(req, 'product.image', 'product', p.id, { file: `${name}.${ext}` });
    res.json({ ok: true, image: `uploads/${name}`, ext });
  } catch (e) { next(e); }
});

// ---------- Pesanan ----------
router.get('/orders', (req, res) => {
  const q = `%${clean(req.query.q, 60)}%`, st = clean(req.query.status, 20);
  const rows = all(`SELECT o.id,o.order_number,o.status,o.total_cents,o.created_at,o.paid_at,u.email,u.name FROM orders o JOIN users u ON u.id=o.user_id
    WHERE (o.order_number LIKE ? OR u.email LIKE ?) ${st ? 'AND o.status = ?' : ''} ORDER BY o.id DESC LIMIT 200`, ...(st ? [q, q, st] : [q, q]));
  res.json(rows);
});
router.get('/orders/:id', (req, res) => {
  const o = get('SELECT o.*,u.email,u.name FROM orders o JOIN users u ON u.id=o.user_id WHERE o.id=?', int(req.params.id));
  if (!o) return res.status(404).json({ error: 'Pedido não encontrado.' });
  res.json({ ...o, items: all('SELECT product_name,unit_price_cents FROM order_items WHERE order_id=?', o.id),
    payments: all('SELECT id,provider,provider_payment_id,status,raw_status,method,amount_cents,created_at,updated_at FROM payments WHERE order_id=? ORDER BY id DESC', o.id) });
});

router.post('/orders/:id/cancel', (req, res, next) => {
  try {
    const o = get('SELECT * FROM orders WHERE id=?', int(req.params.id));
    if (!o) throw shop.httpErr(404, 'Pedido não encontrado.');
    shop.cancelPendingOrder(o.id, o.user_id);
    A(req, 'order.cancel', 'order', o.id, { number: o.order_number });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/orders/:id/refund', async (req, res, next) => {
  try {
    const o = get('SELECT * FROM orders WHERE id=?', int(req.params.id));
    if (!o) throw shop.httpErr(404, 'Pedido não encontrado.');
    if (o.status !== 'paid') throw shop.httpErr(409, 'Só pedidos pagos podem ser reembolsados.');
    const reason = clean(req.body.reason, 300); if (reason.length < 3) throw shop.httpErr(400, 'Informe o motivo do reembolso.');
    const pay = get("SELECT * FROM payments WHERE order_id=? AND status='approved' ORDER BY id DESC LIMIT 1", o.id);
    if (!pay) throw shop.httpErr(409, 'Pagamento aprovado não encontrado.');
    if (pay.provider === 'mercadopago') {
      // Reembolso real: pede ao Mercado Pago. O webhook de confirmação então finaliza o pedido (refunded).
      const r = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(pay.provider_payment_id)}/refunds`, {
        method: 'POST', headers: { Authorization: `Bearer ${config.mp.accessToken}`, 'Content-Type': 'application/json', 'X-Idempotency-Key': `refund-${pay.id}` }, body: '{}' });
      if (!r.ok) throw shop.httpErr(502, 'Mercado Pago recusou o reembolso: ' + (await r.text()).slice(0, 200));
      A(req, 'order.refund_requested', 'order', o.id, { reason, provider: 'mercadopago' });
      return res.json({ ok: true, message: 'Reembolso solicitado ao Mercado Pago. O pedido muda para "reembolsado" quando o webhook confirmar.' });
    }
    shop.applyPaymentResult({ paymentRowId: pay.id, providerPaymentId: pay.provider_payment_id, status: 'refunded', method: pay.method, amountCents: pay.amount_cents, currency: pay.currency, rawStatus: 'sandbox:refunded' });
    A(req, 'order.refund', 'order', o.id, { reason, provider: 'sandbox' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------- Pengguna ----------
router.get('/users', (req, res) => {
  const q = `%${clean(req.query.q, 80)}%`;
  res.json(all(`SELECT u.id,u.email,u.name,u.role,u.is_active,u.created_at,
      (SELECT COUNT(*) FROM entitlements e WHERE e.user_id=u.id AND e.status='active') plugins,
      (SELECT COUNT(*) FROM orders o WHERE o.user_id=u.id) orders
    FROM users u WHERE u.email LIKE ? OR u.name LIKE ? ORDER BY u.id DESC LIMIT 200`, q, q));
});
router.get('/users/:id', (req, res) => {
  const id = int(req.params.id);
  const u = get('SELECT id,email,name,role,is_active,created_at FROM users WHERE id=?', id);
  if (!u) return res.status(404).json({ error: 'Usuário não encontrado.' });
  res.json({ ...u, profile: get('SELECT phone,country,daw,bio FROM profiles WHERE user_id=?', id) || {},
    orders: all('SELECT id,order_number,status,total_cents,created_at FROM orders WHERE user_id=? ORDER BY id DESC', id),
    entitlements: all(`SELECT e.id,e.source,e.reason,e.status,e.granted_at,e.revoked_at,e.revoked_reason,p.name FROM entitlements e JOIN products p ON p.id=e.product_id WHERE e.user_id=? ORDER BY e.id DESC`, id) });
});
router.put('/users/:id/active', (req, res, next) => {
  try {
    const id = int(req.params.id); const u = get('SELECT * FROM users WHERE id=?', id);
    if (!u) throw shop.httpErr(404, 'Usuário não encontrado.');
    if (id === req.user.id) throw shop.httpErr(400, 'Você não pode desativar a própria conta.');
    const active = req.body.active ? 1 : 0;
    run("UPDATE users SET is_active=?, updated_at=datetime('now') WHERE id=?", active, id);
    if (!active) run('DELETE FROM sessions WHERE user_id=?', id);
    A(req, active ? 'user.activate' : 'user.deactivate', 'user', id, { email: u.email });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------- Pemberian & pencabutan akses manual ----------
const REASONS = ['presente', 'promoção', 'compensação', 'pedido manual', 'outro'];
router.post('/users/:id/grant', (req, res, next) => {
  try {
    const uid = int(req.params.id); const u = get('SELECT * FROM users WHERE id=?', uid);
    const p = get('SELECT * FROM products WHERE id=?', int(req.body.productId));
    if (!u || !p) throw shop.httpErr(404, 'Usuário ou produto não encontrado.');
    const cat = clean(req.body.reasonType, 30); if (!REASONS.includes(cat)) throw shop.httpErr(400, 'Selecione o tipo de motivo.');
    const note = clean(req.body.reasonNote, 300);
    if (req.body.confirm !== true) throw shop.httpErr(400, 'Confirmação necessária.');
    const reason = note ? `${cat}: ${note}` : cat;
    const granted = tx(() => {
      const g = shop.grantProduct(uid, p.id, { source: 'admin_grant', reason, grantedBy: req.user.id });
      if (g.length) notify(uid, 'plugin_granted', `Novo plugin na sua conta: ${p.name}`, `O suporte liberou "${p.name}" na sua conta (${cat}). Já está em Meus Plugins.`, '/conta/plugins');
      return g;
    });
    if (!granted.length) throw shop.httpErr(409, 'O usuário já possui acesso a todos os plugins deste item.');
    A(req, 'entitlement.grant', 'user', uid, { product: p.slug, reason, plugins: granted.length });
    res.status(201).json({ ok: true, granted: granted.length });
  } catch (e) { next(e); }
});
router.post('/entitlements/:id/revoke', (req, res, next) => {
  try {
    const e = get('SELECT e.*,p.name FROM entitlements e JOIN products p ON p.id=e.product_id WHERE e.id=?', int(req.params.id));
    if (!e) throw shop.httpErr(404, 'Acesso não encontrado.');
    if (e.status !== 'active') throw shop.httpErr(409, 'Este acesso já foi revogado.');
    const reason = clean(req.body.reason, 300); if (reason.length < 3) throw shop.httpErr(400, 'Informe o motivo.');
    if (req.body.confirm !== true) throw shop.httpErr(400, 'Confirmação necessária.');
    run("UPDATE entitlements SET status='revoked', revoked_at=datetime('now'), revoked_reason=? WHERE id=?", reason, e.id);
    notify(e.user_id, 'access_revoked', `Acesso removido: ${e.name}`, 'Seu acesso a este plugin foi removido. Fale com o suporte se achar que foi um engano.', '/conta/plugins');
    A(req, 'entitlement.revoke', 'user', e.user_id, { product: e.name, reason });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
router.post('/users/:id/notify', (req, res, next) => {
  try {
    const uid = int(req.params.id); if (!get('SELECT 1 FROM users WHERE id=?', uid)) throw shop.httpErr(404, 'Usuário não encontrado.');
    const title = clean(req.body.title, 100), body = clean(req.body.body, 500);
    if (!title) throw shop.httpErr(400, 'Informe o título.');
    notify(uid, 'info', title, body, null);
    A(req, 'notification.send', 'user', uid, { title });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.get('/audit', (req, res) => res.json(all(`SELECT a.id,a.action,a.target_type,a.target_id,a.details,a.ip,a.created_at,u.email admin FROM audit_log a LEFT JOIN users u ON u.id=a.admin_id ORDER BY a.id DESC LIMIT 200`)));

module.exports = router;
