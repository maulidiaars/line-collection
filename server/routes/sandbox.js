'use strict';
// Página de pagamento SIMULADA. Só existe com PAYMENT_PROVIDER=sandbox (nunca em production).
const express = require('express');
const crypto = require('node:crypto');
const { get } = require('../db');
const { requireAuth } = require('../security-mw');
const { config } = require('../config');
const { handleSandboxEvent } = require('./webhooks');

const router = express.Router();
router.use((req, res, next) => (config.paymentProvider === 'sandbox' && !config.isProd ? next() : res.status(404).end()));

router.get('/info', requireAuth, (req, res) => {
  const p = get(`SELECT pay.provider_ref ref, pay.status, pay.amount_cents, o.order_number, o.status order_status
    FROM payments pay JOIN orders o ON o.id=pay.order_id WHERE pay.provider='sandbox' AND pay.provider_ref=? AND o.user_id=?`, String(req.query.ref || ''), req.user.id);
  if (!p) return res.status(404).json({ error: 'Pagamento não encontrado.' });
  res.json(p);
});

// Simula o gateway avisando o backend (mesmo caminho de código do webhook real)
router.post('/resolve', requireAuth, (req, res) => {
  const p = get(`SELECT pay.provider_ref ref FROM payments pay JOIN orders o ON o.id=pay.order_id
    WHERE pay.provider='sandbox' AND pay.provider_ref=? AND o.user_id=?`, String(req.body.ref || ''), req.user.id);
  if (!p) return res.status(404).json({ error: 'Pagamento não encontrado.' });
  const r = handleSandboxEvent({ eventId: crypto.randomUUID(), ref: p.ref, status: String(req.body.outcome) });
  res.status(r.status).json(r.body);
});

module.exports = router;
