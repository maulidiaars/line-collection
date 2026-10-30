'use strict';
require('dotenv').config({ quiet: true });
const path = require('node:path');
const crypto = require('node:crypto');

const env = process.env;
const isProd = env.NODE_ENV === 'production';

const config = {
  isProd,
  port: parseInt(env.PORT || '3000', 10),
  baseUrl: (env.BASE_URL || `http://localhost:${env.PORT || 3000}`).replace(/\/$/, ''),
  sessionSecret: env.SESSION_SECRET || '',
  sessionDays: 30,
  storageDir: path.resolve(env.STORAGE_DIR || path.join(__dirname, '..', 'storage')),
  maxUploadMb: parseInt(env.MAX_UPLOAD_MB || '200', 10),
  downloadTokenMinutes: 5,
  // 'manual' = transferência/PIX + comprovante aprovado pelo admin | 'mercadopago' = gateway | 'sandbox' = simulação local de teste
  paymentProvider: (env.PAYMENT_PROVIDER || 'sandbox').toLowerCase(),
  mp: {
    accessToken: env.MP_ACCESS_TOKEN || '',
    webhookSecret: env.MP_WEBHOOK_SECRET || '',
  },
  sandboxSecret: env.SANDBOX_SECRET || '',
  smtp: {
    host: env.SMTP_HOST || '', port: parseInt(env.SMTP_PORT || '587', 10),
    user: env.SMTP_USER || '', pass: env.SMTP_PASS || '', from: env.SMTP_FROM || '',
  },
};

function validate() {
  const problems = [];
  if (!config.sessionSecret || config.sessionSecret.length < 32) {
    if (isProd) problems.push('SESSION_SECRET wajib diisi (minimal 32 karakter) di mode production.');
    else config.sessionSecret = crypto.randomBytes(32).toString('hex');
  }
  if (!['sandbox', 'mercadopago', 'manual'].includes(config.paymentProvider))
    problems.push('PAYMENT_PROVIDER harus "manual", "mercadopago" atau "sandbox".');
  if (config.paymentProvider === 'mercadopago') {
    if (!config.mp.accessToken) problems.push('MP_ACCESS_TOKEN belum diisi (diperlukan untuk Mercado Pago).');
    if (!config.mp.webhookSecret) problems.push('MP_WEBHOOK_SECRET belum diisi (diperlukan untuk verifikasi webhook).');
  }
  if (isProd && config.paymentProvider === 'sandbox')
    problems.push('Mode sandbox tidak boleh dipakai di production. Set PAYMENT_PROVIDER=manual (transferência/PIX) atau mercadopago.');
  if (!config.sandboxSecret) config.sandboxSecret = crypto.createHash('sha256').update('sandbox:' + config.sessionSecret).digest('hex');
  return problems;
}

module.exports = { config, validate };