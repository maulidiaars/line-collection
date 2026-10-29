'use strict';
const express = require('express');
const { get, all, run } = require('../db');
const { requireAuth } = require('./../security-mw');
const shop = require('../lib/shop');
const gw = require('../lib/gateway');
const { config } = require('../config');

const router = express.Router();

const shapeProduct = (p, owned) => ({
  slug: p.slug, name: p.name, category: p.category, description: p.description, features: JSON.parse(p.features || '[]'),
  accent: p.accent, image: p.image, imageAlt: p.image_alt, kind: p.kind,
  priceCents: p.price_cents, launchPriceCents: p.launch_price_cents, currentPriceCents: shop.unitPrice(p),
  includes: p.kind === 'bundle' ? all('SELECT pl.slug,pl.name FROM bundle_items bi JOIN products pl ON pl.id=bi.plugin_id WHERE bi.bundle_id=? ORDER BY pl.sort_order', p.id) : undefined,
  owned: owned ? shop.bundlePluginIds(p.id).every(id => owned.has(id)) : false,
});

// Katalog publik. Jika login, ikut menandai plugin yang sudah dimiliki.
router.get('/products', (req, res) => {
  const owned = req.user ? shop.userOwnedPluginIds(req.user.id) : null;
  const rows = all('SELECT * FROM products WHERE is_active=1 ORDER BY sort_order');
  res.json({ launchActive: shop.launchActive(), currency: 'BRL', paymentProvider: config.paymentProvider, products: rows.map(p => shapeProduct(p, owned)) });
});

router.post('/checkout', requireAuth, async (req, res, next) => {
  try {
    const order = shop.createOrder(req.user.id, req.body.items);
    const items = all('SELECT * FROM order_items WHERE order_id=?', order.id);
    const { redirectUrl } = await gw.startPayment(order, items, req.user);
    res.status(201).json({ orderNumber: order.order_number, redirectUrl });
  } catch (e) { next(e); }
});

// Coba bayar lagi pesanan yang gagal / masih pending (harga tetap sesuai pesanan, nominal tidak berubah)
router.post('/orders/:number/retry', requireAuth, async (req, res, next) => {
  try {
    const o = get('SELECT * FROM orders WHERE order_number=? AND user_id=?', req.params.number, req.user.id);
    if (!o) return res.status(404).json({ error: 'Pedido não encontrado.' });
    if (!['pending', 'failed'].includes(o.status)) return res.status(409).json({ error: 'Este pedido não pode ser pago novamente.' });
    run("UPDATE payments SET status='cancelled', updated_at=datetime('now') WHERE order_id=? AND status='pending'", o.id);
    run("UPDATE orders SET status='pending', updated_at=datetime('now') WHERE id=?", o.id);
    const items = all('SELECT * FROM order_items WHERE order_id=?', o.id);
    const { redirectUrl } = await gw.startPayment(get('SELECT * FROM orders WHERE id=?', o.id), items, req.user);
    res.json({ redirectUrl });
  } catch (e) { next(e); }
});

router.post('/orders/:number/cancel', requireAuth, (req, res, next) => {
  try {
    const o = get('SELECT id FROM orders WHERE order_number=? AND user_id=?', req.params.number, req.user.id);
    if (!o) return res.status(404).json({ error: 'Pedido não encontrado.' });
    shop.cancelPendingOrder(o.id, req.user.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Status do pedido: só o DONO consegue ver. A página "sucesso" apenas LÊ este status; nunca concede nada.
router.get('/orders/:number/status', requireAuth, (req, res) => {
  const o = get('SELECT order_number,status,total_cents,paid_at,created_at FROM orders WHERE order_number=? AND user_id=?', req.params.number, req.user.id);
  if (!o) return res.status(404).json({ error: 'Pedido não encontrado.' });
  const pay = get('SELECT status,method FROM payments WHERE order_id=(SELECT id FROM orders WHERE order_number=?) ORDER BY id DESC LIMIT 1', req.params.number);
  res.json({ ...o, payment: pay || null });
});

module.exports = router;
