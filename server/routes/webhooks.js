'use strict';
const express = require('express');
const { get, run } = require('../db');
const shop = require('../lib/shop');
const gw = require('../lib/gateway');
const { config } = require('../config');

const router = express.Router();

// Registra o evento; retorna false se já foi processado antes (idempotência)
function firstTime(provider, key, payload) {
  try { run('INSERT INTO webhook_events(provider,event_key,payload) VALUES (?,?,?)', provider, key, JSON.stringify(payload).slice(0, 4000)); return true; }
  catch (e) { if (/UNIQUE/i.test(e.message)) return false; throw e; }
}

// ---- Mercado Pago ----
router.post('/mercadopago', async (req, res) => {
  try {
    if (config.paymentProvider !== 'mercadopago') return res.status(404).end();
    if (!gw.verifyMpSignature(req)) return res.status(401).json({ error: 'assinatura inválida' });
    const type = req.body.type || req.query.type || req.body.topic;
    const dataId = String((req.body.data && req.body.data.id) || req.query['data.id'] || '');
    if (type !== 'payment' || !dataId) return res.status(200).json({ ignored: true });
    // Sempre reconsulta a API oficial: o corpo do webhook não é fonte da verdade
    const result = await gw.fetchMpPayment(dataId);
    if (!result) return res.status(200).json({ ignored: 'unknown_reference' });
    // chave inclui o status: mudanças legítimas (pending -> approved) passam; reenvios idênticos não
    const key = `${dataId}:${result.rawStatus}`;
    if (!firstTime('mercadopago', key, { type, dataId })) return res.status(200).json({ duplicate: true });
    const r = shop.applyPaymentResult(result);
    res.status(200).json({ ok: true, ...r });
  } catch (e) {
    console.error('[webhook mp]', e.message);
    res.status(500).json({ error: 'erro' }); // 5xx => Mercado Pago tenta de novo
  }
});

// ---- Sandbox (SOMENTE simulação local; desligado se PAYMENT_PROVIDER != sandbox) ----
function handleSandboxEvent(evt) {
  const pay = get("SELECT * FROM payments WHERE provider='sandbox' AND provider_ref=?", String(evt.ref || ''));
  if (!pay) return { status: 404, body: { error: 'referência desconhecida' } };
  if (!['approved', 'rejected', 'cancelled', 'pending', 'refunded'].includes(evt.status)) return { status: 400, body: { error: 'status inválido' } };
  if (!firstTime('sandbox', String(evt.eventId), evt)) return { status: 200, body: { duplicate: true } };
  const r = shop.applyPaymentResult({
    paymentRowId: pay.id, providerPaymentId: 'sbxpay_' + pay.provider_ref, status: evt.status,
    method: 'sandbox', amountCents: pay.amount_cents, currency: pay.currency, rawStatus: 'sandbox:' + evt.status,
  });
  return { status: 200, body: { ok: true, ...r } };
}

router.post('/sandbox', (req, res) => {
  if (config.paymentProvider !== 'sandbox' || config.isProd) return res.status(404).end();
  const raw = JSON.stringify(req.body || {});
  const sig = req.get('x-sandbox-signature') || '';
  if (!require('../lib/security').timingSafeEqualStr(gw.signSandbox(raw), sig)) return res.status(401).json({ error: 'assinatura inválida' });
  const r = handleSandboxEvent(req.body);
  res.status(r.status).json(r.body);
});

module.exports = router;
module.exports.handleSandboxEvent = handleSandboxEvent;
