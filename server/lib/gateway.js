'use strict';
// Camada de pagamento. Dua implementasi:
//  - mercadopago: integrasi resmi via REST API (Checkout Pro + webhook ber-tanda-tangan)
//  - manual:      transferência/PIX; o cliente envia o comprovante e o ADMIN aprova (ver routes/manual.js)
//  - sandbox:     simulasi LOKAL untuk uji coba; tidak ada uang sungguhan. Ditolak di production.
const crypto = require('node:crypto');
const { config } = require('../config');
const { get, run } = require('../db');
const { timingSafeEqualStr } = require('./security');
const { notifyAdmins } = require('./notify');

const MP_API = 'https://api.mercadopago.com';

async function mpFetch(path, opts = {}) {
  const r = await fetch(MP_API + path, {
    ...opts,
    headers: { Authorization: `Bearer ${config.mp.accessToken}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!r.ok) { const e = new Error(`Mercado Pago ${r.status}: ${json.message || text.slice(0, 200)}`); e.status = 502; throw e; }
  return json;
}

// Memulai pembayaran untuk sebuah pesanan. Mengembalikan { redirectUrl, paymentRowId }
async function startPayment(order, items, user) {
  // Setiap percobaan bayar = 1 baris payments (tidak menghapus riwayat percobaan gagal)
  const ins = run('INSERT INTO payments(order_id,provider,status,amount_cents,currency) VALUES (?,?,?,?,?)',
    order.id, config.paymentProvider, 'pending', order.total_cents, order.currency);
  const paymentRowId = Number(ins.lastInsertRowid);

  if (config.paymentProvider === 'manual') {
    run("UPDATE payments SET method='transfer' WHERE id=?", paymentRowId);
    notifyAdmins('admin_order', 'Novo pedido: ' + order.order_number,
      `${user.name} (${user.email}) fez um pedido de R$ ${(order.total_cents / 100).toFixed(2).replace('.', ',')}. Aguardando o pagamento e o comprovante.`, '/admin/pagamentos');
    return { redirectUrl: `/pagamento/transferencia?pedido=${order.order_number}`, paymentRowId };
  }

  if (config.paymentProvider === 'sandbox') {
    const ref = 'sbx_' + crypto.randomBytes(8).toString('hex');
    run('UPDATE payments SET provider_ref=? WHERE id=?', ref, paymentRowId);
    return { redirectUrl: `/sandbox/pagar?ref=${ref}`, paymentRowId };
  }

  // Mercado Pago Checkout Pro. external_reference = id baris pembayaran kita.
  const pref = await mpFetch('/checkout/preferences', {
    method: 'POST',
    body: JSON.stringify({
      items: items.map(i => ({ id: String(i.product_id), title: i.product_name, quantity: 1, unit_price: i.unit_price_cents / 100, currency_id: order.currency })),
      payer: { email: user.email, name: user.name },
      external_reference: String(paymentRowId),
      notification_url: `${config.baseUrl}/api/webhooks/mercadopago`,
      back_urls: {
        success: `${config.baseUrl}/pagamento/resultado?pedido=${order.order_number}`,
        failure: `${config.baseUrl}/pagamento/resultado?pedido=${order.order_number}`,
        pending: `${config.baseUrl}/pagamento/resultado?pedido=${order.order_number}`,
      },
      auto_return: 'approved',
    }),
  });
  run('UPDATE payments SET provider_ref=? WHERE id=?', pref.id, paymentRowId);
  return { redirectUrl: pref.init_point, paymentRowId };
}

// Verifikasi tanda tangan webhook Mercado Pago (header x-signature: ts=...,v1=...)
function verifyMpSignature(req) {
  const sig = req.get('x-signature') || '';
  const requestId = req.get('x-request-id') || '';
  const parts = Object.fromEntries(sig.split(',').map(p => p.trim().split('=').map(s => s.trim())));
  if (!parts.ts || !parts.v1) return false;
  const dataId = String((req.query['data.id'] ?? (req.body && req.body.data && req.body.data.id)) || '').toLowerCase();
  const manifest = `id:${dataId};request-id:${requestId};ts:${parts.ts};`;
  const expected = crypto.createHmac('sha256', config.mp.webhookSecret).update(manifest).digest('hex');
  return timingSafeEqualStr(expected, parts.v1);
}

const MP_STATUS = { approved: 'approved', authorized: 'approved', pending: 'pending', in_process: 'pending', in_mediation: 'pending',
  rejected: 'rejected', cancelled: 'cancelled', refunded: 'refunded', charged_back: 'refunded' };

// Mengambil status pembayaran LANGSUNG dari API Mercado Pago (tidak percaya isi body webhook)
async function fetchMpPayment(paymentId) {
  const p = await mpFetch(`/v1/payments/${encodeURIComponent(paymentId)}`);
  const row = get('SELECT id FROM payments WHERE id = ?', parseInt(p.external_reference, 10));
  if (!row) return null;
  return {
    paymentRowId: row.id,
    providerPaymentId: String(p.id),
    status: MP_STATUS[p.status] || 'pending',
    method: p.payment_method_id || p.payment_type_id || null,
    amountCents: Math.round(Number(p.transaction_amount) * 100),
    currency: p.currency_id || 'BRL',
    rawStatus: p.status + (p.status_detail ? '/' + p.status_detail : ''),
  };
}

// Sandbox: HMAC internal agar event simulasi tidak bisa dipalsukan dari luar
function signSandbox(payload) {
  return crypto.createHmac('sha256', config.sandboxSecret).update(payload).digest('hex');
}

module.exports = { startPayment, verifyMpSignature, fetchMpPayment, signSandbox };