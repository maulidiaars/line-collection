'use strict';
// Logika inti toko: harga, pesanan, pembayaran terverifikasi, pemberian/pencabutan akses.
// SEMUA harga dihitung di sini dari database. Browser tidak pernah menentukan harga.
const crypto = require('node:crypto');
const { get, all, run, tx } = require('../db');
const { notify } = require('./notify');

const brl = (c) => 'R$ ' + (c / 100).toFixed(2).replace('.', ',');
const launchActive = () => (get("SELECT value FROM settings WHERE key='launch_active'") || {}).value === '1';
const unitPrice = (p) => (launchActive() && p.launch_price_cents != null ? p.launch_price_cents : p.price_cents);

function bundlePluginIds(productId) {
  const p = get('SELECT kind FROM products WHERE id = ?', productId);
  if (!p) return [];
  if (p.kind === 'plugin') return [productId];
  return all('SELECT plugin_id FROM bundle_items WHERE bundle_id = ?', productId).map(r => r.plugin_id);
}

function userOwnedPluginIds(userId) {
  return new Set(all("SELECT product_id FROM entitlements WHERE user_id = ? AND status='active'", userId).map(r => r.product_id));
}

function newOrderNumber() {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  for (let i = 0; i < 10; i++) {
    const n = `LC-${d}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    if (!get('SELECT 1 FROM orders WHERE order_number = ?', n)) return n;
  }
  throw new Error('Falha ao gerar número do pedido');
}

// slugs dari browser hanya dipakai sebagai PENGENAL produk. Harga selalu dari DB.
function createOrder(userId, slugs) {
  if (!Array.isArray(slugs) || slugs.length === 0) throw httpErr(400, 'Carrinho vazio.');
  const uniq = [...new Set(slugs.map(String))];
  if (uniq.length > 13) throw httpErr(400, 'Itens demais no carrinho.');
  const products = uniq.map(s => get('SELECT * FROM products WHERE slug = ?', s));
  if (products.some(p => !p)) throw httpErr(400, 'Algum produto não foi encontrado.');
  if (products.some(p => !p.is_active)) throw httpErr(400, 'Algum produto não está mais à venda.');

  const owned = userOwnedPluginIds(userId);
  for (const p of products) {
    const ids = bundlePluginIds(p.id);
    if (ids.length && ids.every(id => owned.has(id)))
      throw httpErr(409, `Você já possui todos os plugins de "${p.name}".`);
  }
  return tx(() => {
    const subtotal = products.reduce((a, p) => a + unitPrice(p), 0);
    const num = newOrderNumber();
    const o = run('INSERT INTO orders(order_number,user_id,status,subtotal_cents,total_cents,currency) VALUES (?,?,?,?,?, ?)',
      num, userId, 'pending', subtotal, subtotal, 'BRL');
    for (const p of products)
      run('INSERT INTO order_items(order_id,product_id,product_name,unit_price_cents) VALUES (?,?,?,?)', o.lastInsertRowid, p.id, p.name, unitPrice(p));
    return get('SELECT * FROM orders WHERE id = ?', o.lastInsertRowid);
  });
}

function httpErr(status, message) { const e = new Error(message); e.status = status; return e; }

// Memberi akses plugin (bundle -> semua plugin di dalamnya). Idempoten berkat unique index.
function grantProduct(userId, productId, { orderId = null, source, reason = null, grantedBy = null }) {
  const granted = [];
  for (const pid of bundlePluginIds(productId)) {
    const exists = get("SELECT id FROM entitlements WHERE user_id=? AND product_id=? AND status='active'", userId, pid);
    if (exists) continue;
    run('INSERT INTO entitlements(user_id,product_id,order_id,source,reason,granted_by) VALUES (?,?,?,?,?,?)',
      userId, pid, orderId, source, reason, grantedBy);
    granted.push(pid);
  }
  return granted;
}

/**
 * Titik tunggal untuk hasil pembayaran yang SUDAH diverifikasi dari gateway.
 * Idempoten: dipanggil berkali-kali (webhook ganda) tidak memberi akses dua kali.
 * result: { paymentRowId, providerPaymentId, status: 'approved'|'rejected'|'cancelled'|'refunded'|'pending', method, amountCents, currency, rawStatus }
 */
function applyPaymentResult(result) {
  return tx(() => {
    const pay = get('SELECT * FROM payments WHERE id = ?', result.paymentRowId);
    if (!pay) throw httpErr(404, 'Pagamento não encontrado.');
    const order = get('SELECT * FROM orders WHERE id = ?', pay.order_id);

    // Pencegahan id pembayaran gateway dipakai ulang di pesanan lain
    if (result.providerPaymentId) {
      const other = get('SELECT id FROM payments WHERE provider=? AND provider_payment_id=? AND id<>?', pay.provider, result.providerPaymentId, pay.id);
      if (other) return { changed: false, reason: 'duplicate_provider_payment' };
    }
    // Nominal & mata uang dari gateway WAJIB cocok dengan pesanan
    if (result.status === 'approved' &&
        (result.amountCents !== order.total_cents || (result.currency || 'BRL') !== order.currency)) {
      run("UPDATE payments SET raw_status=?, updated_at=datetime('now') WHERE id=?", 'amount_mismatch:' + result.rawStatus, pay.id);
      return { changed: false, reason: 'amount_mismatch' };
    }

    const from = pay.status;
    const setPay = (st) => run(`UPDATE payments SET status=?, provider_payment_id=COALESCE(?,provider_payment_id), method=COALESCE(?,method),
        raw_status=?, updated_at=datetime('now') WHERE id=?`, st, result.providerPaymentId || null, result.method || null, result.rawStatus || null, pay.id);

    if (result.status === 'approved') {
      if (from === 'approved') { setPay('approved'); return { changed: false, reason: 'already_approved' }; }
      if (order.status === 'cancelled') { setPay('approved'); return { changed: false, reason: 'order_cancelled_needs_manual_refund' }; }
      setPay('approved');
      run("UPDATE orders SET status='paid', paid_at=datetime('now'), updated_at=datetime('now') WHERE id=?", order.id);
      for (const it of all('SELECT product_id FROM order_items WHERE order_id=?', order.id))
        grantProduct(order.user_id, it.product_id, { orderId: order.id, source: 'purchase' });
      notify(order.user_id, 'payment_success', 'Pagamento confirmado', `Pedido ${order.order_number} pago (${brl(order.total_cents)}). Seus plugins já estão em Meus Plugins.`, '/conta/plugins');
      return { changed: true, order: 'paid' };
    }
    if (result.status === 'refunded') {
      if (from === 'refunded') return { changed: false, reason: 'already_refunded' };
      setPay('refunded');
      run("UPDATE orders SET status='refunded', updated_at=datetime('now') WHERE id=?", order.id);
      run("UPDATE entitlements SET status='revoked', revoked_at=datetime('now'), revoked_reason='Reembolso do pedido' WHERE order_id=? AND status='active'", order.id);
      notify(order.user_id, 'refund', 'Reembolso processado', `O pedido ${order.order_number} foi reembolsado e o acesso aos plugins foi removido.`, '/conta/pedidos');
      return { changed: true, order: 'refunded' };
    }
    if (result.status === 'rejected' || result.status === 'cancelled') {
      if (from === 'approved' || from === 'refunded') return { changed: false, reason: 'ignored_downgrade' };
      setPay(result.status);
      if (order.status === 'pending') {
        const st = result.status === 'rejected' ? 'failed' : 'cancelled';
        run("UPDATE orders SET status=?, updated_at=datetime('now') WHERE id=?", st, order.id);
        notify(order.user_id, st === 'failed' ? 'payment_failed' : 'order_cancelled',
          st === 'failed' ? 'Pagamento não aprovado' : 'Pedido cancelado',
          st === 'failed' ? `O pagamento do pedido ${order.order_number} não foi aprovado. Você pode tentar novamente.` : `O pedido ${order.order_number} foi cancelado.`, '/conta/pedidos');
      }
      return { changed: true, order: result.status };
    }
    if (from === 'pending') setPay('pending');
    return { changed: false, reason: 'pending' };
  });
}

function cancelPendingOrder(orderId, userId) {
  return tx(() => {
    const o = get('SELECT * FROM orders WHERE id=? AND user_id=?', orderId, userId);
    if (!o) throw httpErr(404, 'Pedido não encontrado.');
    if (o.status !== 'pending') throw httpErr(409, 'Só pedidos pendentes podem ser cancelados.');
    run("UPDATE orders SET status='cancelled', updated_at=datetime('now') WHERE id=?", o.id);
    run("UPDATE payments SET status='cancelled', updated_at=datetime('now') WHERE order_id=? AND status='pending'", o.id);
    notify(userId, 'order_cancelled', 'Pedido cancelado', `O pedido ${o.order_number} foi cancelado.`, '/conta/pedidos');
    return get('SELECT * FROM orders WHERE id=?', o.id);
  });
}

module.exports = { brl, launchActive, unitPrice, bundlePluginIds, userOwnedPluginIds, createOrder, grantProduct, applyPaymentResult, cancelPendingOrder, httpErr };
