'use strict';
const { run } = require('../db');
function notify(userId, type, title, body, link) {
  run('INSERT INTO notifications(user_id,type,title,body,link) VALUES (?,?,?,?,?)', userId, type, title, body || null, link || null);
}
module.exports = { notify };
