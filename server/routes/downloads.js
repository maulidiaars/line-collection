'use strict';
const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const { get, run, tx } = require('../db');
const S = require('../lib/security');
const { requireAuth } = require('../security-mw');
const { config } = require('../config');

const router = express.Router();
const FILES = () => path.join(config.storageDir, 'files');

// 1) Pedido de link: o servidor confere se o usuário TEM acesso ativo ao produto
router.post('/request', requireAuth, (req, res) => {
  const v = get(`SELECT v.id, v.product_id FROM product_versions v WHERE v.id=? AND v.file_path IS NOT NULL`, parseInt(req.body.versionId, 10) || 0);
  if (!v) return res.status(404).json({ error: 'Arquivo ainda não disponível.' });
  const ent = get("SELECT id FROM entitlements WHERE user_id=? AND product_id=? AND status='active'", req.user.id, v.product_id);
  if (!ent) return res.status(403).json({ error: 'Você não tem acesso a este plugin.' });
  const token = S.randomToken(32);
  run("INSERT INTO download_tokens(token_hash,user_id,version_id,expires_at) VALUES (?,?,?,datetime('now', ?))",
    S.sha256(token), req.user.id, v.id, `+${config.downloadTokenMinutes} minutes`);
  res.json({ url: `/download/${token}`, expiresInMinutes: config.downloadTokenMinutes });
});

// 2) Download: token de uso único + sessão do dono + acesso ainda ativo. Sem link público permanente.
router.get('/:token', requireAuth, (req, res, next) => {
  try {
    const h = S.sha256(req.params.token);
    const t = get("SELECT * FROM download_tokens WHERE token_hash=? AND used_at IS NULL AND expires_at > datetime('now')", h);
    if (!t || t.user_id !== req.user.id) return res.status(403).send('Link inválido, expirado ou de outra conta.');
    const v = get('SELECT * FROM product_versions WHERE id=?', t.version_id);
    if (!v || !v.file_path) return res.status(404).send('Arquivo indisponível.');
    const ent = get("SELECT id FROM entitlements WHERE user_id=? AND product_id=? AND status='active'", req.user.id, v.product_id);
    if (!ent) return res.status(403).send('Acesso revogado.');
    const full = path.join(FILES(), path.basename(v.file_path));
    if (!fs.existsSync(full)) return res.status(404).send('Arquivo indisponível.');
    tx(() => {
      run("UPDATE download_tokens SET used_at=datetime('now') WHERE token_hash=?", h);
      run('INSERT INTO download_log(user_id,version_id,ip) VALUES (?,?,?)', req.user.id, v.id, req.ip);
    });
    res.set('Cache-Control', 'private, no-store');
    res.download(full, v.original_name || 'plugin.zip');
  } catch (e) { next(e); }
});

module.exports = router;
