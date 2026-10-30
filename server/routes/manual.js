'use strict';
// Pagamento MANUAL: transferência / PIX + comprovante. O cliente envia a foto do comprovante e o ADMIN aprova.
// Aprovado -> o pedido vira "pago" e os plugins entram na conta do cliente (mesma função dos outros provedores: applyPaymentResult).
const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { get, all, run } = require('../db');
const S = require('../lib/security');
const shop = require('../lib/shop');
const { notify, notifyAdmins } = require('../lib/notify');
const { clean } = require('../lib/validate');
const { sendMail } = require('../lib/mailer');
const { config } = require('../config');
let QR = null; try { QR = require('qrcode'); } catch (_) { /* opcional: sem o pacote "qrcode" só some a imagem do QR */ }

const router = express.Router();

/* ---------- dados de pagamento (editáveis no painel admin) ---------- */
const KEYS = ['pix_type', 'pix_key', 'holder', 'doc', 'city', 'bank', 'agency', 'account', 'note'];
const getPay = () => { const o = {}; for (const k of KEYS) { const r = get('SELECT value FROM settings WHERE key=?', 'pay_' + k); o[k] = r ? r.value : ''; } return o; };
const setPay = (k, v) => run('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', 'pay_' + k, v);

/* ---------- PIX "copia e cola" (BR Code estático com valor e identificador do pedido) ---------- */
const tlv = (id, v) => id + String(v.length).padStart(2, '0') + v;
function crc16(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
const ascii = (s, max) => (String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9 ]/g, '').toUpperCase().trim().slice(0, max)) || 'NA';
function normKey(type, key) {
  key = String(key || '').trim();
  if (type === 'cpf' || type === 'cnpj') return key.replace(/\D/g, '');
  if (type === 'phone') { const d = key.replace(/\D/g, ''); return d.startsWith('55') && d.length >= 12 ? '+' + d : '+55' + d; }
  if (type === 'email') return key.toLowerCase();
  return key;
}
function pixPayload({ key, name, city, amountCents, txid }) {
  const account = tlv('26', tlv('00', 'br.gov.bcb.pix') + tlv('01', key));
  let p = tlv('00', '01') + tlv('01', '11') + account + tlv('52', '0000') + tlv('53', '986') +
    tlv('54', (amountCents / 100).toFixed(2)) + tlv('58', 'BR') + tlv('59', ascii(name, 25)) + tlv('60', ascii(city || 'BRASIL', 15)) +
    tlv('62', tlv('05', String(txid).replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***')) + '6304';
  return p + crc16(p);
}

/* ---------- arquivo do comprovante: só JPG / PNG / WEBP / PDF (conferido pelo conteúdo, não pelo nome) ---------- */
function sniff(b) {
  if (b.length < 12) return null;
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return { ext: 'jpg', mime: 'image/jpeg' };
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return { ext: 'png', mime: 'image/png' };
  if (b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
  if (b.subarray(0, 5).toString() === '%PDF-') return { ext: 'pdf', mime: 'application/pdf' };
  return null;
}
const proofDir = () => { const d = path.join(config.storageDir, 'proofs'); fs.mkdirSync(d, { recursive: true }); return d; };
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 6 * 1024 * 1024, files: 1 } });
const proofLimiter = rateLimit({ windowMs: 30 * 60e3, max: 15, standardHeaders: true, legacyHeaders: false, skip: () => process.env.NODE_ENV === 'test',
  message: { error: 'Muitos envios. Aguarde alguns minutos e tente de novo.' } });
const takeFile = (req, res, next) => upload.single('file')(req, res, (err) => {
  if (!err) return next();
  res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Arquivo grande demais (máximo 6 MB).' : 'Falha no envio do arquivo.' });
});

function mailAdmins(subject, text) {            // e-mail só se o SMTP estiver configurado (o aviso dentro do site sempre existe)
  if (!config.smtp.host) return;
  for (const a of all("SELECT email FROM users WHERE role='admin' AND is_active=1")) sendMail({ to: a.email, subject, text }).catch(() => {});
}
const myOrder = (req, number) => get('SELECT * FROM orders WHERE order_number=? AND user_id=?', number, req.user.id);

/* =============================== CLIENTE =============================== */
router.get('/orders/:number', S.requireAuth, async (req, res, next) => {
  try {
    const o = myOrder(req, req.params.number);
    if (!o) return res.status(404).json({ error: 'Pedido não encontrado.' });
    const items = all('SELECT product_name,unit_price_cents FROM order_items WHERE order_id=?', o.id);
    const proofs = all('SELECT id,status,note,reject_reason,mime,size,created_at,reviewed_at FROM payment_proofs WHERE order_id=? AND status<>\'replaced\' ORDER BY id DESC', o.id);
    const pay = getPay(), configured = !!(pay.pix_key || pay.account);
    let pix = null;
    if (pay.pix_key && pay.holder) {
      const payload = pixPayload({ key: normKey(pay.pix_type, pay.pix_key), name: pay.holder, city: pay.city, amountCents: o.total_cents, txid: o.order_number });
      let qr = null;
      if (QR) { try { qr = await QR.toString(payload, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }); } catch (_) {} }
      pix = { payload, qr, key: pay.pix_key, type: pay.pix_type };
    }
    res.json({
      order: { number: o.order_number, status: o.status, total_cents: o.total_cents, created_at: o.created_at, paid_at: o.paid_at, items },
      provider: config.paymentProvider, configured,
      pay: { holder: pay.holder, doc: pay.doc, bank: pay.bank, agency: pay.agency, account: pay.account, note: pay.note },
      pix, proofs, canUpload: o.status === 'pending' && configured, isAdmin: req.user.role === 'admin',
    });
  } catch (e) { next(e); }
});

router.post('/orders/:number/proof', S.requireAuth, proofLimiter, takeFile, (req, res, next) => {
  try {
    const o = myOrder(req, req.params.number);
    if (!o) return res.status(404).json({ error: 'Pedido não encontrado.' });
    if (o.status !== 'pending') return res.status(409).json({ error: o.status === 'paid' ? 'Este pedido já foi pago.' : 'Este pedido não aceita mais comprovante.' });
    if (!req.file) return res.status(400).json({ error: 'Selecione a imagem ou o PDF do comprovante.' });
    const kind = sniff(req.file.buffer);
    if (!kind) return res.status(400).json({ error: 'Formato inválido. Envie JPG, PNG, WEBP ou PDF.' });
    const name = crypto.randomUUID() + '.' + kind.ext;
    fs.writeFileSync(path.join(proofDir(), name), req.file.buffer, { mode: 0o600 });
    run("UPDATE payment_proofs SET status='replaced' WHERE order_id=? AND status='pending'", o.id);   // o último envio substitui o anterior
    const r = run('INSERT INTO payment_proofs(order_id,user_id,file_path,original_name,mime,size,note) VALUES (?,?,?,?,?,?,?)',
      o.id, req.user.id, name, clean(req.file.originalname, 120), kind.mime, req.file.size, clean(req.body.note, 300) || null);
    notifyAdmins('admin_proof', 'Novo comprovante: ' + o.order_number,
      `${req.user.name} enviou o comprovante de ${shop.brl(o.total_cents)}. Confira e aprove para liberar os plugins.`, '/admin/pagamentos');
    notify(req.user.id, 'proof_sent', 'Comprovante recebido', `Recebemos o comprovante do pedido ${o.order_number}. Assim que for aprovado, seus plugins são liberados.`, '/conta/pedidos');
    mailAdmins('Novo comprovante: ' + o.order_number, `${req.user.name} <${req.user.email}> enviou o comprovante do pedido ${o.order_number} (${shop.brl(o.total_cents)}).\n${config.baseUrl}/admin/pagamentos`);
    res.status(201).json({ ok: true, id: Number(r.lastInsertRowid) });
  } catch (e) { next(e); }
});

// Arquivo do comprovante: só o dono do pedido ou um admin
router.get('/proofs/:id/file', S.requireAuth, (req, res) => {
  const p = get('SELECT * FROM payment_proofs WHERE id=?', parseInt(req.params.id, 10) || 0);
  if (!p || (p.user_id !== req.user.id && req.user.role !== 'admin')) return res.status(404).json({ error: 'Arquivo não encontrado.' });
  const f = path.join(proofDir(), path.basename(p.file_path));
  if (!fs.existsSync(f)) return res.status(404).json({ error: 'Arquivo não encontrado.' });
  res.set({ 'Content-Type': p.mime, 'Content-Disposition': `inline; filename="comprovante-${p.id}"`, 'Cache-Control': 'private, no-store' });
  res.sendFile(f);
});

// Situação do último comprovante de cada pedido (usado no painel da conta)
router.get('/my', S.requireAuth, (req, res) => {
  res.json(all(`SELECT o.order_number, p.status, p.reject_reason, p.created_at FROM payment_proofs p JOIN orders o ON o.id=p.order_id
    WHERE p.user_id=? AND p.id=(SELECT MAX(id) FROM payment_proofs WHERE order_id=p.order_id AND status<>'replaced')`, req.user.id));
});

/* ================================ ADMIN ================================ */
const adm = express.Router();
adm.use(S.requireAdmin);
router.use('/admin', adm);
const A = (req, action, type, id, details) => S.audit(req.user.id, action, type, id, details, req.ip);
const itemsOf = (orderId) => all('SELECT product_name,unit_price_cents FROM order_items WHERE order_id=?', orderId);

adm.get('/counts', (req, res) => res.json({
  pendingProofs: get("SELECT COUNT(*) c FROM payment_proofs WHERE status='pending'").c,
  awaitingOrders: get("SELECT COUNT(*) c FROM orders o WHERE o.status='pending' AND NOT EXISTS (SELECT 1 FROM payment_proofs p WHERE p.order_id=o.id AND p.status='pending')").c,
  unread: get('SELECT COUNT(*) c FROM notifications WHERE user_id=? AND read_at IS NULL', req.user.id).c,
  latest: all('SELECT id,type,title,body,link,created_at FROM notifications WHERE user_id=? AND read_at IS NULL ORDER BY id DESC LIMIT 3', req.user.id),
}));

adm.get('/queue', (req, res) => {
  const st = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : null;
  const proofs = all(`SELECT p.id,p.status,p.note,p.mime,p.size,p.created_at,p.reviewed_at,p.reject_reason,
      o.id order_id,o.order_number,o.total_cents,o.status order_status,o.created_at order_created, u.id user_id,u.name,u.email,u.username
    FROM payment_proofs p JOIN orders o ON o.id=p.order_id JOIN users u ON u.id=p.user_id
    WHERE p.status<>'replaced' ${st ? 'AND p.status=?' : ''} ORDER BY (p.status='pending') DESC, p.id DESC LIMIT 200`, ...(st ? [st] : []))
    .map(p => ({ ...p, items: itemsOf(p.order_id) }));
  const awaiting = all(`SELECT o.id,o.order_number,o.total_cents,o.created_at,u.name,u.email,u.username FROM orders o JOIN users u ON u.id=o.user_id
    WHERE o.status='pending' AND NOT EXISTS (SELECT 1 FROM payment_proofs p WHERE p.order_id=o.id AND p.status='pending') ORDER BY o.id DESC LIMIT 100`)
    .map(o => ({ ...o, items: itemsOf(o.id) }));
  res.json({ proofs, awaiting });
});

// Libera o pedido: marca como pago e dá acesso aos plugins na conta do cliente
function approveOrder(order, tag) {
  if (order.status === 'paid') return { already: true };
  if (!['pending', 'failed'].includes(order.status)) throw shop.httpErr(409, 'Este pedido está "' + order.status + '" e não pode ser aprovado.');
  let pay = get("SELECT id FROM payments WHERE order_id=? AND provider='manual' ORDER BY id DESC LIMIT 1", order.id);
  if (!pay) pay = { id: Number(run("INSERT INTO payments(order_id,provider,status,amount_cents,currency,method) VALUES (?,?,?,?,?,?)", order.id, 'manual', 'pending', order.total_cents, order.currency, 'transfer').lastInsertRowid) };
  return shop.applyPaymentResult({ paymentRowId: pay.id, providerPaymentId: 'manual-' + order.id + '-' + Date.now(), status: 'approved',
    method: 'pix/transfer', amountCents: order.total_cents, currency: order.currency, rawStatus: tag });
}

adm.post('/proofs/:id/approve', (req, res, next) => {
  try {
    const p = get('SELECT * FROM payment_proofs WHERE id=?', parseInt(req.params.id, 10) || 0);
    if (!p) return res.status(404).json({ error: 'Comprovante não encontrado.' });
    if (p.status !== 'pending') return res.status(409).json({ error: 'Este comprovante já foi analisado.' });
    const order = get('SELECT * FROM orders WHERE id=?', p.order_id);
    const r = approveOrder(order, 'proof:' + p.id);
    run("UPDATE payment_proofs SET status='approved', reviewed_by=?, reviewed_at=datetime('now') WHERE id=?", req.user.id, p.id);
    run("UPDATE payment_proofs SET status='replaced' WHERE order_id=? AND status='pending'", p.order_id);
    A(req, 'proof.approve', 'order', order.order_number, { proof: p.id, total: order.total_cents });
    res.json({ ok: true, result: r });
  } catch (e) { next(e); }
});

adm.post('/proofs/:id/reject', (req, res, next) => {
  try {
    const reason = clean(req.body.reason, 300);
    if (reason.length < 3) return res.status(400).json({ error: 'Informe o motivo para o cliente.' });
    const p = get('SELECT * FROM payment_proofs WHERE id=?', parseInt(req.params.id, 10) || 0);
    if (!p) return res.status(404).json({ error: 'Comprovante não encontrado.' });
    if (p.status !== 'pending') return res.status(409).json({ error: 'Este comprovante já foi analisado.' });
    const order = get('SELECT * FROM orders WHERE id=?', p.order_id);
    run("UPDATE payment_proofs SET status='rejected', reject_reason=?, reviewed_by=?, reviewed_at=datetime('now') WHERE id=?", reason, req.user.id, p.id);
    notify(order.user_id, 'proof_rejected', 'Comprovante recusado', `Pedido ${order.order_number}: ${reason} Envie um novo comprovante.`, `/pagamento/transferencia?pedido=${order.order_number}`);
    A(req, 'proof.reject', 'order', order.order_number, { proof: p.id, reason });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Confirmar um pedido sem comprovante (ex.: o cliente pagou e avisou por outro canal)
adm.post('/orders/:id/confirm', (req, res, next) => {
  try {
    const order = get('SELECT * FROM orders WHERE id=?', parseInt(req.params.id, 10) || 0);
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado.' });
    const note = clean(req.body.note, 200) || 'confirmado pelo admin';
    const r = approveOrder(order, 'manual:' + note);
    run("UPDATE payment_proofs SET status='replaced' WHERE order_id=? AND status='pending'", order.id);
    A(req, 'order.confirm', 'order', order.order_number, { note });
    res.json({ ok: true, result: r });
  } catch (e) { next(e); }
});

adm.get('/settings', (req, res) => res.json({ ...getPay(), qr: !!QR, provider: config.paymentProvider }));
adm.put('/settings', (req, res) => {
  const b = req.body || {}, type = clean(b.pix_type, 10).toLowerCase();
  if (!['', 'cpf', 'cnpj', 'email', 'phone', 'random'].includes(type)) return res.status(400).json({ error: 'Tipo de chave PIX inválido.' });
  const v = { pix_type: type, pix_key: clean(b.pix_key, 120), holder: clean(b.holder, 80), doc: clean(b.doc, 30), city: clean(b.city, 40),
    bank: clean(b.bank, 60), agency: clean(b.agency, 20), account: clean(b.account, 30), note: clean(b.note, 500) };
  if (v.pix_key && !v.holder) return res.status(400).json({ error: 'Informe o nome do titular (necessário para gerar o PIX).' });
  for (const k of KEYS) setPay(k, v[k]);
  A(req, 'settings.payment', 'settings', 'pay', { pix: !!v.pix_key, bank: !!v.account });
  res.json({ ok: true });
});

module.exports = router;
module.exports._test = { pixPayload, crc16 };