/* Admin → Pagamentos: aprova/recusa comprovantes de transferência/PIX, libera os plugins na conta do cliente e avisa de pedidos novos.
   Carregado depois de admin.js: adiciona a aba "Pagamentos" e o sininho sem alterar o restante do painel. */
(function () {
  'use strict';
  var PATH = '/admin/pagamentos', E = LC.esc, app = document.getElementById('app'), top = document.getElementById('top'), tab = 'pending', counts = null, lastUnread = -1, actx = null, titleBase = '';
  var BELL = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16zM10 21h4"/></svg>';
  var REASONS = ['Valor diferente do pedido.', 'Comprovante ilegível ou cortado.', 'Pagamento não localizado na conta.', 'Este comprovante é de outro pedido.'];
  var PIXT = [['', 'Sem PIX'], ['cpf', 'CPF'], ['cnpj', 'CNPJ'], ['email', 'E-mail'], ['phone', 'Telefone'], ['random', 'Chave aleatória']];
  document.addEventListener('click', function () { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }, { once: true });

  function beep() { if (!actx) return; try { var o = actx.createOscillator(), g = actx.createGain(); o.type = 'sine'; o.frequency.value = 880; g.gain.setValueAtTime(.001, actx.currentTime); g.gain.exponentialRampToValueAtTime(.15, actx.currentTime + .02); g.gain.exponentialRampToValueAtTime(.001, actx.currentTime + .45); o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + .5); } catch (e) {} }
  var ago = function (s) { var m = Math.round((Date.now() - new Date(s.replace(' ', 'T') + 'Z')) / 60000); return m < 1 ? 'agora' : m < 60 ? 'há ' + m + ' min' : m < 1440 ? 'há ' + Math.round(m / 60) + ' h' : LC.dt(s); };
  var pill = function (s) { return '<span class="pill ' + s + '">' + ({ pending: 'Em análise', approved: 'Aprovado', rejected: 'Recusado' }[s] || s) + '</span>'; };

  /* ---------- injeta a aba e mostra a tela quando a URL for /admin/pagamentos ---------- */
  function sync() {
    var side = app.querySelector('.side'); if (!side) return;
    if (!side.querySelector('[data-pay]')) {
      var a = document.createElement('a'); a.href = PATH; a.setAttribute('data-pay', ''); a.innerHTML = 'Pagamentos <span class="bdg-pay" hidden></span>';
      a.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); if (location.pathname !== PATH) history.pushState(null, '', PATH); show(); window.scrollTo(0, 0); });
      var first = side.querySelector('a'); if (first && first.nextSibling) side.insertBefore(a, first.nextSibling); else side.appendChild(a);
    }
    paintBadge();
    if (location.pathname.replace(/\/$/, '') === PATH && !app.querySelector('#view[data-pay]')) show();
  }
  function show() {
    var shell = app.querySelector('.shell'), old = app.querySelector('#view'); if (!shell || !old) return;
    var v = document.createElement('section'); v.id = 'view'; v.setAttribute('data-pay', ''); v.innerHTML = '<div class="skeleton"></div>'; old.parentNode.replaceChild(v, old);
    app.querySelectorAll('.side a').forEach(function (x) { x.classList.toggle('on', x.hasAttribute('data-pay')); });
    titleBase = 'Pagamentos — Admin Line Collection'; document.title = titleBase; load(v);
  }
  function paintBadge() {
    var n = counts ? counts.pendingProofs : 0;
    app.querySelectorAll('.bdg-pay').forEach(function (b) { b.hidden = !n; b.textContent = n; });
    var bell = document.getElementById('admBell'); if (bell) { var c = bell.querySelector('b'); c.hidden = !(counts && counts.unread); c.textContent = counts ? counts.unread : 0; }
    document.title = (n ? '(' + n + ') ' : '') + (titleBase || document.title.replace(/^\(\d+\)\s*/, ''));
  }
  function bell() {
    if (!top || document.getElementById('admBell') || !top.children.length) return;
    var a = document.createElement('a'); a.id = 'admBell'; a.href = PATH; a.className = 'adm-bell'; a.setAttribute('aria-label', 'Notificações e pagamentos'); a.innerHTML = BELL + '<b hidden>0</b>';
    a.addEventListener('click', function (e) { e.preventDefault(); history.pushState(null, '', PATH); if (!app.querySelector('.shell')) return location.reload(); show(); });
    var sp = top.querySelector('.sp'); if (sp && sp.nextSibling) top.insertBefore(a, sp.nextSibling); else top.appendChild(a);
  }
  new MutationObserver(sync).observe(app, { childList: true });
  if (top) new MutationObserver(bell).observe(top, { childList: true });

  /* ---------- aviso de pedido/comprovante novo (consulta a cada 15 s) ---------- */
  function poll() {
    LC.api('GET', '/api/pay/admin/counts').then(function (c) {
      counts = c; paintBadge();
      if (lastUnread >= 0 && c.unread > lastUnread && c.latest[0]) { LC.toast('Novo aviso: ' + c.latest[0].title); beep(); if (document.hidden) { var t = document.title; document.title = '● Novo aviso — ' + t.replace(/^\(\d+\)\s*/, ''); } if (app.querySelector('#view[data-pay]')) reload(); }
      lastUnread = c.unread;
    }).catch(function () {});
  }
  function reload() { var v = app.querySelector('#view[data-pay]'); if (v) load(v, true); }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { paintBadge(); poll(); } });

  /* ---------- tela ---------- */
  function load(v, quiet) {
    return Promise.all([LC.api('GET', '/api/pay/admin/queue' + (tab === 'all' ? '' : '?status=' + tab)), LC.api('GET', '/api/pay/admin/counts')]).then(function (r) {
      if (!v.isConnected) return; counts = r[1]; paintBadge(); draw(v, r[0]); markRead();
    }).catch(function (e) { if (!quiet) v.innerHTML = '<div class="msg err">' + E(e.message) + '</div>'; });
  }
  function markRead() { LC.api('POST', '/api/account/notifications/read', {}).then(function () { if (counts) { counts.unread = 0; lastUnread = 0; paintBadge(); } }).catch(function () {}); }
  function items(l) { return l.map(function (i) { return E(i.product_name); }).join(', '); }
  function thumb(p) { return p.mime === 'application/pdf' ? '<a class="pq-th pdf" href="/api/pay/proofs/' + p.id + '/file" target="_blank" rel="noopener">PDF</a>' : '<img class="pq-th" src="/api/pay/proofs/' + p.id + '/file" alt="Comprovante" data-zoom="' + p.id + '" loading="lazy">'; }

  function draw(v, q) {
    var TABS = [['pending', 'Pendentes'], ['approved', 'Aprovados'], ['rejected', 'Recusados'], ['all', 'Todos']];
    v.innerHTML = '<div class="page-h"><div><h1>Pagamentos</h1><p>Confira os comprovantes, aprove para liberar os plugins na conta do cliente.</p></div><div class="row" style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn ghost sm" id="pcfg">Dados para pagamento</button><button class="btn ghost sm" id="prf">Atualizar</button></div></div>' +
      '<div class="stats"><div class="stat"><div class="mu small">Comprovantes para analisar</div><div class="big" style="font-size:30px;font-weight:800">' + (counts ? counts.pendingProofs : '–') + '</div></div><div class="stat"><div class="mu small">Pedidos sem comprovante</div><div class="big" style="font-size:30px;font-weight:800">' + (counts ? counts.awaitingOrders : '–') + '</div></div></div>' +
      '<div class="pt-tabs">' + TABS.map(function (t) { return '<button class="' + (t[0] === tab ? 'on' : '') + '" data-t="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>' +
      (q.proofs.length ? q.proofs.map(function (p) {
        var acts = p.status === 'pending' ? '<button class="btn sm" data-ok="' + p.id + '">Aprovar e liberar</button><button class="btn danger sm" data-no="' + p.id + '">Recusar</button>' : '<span class="small mu">' + (p.reviewed_at ? 'Analisado ' + ago(p.reviewed_at) : '') + (p.reject_reason ? '<br>Motivo: ' + E(p.reject_reason) : '') + '</span>';
        return '<div class="pq">' + thumb(p) + '<div class="pq-b"><div class="pq-t"><span class="mono">' + E(p.order_number) + '</span>' + pill(p.status) + '<span class="small mu">enviado ' + ago(p.created_at) + '</span></div>' +
          '<div><b>' + E(p.name) + '</b> <span class="mu small">@' + E(p.username || '') + ' · ' + E(p.email) + '</span></div><div class="small mu">' + items(p.items) + '</div>' + (p.note ? '<div class="small">“' + E(p.note) + '”</div>' : '') + '</div>' +
          '<div class="pq-r"><div class="pq-v">' + LC.brl(p.total_cents) + '</div>' + acts + '</div></div>'; }).join('') : '<div class="empty">' + (tab === 'pending' ? 'Nenhum comprovante aguardando análise.' : 'Nada por aqui.') + '</div>') +
      (tab === 'pending' || tab === 'all' ? '<h2 class="pq-h">Pedidos aguardando pagamento (sem comprovante)</h2>' + (q.awaiting.length ? q.awaiting.map(function (o) {
        return '<div class="pq slim"><div class="pq-b"><div class="pq-t"><span class="mono">' + E(o.order_number) + '</span><span class="pill pending">Aguardando pagamento</span><span class="small mu">' + ago(o.created_at) + '</span></div><div><b>' + E(o.name) + '</b> <span class="mu small">@' + E(o.username || '') + ' · ' + E(o.email) + '</span></div><div class="small mu">' + items(o.items) + '</div></div>' +
          '<div class="pq-r"><div class="pq-v">' + LC.brl(o.total_cents) + '</div><button class="btn ghost sm" data-cf="' + o.id + '" data-n="' + E(o.order_number) + '" data-nm="' + E(o.name) + '" data-t="' + o.total_cents + '">Confirmar pagamento</button><button class="btn danger sm" data-cx="' + o.id + '">Cancelar</button></div></div>'; }).join('') : '<div class="empty small">Nenhum pedido pendente.</div>') : '');
    v.querySelectorAll('[data-t]').forEach(function (b) { b.onclick = function () { tab = b.dataset.t; load(v); }; });
    document.getElementById('prf').onclick = function () { load(v); poll(); };
    document.getElementById('pcfg').onclick = settings;
    v.querySelectorAll('[data-zoom]').forEach(function (i) { i.onclick = function () { LC.modal('<img src="' + i.src + '" alt="Comprovante" style="max-width:100%;max-height:78vh;display:block;margin:0 auto;border-radius:10px"><div class="row" style="margin-top:14px;text-align:right"><button class="btn ghost sm" data-close>Fechar</button></div>'); }; });
    v.querySelectorAll('[data-ok]').forEach(function (b) { b.onclick = function () { approve(v, q.proofs.filter(function (p) { return p.id === +b.dataset.ok; })[0]); }; });
    v.querySelectorAll('[data-no]').forEach(function (b) { b.onclick = function () { reject(v, +b.dataset.no); }; });
    v.querySelectorAll('[data-cf]').forEach(function (b) { b.onclick = function () { confirmManual(v, b.dataset); }; });
    v.querySelectorAll('[data-cx]').forEach(function (b) { b.onclick = function () { cancelOrder(v, +b.dataset.cx); }; });
  }
  function done(v, msg) { LC.toast(msg); load(v); poll(); }
  function approve(v, p) {
    LC.modal('<h2>Aprovar e liberar?</h2><p>Pedido <b>' + E(p.order_number) + '</b> de <b>' + E(p.name) + '</b> (' + E(p.email) + ')<br>' + items(p.items) + '<br>Total: <b>' + LC.brl(p.total_cents) + '</b></p><label style="display:flex;gap:10px;align-items:flex-start;margin-bottom:18px;font-size:14px;cursor:pointer"><input type="checkbox" id="ck" style="margin-top:3px"> Conferi que o valor de ' + LC.brl(p.total_cents) + ' entrou na conta.</label><div class="row" style="display:flex;gap:10px;justify-content:flex-end"><button class="btn ghost sm" data-close>Voltar</button><button class="btn sm" id="go" disabled>Aprovar e liberar plugins</button></div>', function (bg, close) {
      var ck = bg.querySelector('#ck'), go = bg.querySelector('#go'); ck.onchange = function () { go.disabled = !ck.checked; };
      go.onclick = function () { LC.busy(go, true, 'Liberando…'); LC.api('POST', '/api/pay/admin/proofs/' + p.id + '/approve').then(function () { close(); done(v, 'Pedido aprovado — plugins liberados na conta do cliente.'); }).catch(function (e) { LC.toast(e.message, true); LC.busy(go, false); }); };
    });
  }
  function reject(v, id) {
    LC.modal('<h2>Recusar comprovante</h2><p>O cliente recebe o motivo e pode enviar um novo comprovante.</p><div class="pq-chips">' + REASONS.map(function (r) { return '<button type="button" class="chip-s" data-r="' + E(r) + '">' + E(r) + '</button>'; }).join('') + '</div><textarea id="rs" rows="3" maxlength="300" placeholder="Motivo (obrigatório)" style="width:100%;margin:12px 0 16px;padding:10px;border-radius:10px;border:1px solid var(--line);background:rgba(255,255,255,.04);color:inherit;font:inherit"></textarea><div class="row" style="display:flex;gap:10px;justify-content:flex-end"><button class="btn ghost sm" data-close>Voltar</button><button class="btn danger sm" id="go">Recusar</button></div>', function (bg, close) {
      var rs = bg.querySelector('#rs'); bg.querySelectorAll('[data-r]').forEach(function (b) { b.onclick = function () { rs.value = b.dataset.r; }; });
      bg.querySelector('#go').onclick = function () { var go = bg.querySelector('#go'); if (rs.value.trim().length < 3) { LC.toast('Informe o motivo.', true); return; } LC.busy(go, true, 'Enviando…'); LC.api('POST', '/api/pay/admin/proofs/' + id + '/reject', { reason: rs.value }).then(function () { close(); done(v, 'Comprovante recusado. O cliente foi avisado.'); }).catch(function (e) { LC.toast(e.message, true); LC.busy(go, false); }); };
    });
  }
  function confirmManual(v, d) {
    LC.modal('<h2>Confirmar sem comprovante?</h2><p>Use apenas se você já viu o pagamento de <b>' + LC.brl(+d.t) + '</b> entrar na conta (ex.: o cliente avisou por outro canal). Os plugins do pedido <b>' + E(d.n) + '</b> serão liberados para <b>' + E(d.nm) + '</b>.</p><div class="row" style="display:flex;gap:10px;justify-content:flex-end"><button class="btn ghost sm" data-close>Voltar</button><button class="btn sm" id="go">Confirmar e liberar</button></div>', function (bg, close) {
      bg.querySelector('#go').onclick = function () { var go = bg.querySelector('#go'); LC.busy(go, true, 'Liberando…'); LC.api('POST', '/api/pay/admin/orders/' + d.cf + '/confirm', { note: 'confirmado pelo admin sem comprovante' }).then(function () { close(); done(v, 'Pedido confirmado e plugins liberados.'); }).catch(function (e) { LC.toast(e.message, true); LC.busy(go, false); }); };
    });
  }
  function cancelOrder(v, id) {
    LC.modal('<h2>Cancelar pedido?</h2><p>O pedido será cancelado e o cliente será avisado.</p><div class="row" style="display:flex;gap:10px;justify-content:flex-end"><button class="btn ghost sm" data-close>Voltar</button><button class="btn danger sm" id="go">Cancelar pedido</button></div>', function (bg, close) {
      bg.querySelector('#go').onclick = function () { LC.api('POST', '/api/admin/orders/' + id + '/cancel', { reason: 'Cancelado pelo administrador' }).then(function () { close(); done(v, 'Pedido cancelado.'); }).catch(function (e) { LC.toast(e.message, true); }); };
    });
  }
  function settings() {
    LC.api('GET', '/api/pay/admin/settings').then(function (s) {
      var f = function (id, label, val, ph, ml) { return '<div class="field"><label for="s_' + id + '">' + label + '</label><input id="s_' + id + '" value="' + E(val || '') + '" placeholder="' + E(ph || '') + '" maxlength="' + (ml || 80) + '"></div>'; };
      LC.modal('<h2>Dados para pagamento</h2><p class="small mu">É o que o cliente vê na tela de pagamento. Preencha o PIX, a conta bancária ou os dois.</p>' +
        (s.provider !== 'manual' ? '<div class="msg err">No arquivo .env, PAYMENT_PROVIDER está como “' + E(s.provider) + '”. Mude para <b>PAYMENT_PROVIDER=manual</b> e reinicie o servidor para usar este fluxo.</div>' : '') +
        (!s.qr ? '<div class="msg" style="border:1px solid var(--line);background:rgba(255,255,255,.04)">QR Code desligado: rode <b>npm install qrcode</b> e reinicie para exibir o QR do PIX (o “Copia e Cola” já funciona).</div>' : '') +
        '<div class="field"><label for="s_pix_type">Tipo da chave PIX</label><select id="s_pix_type">' + PIXT.map(function (t) { return '<option value="' + t[0] + '"' + (t[0] === s.pix_type ? ' selected' : '') + '>' + t[1] + '</option>'; }).join('') + '</select></div>' +
        f('pix_key', 'Chave PIX', s.pix_key, 'CPF, e-mail, telefone ou chave aleatória', 120) + f('holder', 'Nome do titular', s.holder, 'Como aparece no banco') + f('city', 'Cidade do titular (PIX)', s.city, 'São Paulo', 40) +
        f('bank', 'Banco (transferência)', s.bank, 'Nubank, Itaú…', 60) + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' + f('agency', 'Agência', s.agency, '0001', 20) + f('account', 'Conta', s.account, '12345-6', 30) + '</div>' + f('doc', 'CPF / CNPJ do titular', s.doc, '', 30) +
        '<div class="field"><label for="s_note">Instruções extras para o cliente</label><textarea id="s_note" rows="3" maxlength="500" placeholder="Ex.: pagamentos aprovados em até 2 horas, das 9h às 22h.">' + E(s.note || '') + '</textarea></div>' +
        '<div class="row" style="display:flex;gap:10px;justify-content:flex-end"><button class="btn ghost sm" data-close>Cancelar</button><button class="btn sm" id="sv">Salvar</button></div>', function (bg, close) {
        bg.querySelector('#sv').onclick = function () {
          var b = bg.querySelector('#sv'), body = {}; ['pix_type', 'pix_key', 'holder', 'city', 'bank', 'agency', 'account', 'doc', 'note'].forEach(function (k) { body[k] = bg.querySelector('#s_' + k).value; });
          LC.busy(b, true, 'Salvando…'); LC.api('PUT', '/api/pay/admin/settings', body).then(function () { close(); LC.toast('Dados de pagamento salvos.'); }).catch(function (e) { LC.toast(e.message, true); LC.busy(b, false); });
        };
      });
    }).catch(function (e) { LC.toast(e.message, true); });
  }

  LC.me().then(function (m) { if (!m.user || m.user.role !== 'admin') return; sync(); bell(); poll(); setInterval(function () { if (!document.hidden) poll(); }, 15000); });
})();