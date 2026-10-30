'use strict';
const { run, all } = require('../db');
function notify(userId, type, title, body, link) {
  run('INSERT INTO notifications(user_id,type,title,body,link) VALUES (?,?,?,?,?)', userId, type, title, body || null, link || null);
}
// Avisa TODOS os administradores ativos (pedido novo, comprovante enviado...)
function notifyAdmins(type, title, body, link) {
  for (const a of all("SELECT id FROM users WHERE role='admin' AND is_active=1")) notify(a.id, type, title, body, link);
}
module.exports = { notify, notifyAdmins };