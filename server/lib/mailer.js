'use strict';
const nodemailer = require('nodemailer');
const { config } = require('../config');

let transport = null;
function getTransport() {
  if (!config.smtp.host) return null;
  if (!transport) transport = nodemailer.createTransport({
    host: config.smtp.host, port: config.smtp.port, secure: config.smtp.port === 465,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
  return transport;
}

// Email hanya dipakai untuk reset password. Jika SMTP belum diatur (mode lokal),
// tautan dicetak di terminal supaya tetap bisa diuji.
async function sendMail({ to, subject, text }) {
  const t = getTransport();
  if (!t) {
    console.log(`\n[EMAIL TIDAK TERKIRIM - SMTP belum diatur]\nKe: ${to}\nSubjek: ${subject}\n${text}\n`);
    return { sent: false };
  }
  await t.sendMail({ from: config.smtp.from || config.smtp.user, to, subject, text });
  return { sent: true };
}
module.exports = { sendMail };
