/* Utilitários compartilhados das páginas da aplicação */
(function () {
  'use strict';
  var csrf = null, meCache = null;
  var LOGO = '<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#33E6FF"/><stop offset=".55" stop-color="#7A8CFF"/><stop offset="1" stop-color="#C45CFF"/></linearGradient><radialGradient id="k" cx=".5" cy=".35" r=".7"><stop offset="0" stop-color="#3A4250"/><stop offset="1" stop-color="#0B0E14"/></radialGradient></defs><circle cx="32" cy="32" r="27" fill="none" stroke="#1A2330" stroke-width="5"/><path d="M13.1 50.9A27 27 0 1 1 50.9 50.9" fill="none" stroke="url(#g)" stroke-width="5" stroke-linecap="round"/><circle cx="32" cy="32" r="17" fill="url(#k)" stroke="rgba(255,255,255,.12)"/><circle cx="32" cy="20.5" r="2.6" fill="#33E6FF"/></svg>';
  var STATUS = { pending: 'Aguardando pagamento', paid: 'Pago', failed: 'Falhou', cancelled: 'Cancelado', refunded: 'Reembolsado', approved: 'Aprovado', rejected: 'Recusado', active: 'Ativo', revoked: 'Revogado' };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function brl(c) { return 'R$ ' + (c / 100).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function dt(s) { if (!s) return '—'; var d = new Date(s.replace(' ', 'T') + (s.indexOf('Z') < 0 ? 'Z' : '')); return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); }
  function pill(st) { return '<span class="pill ' + esc(st) + '">' + esc(STATUS[st] || st) + '</span>'; }
  function size(b) { return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.ceil(b / 1024) + ' KB'; }
  function toast(msg, err) { var t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : ''); t.setAttribute('role', 'status'); t.textContent = msg; document.body.appendChild(t); setTimeout(function () { t.remove(); }, 4000); }

  function me(force) {
    if (meCache && !force) return meCache;
    meCache = fetch('/api/auth/me', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (j) { csrf = j.csrf || null; return j; });
    return meCache;
  }
  // chamada à API: envia o token CSRF automaticamente; lança Error com mensagem em português
  function api(method, url, body, isForm) {
    return me().then(function () {
      var h = { Accept: 'application/json' }; if (csrf) h['X-CSRF-Token'] = csrf;
      if (body && !isForm) h['Content-Type'] = 'application/json';
      return fetch(url, { method: method, credentials: 'same-origin', headers: h, body: body ? (isForm ? body : JSON.stringify(body)) : undefined });
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.error || 'Algo deu errado. Tente novamente.'); e.status = r.status; throw e; }
        return j;
      });
    });
  }
  function topbar() {
    return me().then(function (m) { var el = document.getElementById('top'); if (el && window.LCNav) LCNav.mount(el); return m; });
  }
  function modal(html, onMount) {
    var bg = document.createElement('div'); bg.className = 'modal-bg';
    bg.innerHTML = '<div class="modal" role="dialog" aria-modal="true">' + html + '</div>';
    document.body.appendChild(bg);
    function close() { bg.remove(); document.removeEventListener('keydown', k); }
    function k(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', k);
    bg.addEventListener('mousedown', function (e) { if (e.target === bg) close(); });
    bg.querySelectorAll('[data-close]').forEach(function (b) { b.onclick = close; });
    var f = bg.querySelector('input,select,textarea,button'); if (f) f.focus();
    if (onMount) onMount(bg, close);
    return { el: bg, close: close };
  }
  function busy(btn, on, label) { if (!btn) return; if (on) { btn.dataset.l = btn.textContent; btn.disabled = true; btn.textContent = label || 'Aguarde…'; } else { btn.disabled = false; btn.textContent = btn.dataset.l || btn.textContent; } }
  window.LC = { esc: esc, brl: brl, dt: dt, pill: pill, size: size, toast: toast, api: api, me: me, topbar: topbar, modal: modal, busy: busy, STATUS: STATUS, LOGO: LOGO };
})();