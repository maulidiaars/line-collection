'use strict';
// Jalur Mercado Pago com a API do MP SUBSTITUÍDA por um stub (não há credenciais reais aqui).
// Testa o NOSSO código: preferência, assinatura do webhook, reconsulta ao gateway, idempotência, reembolso.
process.env.PAYMENT_PROVIDER = 'mercadopago';
process.env.MP_ACCESS_TOKEN = 'TEST-token-falso';
process.env.MP_WEBHOOK_SECRET = 'segredo-webhook-de-teste';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const H = require('./helpers');

const calls = []; const mpPayments = {};           // id -> objeto de pagamento "do Mercado Pago"
const realFetch = global.fetch;
global.fetch = async (url, opts = {}) => {
  if (!String(url).startsWith('https://api.mercadopago.com')) return realFetch(url, opts);
  const u = new URL(url); calls.push({ method: opts.method || 'GET', path: u.pathname, headers: opts.headers, body: opts.body ? JSON.parse(opts.body) : null });
  const json = (o, status = 200) => ({ ok: status < 300, status, text: async () => JSON.stringify(o) });
  if (u.pathname === '/checkout/preferences') return json({ id: 'pref-123', init_point: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=pref-123' }, 201);
  let m = u.pathname.match(/^\/v1\/payments\/(\w+)$/);
  if (m) return mpPayments[m[1]] ? json(mpPayments[m[1]]) : json({ message: 'not found' }, 404);
  m = u.pathname.match(/^\/v1\/payments\/(\w+)\/refunds$/);
  if (m) return json({ id: 1 }, 201);
  return json({ message: 'rota desconhecida' }, 404);
};

let admin;
test.before(async () => { await H.start(); admin = await H.makeAdmin(); });
test.after(async () => { await H.stop(); });

const sigHeaders = (dataId, secret = process.env.MP_WEBHOOK_SECRET) => {
  const ts = String(Date.now()), rid = crypto.randomUUID();
  const v1 = crypto.createHmac('sha256', secret).update(`id:${String(dataId).toLowerCase()};request-id:${rid};ts:${ts};`).digest('hex');
  return { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': rid };
};
const hook = (client, dataId, headers) => client.req('POST', `/api/webhooks/mercadopago?data.id=${dataId}&type=payment`, { type: 'payment', data: { id: dataId } }, { headers, noCsrf: true });
const uid = (e) => H.get('SELECT id FROM users WHERE email=?', e).id;
const owned = (id) => require('../server/db').all("SELECT p.slug FROM entitlements e JOIN products p ON p.id=e.product_id WHERE e.user_id=? AND e.status='active' ORDER BY p.slug", id).map(r => r.slug);

test('checkout cria preferência no MP com valores do SERVIDOR e external_reference', async () => {
  const c = new H.Client(); await c.register('Ana MP', 'anamp@test.com');
  const r = await c.post('/api/checkout', { items: ['pacote-voz'], price: 1 });
  assert.equal(r.status, 201); assert.match(r.json.redirectUrl, /mercadopago\.com\.br/);
  const call = calls.filter(x => x.path === '/checkout/preferences').pop();
  assert.equal(call.headers.Authorization, 'Bearer TEST-token-falso');
  assert.equal(call.body.items[0].unit_price, 119);                    // R$ 119 (lançamento), não o "1" enviado
  assert.equal(call.body.items[0].currency_id, 'BRL');
  assert.match(call.body.notification_url, /\/api\/webhooks\/mercadopago$/);
  const pay = H.get('SELECT * FROM payments WHERE order_id=(SELECT id FROM orders WHERE order_number=?)', r.json.orderNumber);
  assert.equal(call.body.external_reference, String(pay.id)); assert.equal(pay.provider, 'mercadopago'); assert.equal(pay.provider_ref, 'pref-123');
  assert.equal(owned(uid('anamp@test.com')).length, 0);                 // criar pedido não concede nada
});

test('sandbox desligado quando o provedor é Mercado Pago', async () => {
  const c = new H.Client(); await c.register('Bob MP', 'bobmp@test.com');
  assert.equal((await c.get('/api/sandbox/info?ref=x')).status, 404);
  assert.equal((await c.post('/api/webhooks/sandbox', {})).status, 404);
  assert.equal((await c.get('/sandbox/pagar?ref=x')).status, 404);
});

test('webhook MP: assinatura inválida/ausente é recusada e nada é liberado', async () => {
  const c = new H.Client(); await c.register('Cris MP', 'crismp@test.com');
  const r = await c.post('/api/checkout', { items: ['eqline'] });
  const pay = H.get('SELECT id FROM payments WHERE order_id=(SELECT id FROM orders WHERE order_number=?)', r.json.orderNumber);
  mpPayments['9001'] = { id: 9001, status: 'approved', external_reference: String(pay.id), transaction_amount: 69, currency_id: 'BRL', payment_method_id: 'pix' };
  const anon = new H.Client();
  assert.equal((await hook(anon, '9001', {})).status, 401);
  assert.equal((await hook(anon, '9001', sigHeaders('9001', 'segredo-errado'))).status, 401);
  assert.equal((await hook(anon, '9001', { 'x-signature': 'ts=1,v1=00', 'x-request-id': 'a' })).status, 401);
  assert.equal(H.get('SELECT status FROM orders WHERE order_number=?', r.json.orderNumber).status, 'pending');
  assert.equal(owned(uid('crismp@test.com')).length, 0);
});

test('webhook MP válido: consulta a API, confere valor, libera uma vez e ignora reenvio', async () => {
  const c = new H.Client(); await c.register('Dani MP', 'danimp@test.com');
  const r = await c.post('/api/checkout', { items: ['compline'] });
  const pay = H.get('SELECT id FROM payments WHERE order_id=(SELECT id FROM orders WHERE order_number=?)', r.json.orderNumber);
  mpPayments['9002'] = { id: 9002, status: 'pending', status_detail: 'pending_waiting_payment', external_reference: String(pay.id), transaction_amount: 69, currency_id: 'BRL', payment_method_id: 'pix' };
  const anon = new H.Client();
  // 1) pendente (ex.: Pix gerado): não libera
  assert.equal((await hook(anon, '9002', sigHeaders('9002'))).status, 200);
  assert.equal(H.get('SELECT status FROM orders WHERE order_number=?', r.json.orderNumber).status, 'pending');
  assert.equal(owned(uid('danimp@test.com')).length, 0);
  // 2) aprovado
  mpPayments['9002'].status = 'approved'; mpPayments['9002'].status_detail = 'accredited';
  const a = await hook(anon, '9002', sigHeaders('9002')); assert.equal(a.status, 200); assert.equal(a.json.order, 'paid');
  assert.deepEqual(owned(uid('danimp@test.com')), ['compline']);
  assert.equal(H.get('SELECT method m FROM payments WHERE id=?', pay.id).m, 'pix');
  assert.equal(H.get('SELECT provider_payment_id p FROM payments WHERE id=?', pay.id).p, '9002');
  // 3) reenvio idêntico (MP reenvia webhooks): duplicado, sem efeitos
  const b = await hook(anon, '9002', sigHeaders('9002')); assert.equal(b.json.duplicate, true);
  assert.equal(H.get("SELECT COUNT(*) c FROM notifications WHERE user_id=? AND type='payment_success'", uid('danimp@test.com')).c, 1);
  assert.equal(H.get('SELECT COUNT(*) c FROM entitlements WHERE user_id=?', uid('danimp@test.com')).c, 1);
  // 4) corpo falso não vale: o status vem da API do MP, não do webhook
  const c2 = new H.Client(); await c2.register('Edu MP', 'edump@test.com');
  const r2 = await c2.post('/api/checkout', { items: ['limitline'] });
  const pay2 = H.get('SELECT id FROM payments WHERE order_id=(SELECT id FROM orders WHERE order_number=?)', r2.json.orderNumber);
  mpPayments['9003'] = { id: 9003, status: 'rejected', status_detail: 'cc_rejected_other_reason', external_reference: String(pay2.id), transaction_amount: 69, currency_id: 'BRL' };
  const fake = await anon.req('POST', '/api/webhooks/mercadopago?data.id=9003&type=payment', { type: 'payment', status: 'approved', data: { id: '9003', status: 'approved' } }, { headers: sigHeaders('9003'), noCsrf: true });
  assert.equal(fake.status, 200);
  assert.equal(H.get('SELECT status FROM orders WHERE order_number=?', r2.json.orderNumber).status, 'failed');
  assert.equal(owned(uid('edump@test.com')).length, 0);
});

test('webhook MP: valor/moeda diferentes do pedido não liberam; referência desconhecida é ignorada; erro do MP => 500 (para o MP tentar de novo)', async () => {
  const c = new H.Client(); await c.register('Fer MP', 'fermp@test.com');
  const r = await c.post('/api/checkout', { items: ['driveline'] });
  const pay = H.get('SELECT id FROM payments WHERE order_id=(SELECT id FROM orders WHERE order_number=?)', r.json.orderNumber);
  mpPayments['9010'] = { id: 9010, status: 'approved', external_reference: String(pay.id), transaction_amount: 1, currency_id: 'BRL' };
  const anon = new H.Client();
  assert.equal((await hook(anon, '9010', sigHeaders('9010'))).json.reason, 'amount_mismatch');
  assert.equal(owned(uid('fermp@test.com')).length, 0);
  mpPayments['9011'] = { id: 9011, status: 'approved', external_reference: '99999', transaction_amount: 69, currency_id: 'BRL' };
  assert.equal((await hook(anon, '9011', sigHeaders('9011'))).json.ignored, 'unknown_reference');
  assert.equal((await hook(anon, '4040', sigHeaders('4040'))).status, 500);       // MP respondeu 404
});

test('MP: aprovado -> reembolsado via webhook revoga acesso; reembolso do admin chama a API do MP', async () => {
  const c = new H.Client(); await c.register('Gil MP', 'gilmp@test.com'); const id = uid('gilmp@test.com');
  const r = await c.post('/api/checkout', { items: ['pingline'] });
  const pay = H.get('SELECT id FROM payments WHERE order_id=(SELECT id FROM orders WHERE order_number=?)', r.json.orderNumber);
  mpPayments['9020'] = { id: 9020, status: 'approved', external_reference: String(pay.id), transaction_amount: 69, currency_id: 'BRL', payment_method_id: 'visa' };
  const anon = new H.Client(); await hook(anon, '9020', sigHeaders('9020'));
  assert.deepEqual(owned(id), ['pingline']);
  // admin pede reembolso: chama a API, mas o pedido só muda quando o webhook confirmar
  const oid = H.get('SELECT id FROM orders WHERE order_number=?', r.json.orderNumber).id;
  const rf = await admin.post(`/api/admin/orders/${oid}/refund`, { reason: 'cliente desistiu' }); assert.equal(rf.status, 200);
  assert.ok(calls.some(x => x.path === '/v1/payments/9020/refunds' && x.method === 'POST'));
  assert.equal(H.get('SELECT status FROM orders WHERE id=?', oid).status, 'paid');
  mpPayments['9020'].status = 'refunded';
  assert.equal((await hook(anon, '9020', sigHeaders('9020'))).json.order, 'refunded');
  assert.equal(owned(id).length, 0); assert.equal(H.get('SELECT status FROM orders WHERE id=?', oid).status, 'refunded');
});
