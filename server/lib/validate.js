'use strict';
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const clean = (s, max = 200) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
const isEmail = (s) => typeof s === 'string' && s.length <= 254 && EMAIL_RE.test(s);
function passwordProblem(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (pw.length > 100) return 'A senha é longa demais (máximo 100 caracteres).';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'A senha precisa ter letras e números.';
  return null;
}

// Nome de usuário: 3–20 caracteres, minúsculas/números/ponto/underline, começa e termina com letra ou número.
const USERNAME_RE = /^[a-z0-9][a-z0-9._]{1,18}[a-z0-9]$/;
const RESERVED = new Set(['admin', 'administrator', 'administrador', 'root', 'support', 'suporte', 'system', 'sistema',
  'linecollection', 'line', 'collection', 'moderator', 'staff', 'api', 'null', 'undefined']);
const normUsername = (s) => clean(s, 40).toLowerCase();
function usernameProblem(u) {
  if (typeof u !== 'string' || u.length < 3) return 'O usuário precisa ter pelo menos 3 caracteres.';
  if (u.length > 20) return 'O usuário pode ter no máximo 20 caracteres.';
  if (/\s/.test(u)) return 'O usuário não pode ter espaços.';
  if (!USERNAME_RE.test(u)) return 'Use só letras minúsculas, números, ponto ou underline (começando e terminando com letra ou número).';
  if (RESERVED.has(u)) return 'Este nome de usuário não está disponível.';
  return null;
}
// Gera um usuário livre a partir de um texto (ex.: parte local do email). isTaken(u) -> boolean
function suggestUsername(base, isTaken, { allowReserved = false } = {}) {
  let b = String(base || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9._]/g, '_')
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '').slice(0, 16);
  if (b.length < 3) b = (b + 'user').slice(0, 16);
  const ok = (u) => USERNAME_RE.test(u) && (allowReserved || !RESERVED.has(u)) && !isTaken(u);
  if (ok(b)) return b;
  for (let i = 1; i < 10000; i++) { const u = b.slice(0, 20 - String(i).length) + i; if (ok(u)) return u; }
  return 'user' + Date.now().toString(36).slice(-8);
}
module.exports = { clean, isEmail, passwordProblem, normUsername, usernameProblem, suggestUsername };