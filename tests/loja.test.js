'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const H = require('./helpers');
const { signSandbox } = require('../server/lib/gateway');

let admin;
test.before(async () => { await H.start(); admin = await H.makeAdmin(); });
test.after(async () => { await H.stop(); });

const slugId = (s) => H.get('SELECT id FROM products WHERE slug=?', s).id;
const ownedSlugs = (uid) => H.get ? require('../server/db').all("SELECT p.slug FROM entitlements e JOIN products p ON p.id=e.product_id WHERE e.user_id=? AND e.status='active' ORDER BY p.slug", uid).map(r => r.slug) : [];
async function buy(c, items) {
  const r = await c.post('/api/checkout', { items });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  const ref = new URL(r.json.redirectUrl, 'http://x').searchParams.get('ref');
  return { number: r.json.orderNumber, ref };
}
const resolve = (c, ref, outcome) => c.post('/api/sandbox/resolve', { ref, outcome });
const uid = (email) => H.get('SELECT id FROM users WHERE email=?', email).id;

test('1-3. registro, email duplicado, login/logout e senha errada', async () => {
  const c = new H.Client();
  assert.equal((await c.post('/api/auth/register', { name: 'A', email: 'ana@test.com', password: 'Senha1234', confirm: 'Senha1234' })).status, 400); // nome curto
  assert.equal((await c.post('/api/auth/register', { name: 'Ana', email: 'ana@test.com', password: 'abc', confirm: 'abc' })).status, 400);        // senha fraca
  assert.equal((await c.post('/api/auth/register', { name: 'Ana', email: 'ana@test.com', password: 'Senha1234', confirm: 'Outra1234' })).status, 400);
  const ok = await c.register('Ana Souza', 'ana@test.com');
  assert.equal(ok.status, 201);
  const me = await c.get('/api/auth/me'); assert.equal(me.json.user.email, 'ana@test.com');
  // senha nunca em texto puro
  const row = H.get('SELECT password_hash FROM users WHERE email=?', 'ana@test.com');
  assert.match(row.password_hash, /^\$2[aby]\$/); assert.ok(!row.password_hash.includes('Senha1234'));
  // duplicado (inclusive com caixa diferente)
  const dup = await new H.Client().post('/api/auth/register', { name: 'Outra', email: 'ANA@test.com', password: 'Senha1234', confirm: 'Senha1234' });
  assert.equal(dup.status, 409);
  // logout invalida a sessão
  await c.post('/api/auth/logout'); assert.equal((await c.get('/api/account/summary')).status, 401);
  // login: senha errada e certa
  const c2 = new H.Client();
  assert.equal((await c2.post('/api/auth/login', { email: 'ana@test.com', password: 'Errada123' })).status, 401);
  assert.equal((await c2.login('ana@test.com')).status, 200);
});

test('2b. bloqueio após 5 senhas erradas', async () => {
  await new H.Client().register('Bia', 'bia@test.com');
  const c = new H.Client();
  for (let i = 0; i < 5; i++) assert.equal((await c.post('/api/auth/login', { email: 'bia@test.com', password: 'Errada123' })).status, 401);
  const locked = await c.post('/api/auth/login', { email: 'bia@test.com', password: 'Senha1234' });
  assert.equal(locked.status, 429);   // mesmo com a senha certa, fica bloqueada
});

test('4. páginas e APIs protegidas', async () => {
  const anon = new H.Client();
  for (const u of ['/api/account/summary', '/api/account/plugins', '/api/account/orders', '/api/admin/summary', '/api/admin/users'])
    assert.equal((await anon.get(u)).status, 401, u);
  const p = await anon.get('/conta'); assert.equal(p.status, 302); assert.match(p.res.headers.get('location'), /^\/entrar/);
  const a = await anon.get('/admin'); assert.equal(a.status, 302);
  const cust = new H.Client(); await cust.register('Cli', 'cli@test.com');
  assert.equal((await cust.get('/admin')).status, 403);
  assert.equal((await cust.get('/api/admin/summary')).status, 403);
  assert.equal((await cust.get('/api/admin/users')).status, 403);
  assert.equal((await cust.post('/api/admin/users/1/grant', { productId: 1 })).status, 403);
  assert.equal((await admin.get('/admin')).status, 200);
});

test('5. perfil persiste e não permite virar admin', async () => {
  const c = new H.Client(); await c.register('Caio', 'caio@test.com');
  const r = await c.put('/api/account/profile', { name: 'Caio Novo', phone: '11999', country: 'Brasil', daw: 'FL Studio', bio: 'oi', role: 'admin', email: 'x@x.com', is_active: 0 });
  assert.equal(r.status, 200);
  const c2 = new H.Client(); await c2.login('caio@test.com');          // "outro dispositivo"
  const p = (await c2.get('/api/account/profile')).json;
  assert.equal(p.name, 'Caio Novo'); assert.equal(p.daw, 'FL Studio'); assert.equal(p.email, 'caio@test.com');
  assert.equal(H.get('SELECT role FROM users WHERE email=?', 'caio@test.com').role, 'customer');
  assert.equal((await c2.get('/api/admin/summary')).status, 403);
});

test('CSRF: requisição de escrita sem token é recusada', async () => {
  const c = new H.Client(); await c.register('Duda', 'duda@test.com');
  const r = await c.put('/api/account/profile', { name: 'Hack' }, { noCsrf: true });
  assert.equal(r.status, 403);
  assert.equal((await c.put('/api/account/profile', { name: 'Hack' }, { headers: { 'X-CSRF-Token': 'errado' }, noCsrf: true })).status, 403);
});

test('6-7. pedido: preço vem do servidor; produto inexistente/inativo; compra avulsa aprovada', async () => {
  const c = new H.Client(); await c.register('Edu', 'edu@test.com');
  // tentativa de adulterar preço: campos extras são ignorados
  const t = await c.post('/api/checkout', { items: ['eqline'], price: 1, total_cents: 1, items_detail: [{ slug: 'eqline', price: 1 }] });
  assert.equal(t.status, 201);
  const o = H.get('SELECT * FROM orders WHERE order_number=?', t.json.orderNumber);
  assert.equal(o.total_cents, 6900);   // preço de lançamento do banco (R$ 69)
  assert.equal(H.get('SELECT unit_price_cents u FROM order_items WHERE order_id=?', o.id).u, 6900);
  assert.equal((await c.post('/api/checkout', { items: ['nao-existe'] })).status, 400);
  assert.equal((await c.post('/api/checkout', { items: [] })).status, 400);
  // inativo
  await admin.put('/api/admin/products/' + slugId('limitline'), { name: 'LimitLine', priceCents: 9900, launchPriceCents: 6900, isActive: false, features: [] });
  assert.equal((await c.post('/api/checkout', { items: ['limitline'] })).status, 400);
  await admin.put('/api/admin/products/' + slugId('limitline'), { name: 'LimitLine', priceCents: 9900, launchPriceCents: 6900, isActive: true, features: [] });
  // aprovado
  const ref = new URL(t.json.redirectUrl, 'http://x').searchParams.get('ref');
  assert.equal(H.get('SELECT COUNT(*) c FROM entitlements WHERE user_id=?', uid('edu@test.com')).c, 0); // ainda sem acesso
  const r = await resolve(c, ref, 'approved'); assert.equal(r.status, 200);
  assert.deepEqual(ownedSlugs(uid('edu@test.com')), ['eqline']);
  const st = (await c.get(`/api/orders/${t.json.orderNumber}/status`)).json; assert.equal(st.status, 'paid');
  const pl = (await c.get('/api/account/plugins')).json; assert.equal(pl.length, 1); assert.equal(pl[0].name, 'EqLine'); assert.equal(pl[0].fileAvailable, false);
  const n = (await c.get('/api/account/notifications')).json; assert.ok(n.some(x => x.type === 'payment_success'));
  // já possui => não permite comprar de novo
  assert.equal((await c.post('/api/checkout', { items: ['eqline'] })).status, 409);
});

test('7b. bundle libera todos os plugins; pagar de novo o mesmo evento não duplica', async () => {
  const c = new H.Client(); await c.register('Fabi', 'fabi@test.com');
  const { ref } = await buy(c, ['pacote-voz']);
  await resolve(c, ref, 'approved');
  assert.deepEqual(ownedSlugs(uid('fabi@test.com')), ['autoline', 'harmoline', 'silentline']);
  // segundo "approved" com outro eventId => idempotente por estado
  await resolve(c, ref, 'approved');
  assert.equal(H.get('SELECT COUNT(*) c FROM entitlements WHERE user_id=?', uid('fabi@test.com')).c, 3);
  assert.equal(H.get("SELECT COUNT(*) c FROM notifications WHERE user_id=? AND type='payment_success'", uid('fabi@test.com')).c, 1);
  assert.equal((await c.post('/api/checkout', { items: ['pacote-voz'] })).status, 409);
});

test('8. pagamento recusado, pendente, cancelado e nova tentativa', async () => {
  const c = new H.Client(); await c.register('Gabi', 'gabi@test.com');
  const u = uid('gabi@test.com');
  // pendente: NÃO libera nada
  let o = await buy(c, ['compline']); await resolve(c, o.ref, 'pending');
  assert.equal((await c.get(`/api/orders/${o.number}/status`)).json.status, 'pending');
  assert.equal(H.get('SELECT COUNT(*) c FROM entitlements WHERE user_id=?', u).c, 0);
  // recusado
  await resolve(c, o.ref, 'rejected');
  assert.equal((await c.get(`/api/orders/${o.number}/status`)).json.status, 'failed');
  assert.equal(H.get('SELECT COUNT(*) c FROM entitlements WHERE user_id=?', u).c, 0);
  assert.ok((await c.get('/api/account/notifications')).json.some(n => n.type === 'payment_failed'));
  // nova tentativa
  const retry = await c.post(`/api/orders/${o.number}/retry`); assert.equal(retry.status, 200);
  const ref2 = new URL(retry.json.redirectUrl, 'http://x').searchParams.get('ref'); assert.notEqual(ref2, o.ref);
  await resolve(c, ref2, 'approved');
  assert.deepEqual(ownedSlugs(u), ['compline']);
  assert.equal(H.get('SELECT COUNT(*) c FROM payments WHERE order_id=(SELECT id FROM orders WHERE order_number=?)', o.number).c, 2); // histórico preservado
  // pago não pode ser pago de novo nem cancelado
  assert.equal((await c.post(`/api/orders/${o.number}/retry`)).status, 409);
  assert.equal((await c.post(`/api/orders/${o.number}/cancel`)).status, 409);
  // cancelado
  const o2 = await buy(c, ['driveline']); await resolve(c, o2.ref, 'cancelled');
  assert.equal((await c.get(`/api/orders/${o2.number}/status`)).json.status, 'cancelled');
  // cancelar pedido pendente pelo usuário
  const o3 = await buy(c, ['pingline']); assert.equal((await c.post(`/api/orders/${o3.number}/cancel`)).status, 200);
  assert.equal(H.get('SELECT status FROM orders WHERE order_number=?', o3.number).status, 'cancelled');
  // aprovação tardia de pedido cancelado NÃO concede acesso (precisa tratamento manual)
  await resolve(c, o3.ref, 'approved');
  assert.deepEqual(ownedSlugs(u), ['compline']);
});

test('9. webhook sandbox: assinatura obrigatória e eventos duplicados ignorados', async () => {
  const c = new H.Client(); await c.register('Hugo', 'hugo@test.com');
  const o = await buy(c, ['reverbline']);
  const evt = { eventId: 'evt-' + crypto.randomUUID(), ref: o.ref, status: 'approved' };
  const raw = JSON.stringify(evt);
  const anon = new H.Client();
  assert.equal((await anon.post('/api/webhooks/sandbox', evt)).status, 401);                                   // sem assinatura
  assert.equal((await anon.post('/api/webhooks/sandbox', evt, { headers: { 'x-sandbox-signature': 'abc' } })).status, 401);
  assert.equal(H.get('SELECT COUNT(*) c FROM entitlements WHERE user_id=?', uid('hugo@test.com')).c, 0);
  const sig = { headers: { 'x-sandbox-signature': signSandbox(raw) } };
  const a = await anon.post('/api/webhooks/sandbox', evt, sig); assert.equal(a.status, 200); assert.equal(a.json.ok, true);
  const b = await anon.post('/api/webhooks/sandbox', evt, sig); assert.equal(b.json.duplicate, true);        // mesmo evento
  assert.equal(H.get('SELECT COUNT(*) c FROM entitlements WHERE user_id=?', uid('hugo@test.com')).c, 1);
  assert.equal(H.get("SELECT COUNT(*) c FROM notifications WHERE user_id=? AND type='payment_success'", uid('hugo@test.com')).c, 1);
  // receita contada uma vez só
  const sum = (await admin.get('/api/admin/summary')).json;
  const expected = H.get("SELECT COALESCE(SUM(total_cents),0) s FROM orders WHERE status='paid'").s;
  assert.equal(sum.revenueCents, expected);
});

test('10. valor divergente do gateway nunca libera acesso', async () => {
  const shop = require('../server/lib/shop');
  const c = new H.Client(); await c.register('Iris', 'iris@test.com');
  const o = await buy(c, ['autoline']);
  const pay = H.get("SELECT * FROM payments WHERE provider_ref=?", o.ref);
  const r = shop.applyPaymentResult({ paymentRowId: pay.id, providerPaymentId: 'p1', status: 'approved', amountCents: 100, currency: 'BRL', rawStatus: 'approved' });
  assert.equal(r.reason, 'amount_mismatch');
  assert.equal(H.get('SELECT COUNT(*) c FROM entitlements WHERE user_id=?', uid('iris@test.com')).c, 0);
  assert.equal(H.get('SELECT status FROM orders WHERE order_number=?', o.number).status, 'pending');
  const r2 = shop.applyPaymentResult({ paymentRowId: pay.id, providerPaymentId: 'p1', status: 'approved', amountCents: 6900, currency: 'USD', rawStatus: 'approved' });
  assert.equal(r2.reason, 'amount_mismatch');
});

test('11. isolamento: usuário B não vê pedido, pagamento sandbox nem download de A', async () => {
  const a = new H.Client(), b = new H.Client();
  await a.register('Jon', 'jon@test.com'); await b.register('Kim', 'kim@test.com');
  const o = await buy(a, ['harmoline']); await resolve(a, o.ref, 'approved');
  assert.equal((await b.get(`/api/orders/${o.number}/status`)).status, 404);
  assert.equal((await b.post(`/api/orders/${o.number}/retry`)).status, 404);
  assert.equal((await b.post(`/api/orders/${o.number}/cancel`)).status, 404);
  assert.equal((await b.get(`/api/sandbox/info?ref=${o.ref}`)).status, 404);
  assert.equal((await b.post('/api/sandbox/resolve', { ref: o.ref, outcome: 'approved' })).status, 404);
  assert.equal((await b.get('/api/account/orders')).json.length, 0);
  assert.equal((await b.get('/api/account/plugins')).json.length, 0);
});

test('12-14. admin: upload privado, download com token único e controle de acesso', async () => {
  const pid = slugId('silentline');
  // upload inválido: extensão proibida e conteúdo falso
  let fd = new FormData(); fd.append('version', '1.0.0'); fd.append('file', new Blob(['#!/bin/sh']), 'x.sh');
  assert.equal((await admin.post(`/api/admin/products/${pid}/versions`, fd)).status, 400);
  fd = new FormData(); fd.append('version', '1.0.0'); fd.append('file', new Blob(['isso nao e um zip de verdade']), 'fake.zip');
  assert.equal((await admin.post(`/api/admin/products/${pid}/versions`, fd)).status, 400);
  // bundle não recebe arquivo
  fd = new FormData(); fd.append('version', '1.0.0'); fd.append('file', new Blob([Buffer.from([0x50, 0x4b, 3, 4, 0, 0, 0, 0])]), 'a.zip');
  assert.equal((await admin.post(`/api/admin/products/${slugId('pacote-voz')}/versions`, fd)).status, 404);
  // upload válido (cabeçalho PK de zip)
  const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 3, 4]), crypto.randomBytes(2000)]);
  fd = new FormData(); fd.append('version', '1.0.0'); fd.append('changelog', 'primeira'); fd.append('file', new Blob([zip]), 'SilentLine-1.0.0.zip');
  const up = await admin.post(`/api/admin/products/${pid}/versions`, fd); assert.equal(up.status, 201, JSON.stringify(up.json));
  const vid = up.json.id;
  // versão duplicada
  fd = new FormData(); fd.append('version', '1.0.0'); fd.append('file', new Blob([zip]), 'again.zip');
  assert.equal((await admin.post(`/api/admin/products/${pid}/versions`, fd)).status, 409);
  // arquivo NÃO é público
  const fs = require('node:fs'); const path = require('node:path');
  const stored = H.get('SELECT file_path FROM product_versions WHERE id=?', vid).file_path;
  assert.equal((await new H.Client().get('/files/' + stored)).status, 404);
  assert.equal((await new H.Client().get('/storage/files/' + stored)).status, 404);

  // dono baixa
  const owner = new H.Client(); await owner.register('Lia', 'lia@test.com');
  const o = await buy(owner, ['silentline']);
  assert.equal((await owner.post('/api/downloads/request', { versionId: vid })).status, 403);   // antes de pagar: negado
  await resolve(owner, o.ref, 'approved');
  const list = (await owner.get('/api/account/plugins')).json; assert.equal(list[0].fileAvailable, true); assert.equal(list[0].version, '1.0.0');
  const tok = await owner.post('/api/downloads/request', { versionId: vid }); assert.equal(tok.status, 200);
  // outro usuário (logado) não consegue usar o token do dono
  const other = new H.Client(); await other.register('Max', 'max@test.com');
  assert.equal((await other.get(tok.json.url)).status, 403);
  assert.equal((await new H.Client().get(tok.json.url)).status, 401);
  // MESMO plugin nas duas contas: o token de um ainda não pode ser usado pelo outro
  await admin.post(`/api/admin/users/${uid('max@test.com')}/grant`, { productId: slugId('silentline'), reasonType: 'presente', confirm: true });
  assert.equal((await other.get(tok.json.url)).status, 403);
  // dono baixa: conteúdo idêntico
  const dl = await owner.get(tok.json.url); assert.equal(dl.status, 200); assert.equal(Buffer.compare(dl.buf, zip), 0);
  assert.match(dl.res.headers.get('content-disposition'), /SilentLine-1\.0\.0\.zip/);
  // token é de uso único
  assert.equal((await owner.get(tok.json.url)).status, 403);
  // quem não tem acesso não pede link (Max ainda tem acesso manual aqui; testamos com outra conta)
  const nobody = new H.Client(); await nobody.register('Zed', 'zed@test.com');
  assert.equal((await nobody.post('/api/downloads/request', { versionId: vid })).status, 403);
  assert.equal((await other.post('/api/downloads/request', { versionId: 99999 })).status, 404);
  // acesso revogado depois do token => também bloqueia
  const tok2 = await owner.post('/api/downloads/request', { versionId: vid });
  const ent = H.get("SELECT id FROM entitlements WHERE user_id=? AND status='active'", uid('lia@test.com'));
  await admin.post(`/api/admin/entitlements/${ent.id}/revoke`, { reason: 'teste', confirm: true });
  assert.equal((await owner.get(tok2.json.url)).status, 403);
  assert.equal((await owner.post('/api/downloads/request', { versionId: vid })).status, 403);
});

test('15-17. admin: liberação manual, notificação, não conta como receita, revogação e auditoria', async () => {
  const u = new H.Client(); await u.register('Nina', 'nina@test.com');
  const id = uid('nina@test.com');
  const before = (await admin.get('/api/admin/summary')).json.revenueCents;
  // exige confirmação e motivo válido
  assert.equal((await admin.post(`/api/admin/users/${id}/grant`, { productId: slugId('pacote-completo'), reasonType: 'presente' })).status, 400);
  assert.equal((await admin.post(`/api/admin/users/${id}/grant`, { productId: slugId('pacote-completo'), reasonType: 'xx', confirm: true })).status, 400);
  const g = await admin.post(`/api/admin/users/${id}/grant`, { productId: slugId('pacote-completo'), reasonType: 'presente', reasonNote: 'parceria', confirm: true });
  assert.equal(g.status, 201); assert.equal(g.json.granted, 10);
  assert.equal(ownedSlugs(id).length, 10);
  assert.equal((await admin.get('/api/admin/summary')).json.revenueCents, before);      // sem receita
  assert.equal(H.get('SELECT COUNT(*) c FROM orders WHERE user_id=?', id).c, 0);         // sem pedido falso
  const ns = (await u.get('/api/account/notifications')).json; assert.ok(ns.some(n => n.type === 'plugin_granted'));
  const pl = (await u.get('/api/account/plugins')).json; assert.equal(pl.length, 10); assert.ok(pl.every(p => p.source === 'admin_grant'));
  // dar de novo => nada novo
  assert.equal((await admin.post(`/api/admin/users/${id}/grant`, { productId: slugId('pacote-completo'), reasonType: 'presente', confirm: true })).status, 409);
  // revogar
  const e = H.get("SELECT id FROM entitlements WHERE user_id=? AND status='active' LIMIT 1", id);
  assert.equal((await admin.post(`/api/admin/entitlements/${e.id}/revoke`, { reason: 'x' })).status, 400);                      // sem confirm
  assert.equal((await admin.post(`/api/admin/entitlements/${e.id}/revoke`, { reason: 'erro de lançamento', confirm: true })).status, 200);
  assert.equal(ownedSlugs(id).length, 9);
  assert.equal((await admin.post(`/api/admin/entitlements/${e.id}/revoke`, { reason: 'de novo', confirm: true })).status, 409);
  // auditoria registrou
  const audit = (await admin.get('/api/admin/audit')).json.map(a => a.action);
  for (const a of ['entitlement.grant', 'entitlement.revoke']) assert.ok(audit.includes(a), a);
  // cliente não consegue chamar
  assert.equal((await u.post(`/api/admin/users/${id}/grant`, { productId: 1, reasonType: 'presente', confirm: true })).status, 403);
});

test('18. reembolso (sandbox) remove acesso e notifica; desativar conta derruba sessão', async () => {
  const c = new H.Client(); await c.register('Otto', 'otto@test.com'); const id = uid('otto@test.com');
  const o = await buy(c, ['pacote-voz']); await resolve(c, o.ref, 'approved');
  assert.equal(ownedSlugs(id).length, 3);
  const oid = H.get('SELECT id FROM orders WHERE order_number=?', o.number).id;
  assert.equal((await admin.post(`/api/admin/orders/${oid}/refund`, { reason: '' })).status, 400);
  assert.equal((await admin.post(`/api/admin/orders/${oid}/refund`, { reason: 'cliente pediu' })).status, 200);
  assert.equal(ownedSlugs(id).length, 0);
  assert.equal(H.get('SELECT status FROM orders WHERE id=?', oid).status, 'refunded');
  assert.ok((await c.get('/api/account/notifications')).json.some(n => n.type === 'refund'));
  assert.equal((await admin.post(`/api/admin/orders/${oid}/refund`, { reason: 'dup' })).status, 409);
  // pode comprar de novo depois do reembolso
  assert.equal((await c.post('/api/checkout', { items: ['pacote-voz'] })).status, 201);
  // desativar conta
  assert.equal((await admin.put(`/api/admin/users/${id}/active`, { active: false })).status, 200);
  assert.equal((await c.get('/api/account/summary')).status, 401);
  assert.equal((await new H.Client().post('/api/auth/login', { email: 'otto@test.com', password: 'Senha1234' })).status, 403);
  assert.equal((await admin.put(`/api/admin/users/${id}/active`, { active: true })).status, 200);
  const self = H.get("SELECT id FROM users WHERE email='admin@test.com'").id;
  assert.equal((await admin.put(`/api/admin/users/${self}/active`, { active: false })).status, 400);
});

test('admin: produto novo, edição de preço, bundle e validações', async () => {
  const mk = await admin.post('/api/admin/products', { name: 'NovoLine', kind: 'plugin', priceCents: 12000, launchPriceCents: 9000, category: 'Teste', features: ['a', 'b'], accent: '#112233', isActive: true });
  assert.equal(mk.status, 201);
  assert.equal((await admin.post('/api/admin/products', { name: 'NovoLine', kind: 'plugin', priceCents: 1, isActive: true })).status, 409);       // slug duplicado
  assert.equal((await admin.post('/api/admin/products', { name: 'Ruim', priceCents: -5 })).status, 400);
  assert.equal((await admin.post('/api/admin/products', { name: 'Ruim', priceCents: 1000, launchPriceCents: 2000 })).status, 400);               // lançamento > normal
  const bn = await admin.post('/api/admin/products', { name: 'Combo Teste', kind: 'bundle', priceCents: 15000, includes: [mk.json.id, slugId('eqline')], isActive: true });
  assert.equal(bn.status, 201);
  assert.equal((await admin.post('/api/admin/products', { name: 'Combo Vazio', kind: 'bundle', priceCents: 1000, includes: [] })).status, 400);
  const pub = (await new H.Client().get('/api/products')).json.products.find(p => p.slug === 'novoline');
  assert.equal(pub.currentPriceCents, 9000); assert.equal(pub.priceCents, 12000);
  // desligar promoção usa preço normal
  await admin.put('/api/admin/settings/launch', { active: false });
  const c = new H.Client(); await c.register('Pri', 'pri@test.com');
  const t = await c.post('/api/checkout', { items: ['novoline'] });
  assert.equal(H.get('SELECT total_cents t FROM orders WHERE order_number=?', t.json.orderNumber).t, 12000);
  await admin.put('/api/admin/settings/launch', { active: true });
  // bundle novo concede os 2 plugins
  const t2 = await c.post('/api/checkout', { items: ['combo-teste'] });
  await resolve(c, new URL(t2.json.redirectUrl, 'http://x').searchParams.get('ref'), 'approved');
  assert.deepEqual(ownedSlugs(uid('pri@test.com')), ['eqline', 'novoline']);
});

test('reset de senha: token de uso único, expira e derruba sessões', async () => {
  const c = new H.Client(); await c.register('Quin', 'quin@test.com');
  const id = uid('quin@test.com');
  // captura o link impresso pelo mailer (SMTP não configurado)
  const logs = []; const orig = console.log; console.log = (...a) => { logs.push(a.join(' ')); };
  const f = await new H.Client().post('/api/auth/forgot', { email: 'quin@test.com' });
  const f2 = await new H.Client().post('/api/auth/forgot', { email: 'naoexiste@test.com' });
  console.log = orig;
  assert.equal(f.status, 200); assert.equal(f.json.message, f2.json.message);        // não revela se o email existe
  const token = (logs.join('\n').match(/token=([\w-]+)/) || [])[1]; assert.ok(token);
  assert.equal((await new H.Client().post('/api/auth/reset', { token: 'invalido', password: 'Nova12345', confirm: 'Nova12345' })).status, 400);
  assert.equal((await new H.Client().post('/api/auth/reset', { token, password: 'curta', confirm: 'curta' })).status, 400);
  assert.equal((await new H.Client().post('/api/auth/reset', { token, password: 'Nova12345', confirm: 'Nova12345' })).status, 200);
  assert.equal((await new H.Client().post('/api/auth/reset', { token, password: 'Outra12345', confirm: 'Outra12345' })).status, 400);   // uso único
  assert.equal((await c.get('/api/account/summary')).status, 401);                                                                      // sessão antiga caiu
  assert.equal((await new H.Client().login('quin@test.com', 'Senha1234')).status, 401);
  assert.equal((await new H.Client().login('quin@test.com', 'Nova12345')).status, 200);
  // trocar senha logado
  const d = new H.Client(); await d.login('quin@test.com', 'Nova12345');
  assert.equal((await d.post('/api/account/password', { current: 'errada', password: 'Troca12345', confirm: 'Troca12345' })).status, 400);
  assert.equal((await d.post('/api/account/password', { current: 'Nova12345', password: 'Troca12345', confirm: 'Troca12345' })).status, 200);
});

test('segurança: cabeçalhos, XSS em campos, SQL injection e página sandbox', async () => {
  const anon = new H.Client();
  const r = await anon.get('/'); assert.equal(r.status, 200);
  const csp = r.res.headers.get('content-security-policy'); assert.match(csp, /default-src 'self'/); assert.match(csp, /frame-ancestors 'none'/);
  assert.equal(r.res.headers.get('x-powered-by'), null);
  // SQL injection no login/busca
  assert.equal((await anon.post('/api/auth/login', { email: "' OR 1=1 --", password: 'x' })).status, 401);
  const u = (await admin.get('/api/admin/users?q=' + encodeURIComponent("%' OR '1'='1"))).json; assert.ok(Array.isArray(u));
  // nome com HTML é guardado como texto (escape é feito no front); API devolve literal
  const c = new H.Client(); await c.register('<img src=x onerror=alert(1)>', 'xss@test.com');
  assert.equal((await c.get('/api/account/profile')).json.name, '<img src=x onerror=alert(1)>');
  // arquivos sensíveis não são servidos
  for (const p of ['/data/linecollection.db', '/.env', '/server/index.js', '/package.json', '/storage/files/x']) assert.equal((await anon.get(p)).status, 404, p);
  assert.equal((await anon.get('/sandbox/pagar?ref=x')).status, 302);
  assert.equal((await anon.get('/pagamento/resultado?pedido=x')).status, 302);
});

test('open redirect: next externo é ignorado no front (checagem do HTML servido)', async () => {
  const js = require('node:fs').readFileSync(require('node:path').join(__dirname, '../public/js/auth.js'), 'utf8');
  assert.match(js, /indexOf\('\/\/'\) === 0/);
});
