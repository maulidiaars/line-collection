/* Painel da conta — Line Collection. Visão geral, plugins, pedidos, pagamentos, notificações, perfil e segurança. */
(function () {
  'use strict';
  var app = document.getElementById('app'), E = LC.esc, me, side, view, busyNav = 0;
  var P = function (d) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + d + '</svg>'; };
  var IC = {
    home: P('<path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10"/>'), box: P('<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zM4 7.5l8 4.5 8-4.5M12 12v9"/>'),
    receipt: P('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3zM9 8h6M9 12h6"/>'), card: P('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3 10h18M7 15h3"/>'),
    bell: P('<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16zM10 21h4"/>'), user: P('<circle cx="12" cy="8" r="4"/><path d="M4 20c1.2-3.6 4.2-5.5 8-5.5s6.8 1.9 8 5.5"/>'),
    shield: P('<path d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6l8-3z"/><path d="M9 12l2 2 4-4"/>'), out: P('<path d="M9 4H6.5A1.5 1.5 0 0 0 5 5.5v13A1.5 1.5 0 0 0 6.5 20H9M15 8l4 4-4 4M19 12H9"/>'),
    dl: P('<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>'), search: P('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>'), check: P('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
    eye: P('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'), store: P('<path d="M4 9l1.5-5h13L20 9M4 9v11h16V9M4 9h16M9 20v-6h6v6"/>'),
  };
  var NAV = [['/conta', 'Visão geral', 'home'], ['/conta/plugins', 'Meus plugins', 'box'], ['/conta/pedidos', 'Pedidos', 'receipt'], ['/conta/pagamentos', 'Pagamentos', 'card'],
    ['/conta/notificacoes', 'Notificações', 'bell'], ['/conta/perfil', 'Perfil', 'user'], ['/conta/configuracoes', 'Segurança', 'shield']];
  var VIEWS = { '/conta': resumo, '/conta/plugins': plugins, '/conta/pedidos': pedidos, '/conta/pagamentos': pagamentos, '/conta/notificacoes': notificacoes, '/conta/perfil': perfil, '/conta/configuracoes': seguranca };
  var METHOD = { manual: 'Transferência / PIX', mercadopago: 'Mercado Pago', sandbox: 'Teste' };

  var ini = function (n) { return (String(n || '?').trim().split(/\s+/).slice(0, 2).map(function (w) { return w[0]; }).join('') || '?').toUpperCase(); };
  var pretty = function (n) { var m = /^(.*?)(line)$/i.exec(n || ''); return m && m[1] ? E(m[1].toUpperCase()) + '<span>LINE</span>' : E(n); };
  function ago(s) {
    var d = new Date(s.replace(' ', 'T') + (s.indexOf('Z') < 0 ? 'Z' : '')), m = Math.round((Date.now() - d) / 60000);
    return m < 1 ? 'agora' : m < 60 ? 'há ' + m + ' min' : m < 1440 ? 'há ' + Math.round(m / 60) + ' h' : m < 10080 ? 'há ' + Math.round(m / 1440) + ' d' : LC.dt(s);
  }
  var head = function (t, p, x) { return '<div class="ph"><div><h1>' + t + '</h1>' + (p ? '<p>' + p + '</p>' : '') + '</div>' + (x ? '<div>' + x + '</div>' : '') + '</div>'; };
  var skel = '<div class="sk"></div><div class="sk"></div>';
  var errBox = function (e, retry) { view.innerHTML = '<div class="empty"><b>Não foi possível carregar.</b><br>' + E(e.message) + '<br><button class="b ghost sm" id="rt">Tentar de novo</button></div>'; var r = document.getElementById('rt'); if (r) r.onclick = retry; };
  function confirmBox(title, text, ok, danger) {
    return new Promise(function (res) {
      var done = false; var M = LC.modal('<h2>' + E(title) + '</h2><p>' + E(text) + '</p><div class="row"><button class="b ghost sm" data-close>Voltar</button><button class="b sm' + (danger ? ' danger' : '') + '" id="cfOk">' + E(ok) + '</button></div>', function (bg, close) {
        bg.querySelector('#cfOk').onclick = function () { done = true; close(); res(true); };
        bg.querySelectorAll('[data-close]').forEach(function (b) { var f = b.onclick; b.onclick = function () { if (f) f(); if (!done) res(false); }; });
      });
      M.el.addEventListener('mousedown', function (e) { if (e.target === M.el && !done) res(false); });
    });
  }
  function logout() {
    LC.api('POST', '/api/auth/logout').catch(function () {}).then(function () { try { ['lc_cart', 'lc_cart_off', 'lc_pending'].forEach(function (k) { localStorage.removeItem(k); }); } catch (e) {} location.href = '/'; });
  }

  /* ---------- casca (menu lateral + área) ---------- */
  function buildShell() {
    side = app.querySelector('.side');
    side.innerHTML = '<div class="me"><div class="av" id="av"></div><div><b id="mn"></b><small id="mu"></small></div></div><nav class="snav" aria-label="Menu da conta">' +
      NAV.map(function (n) { return '<a href="' + n[0] + '" data-link data-p="' + n[0] + '">' + IC[n[2]] + '<span>' + n[1] + '</span></a>'; }).join('') + '</nav>' +
      '<div class="sfoot"><a class="b ghost sm" href="/">' + IC.store + 'Voltar à loja</a><button class="b danger sm" id="lo">' + IC.out + 'Sair da conta</button></div>';
    document.getElementById('lo').onclick = logout; view = document.getElementById('view');
  }
  function paintSide(path) {
    document.getElementById('av').textContent = ini(me.user.name); document.getElementById('mn').textContent = me.user.name;
    document.getElementById('mu').textContent = me.user.username ? '@' + me.user.username : me.user.email;
    side.querySelectorAll('.snav a').forEach(function (a) {
      var on = a.dataset.p === path; a.classList.toggle('on', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
      var old = a.querySelector('.bdg'); if (old) old.remove();
      if (a.dataset.p === '/conta/notificacoes' && me.unread) a.insertAdjacentHTML('beforeend', '<span class="bdg">' + me.unread + '</span>');
    });
    var on = side.querySelector('.snav a.on'); if (on && on.scrollIntoView && innerWidth < 900) on.scrollIntoView({ inline: 'center', block: 'nearest' });
  }
  function render(first) {
    var path = location.pathname.replace(/\/$/, '') || '/conta'; if (!VIEWS[path]) { path = '/conta'; history.replaceState(null, '', path); }
    var seq = ++busyNav;
    document.title = NAV.filter(function (n) { return n[0] === path; })[0][1] + ' — Line Collection';
    if (!side) buildShell();
    LC.me(true).then(function (m) {
      if (!m.user) { location.href = '/entrar?next=' + encodeURIComponent(location.pathname); return; }
      me = m; paintSide(path); if (seq !== busyNav) return;
      var v = document.getElementById('view'), n = v.cloneNode(false); n.innerHTML = skel; v.parentNode.replaceChild(n, v); view = n;
      return VIEWS[path](view).then(function () { if (seq === busyNav) { view.style.animation = 'none'; void view.offsetWidth; view.style.animation = ''; } });
    }).catch(function (e) { errBox(e, function () { render(); }); });
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[data-link]');
    if (a && a.origin === location.origin && !e.metaKey && !e.ctrlKey) { e.preventDefault(); if (a.pathname !== location.pathname) { history.pushState(null, '', a.pathname); render(); window.scrollTo({ top: 0 }); } }
  });
  window.addEventListener('popstate', function () { render(); });

  /* ---------- pedido: estado de pagamento (linha do tempo + alertas) ---------- */
  function isManual(o) { return o.payments && o.payments[0] && o.payments[0].provider === 'manual'; }
  function payLink(n) { return '/pagamento/transferencia?pedido=' + encodeURIComponent(n); }
  function stage(o, proof) {                    // 0 = pagar, 1 = em análise, 2 = pago
    if (o.status === 'paid') return 2; return proof && proof.status === 'pending' ? 1 : 0;
  }
  function timeline(o, proof) {
    if (!isManual(o) || ['cancelled', 'failed', 'refunded'].indexOf(o.status) >= 0) return '';
    var s = stage(o, proof), rej = proof && proof.status === 'rejected' && o.status === 'pending';
    return '<div class="tl"><div class="d">Pedido criado</div><div class="' + (s > 0 ? 'd' : rej ? 'x' : 'c') + '">' + (rej ? 'Comprovante recusado' : 'Pagar e enviar comprovante') + '</div>' +
      '<div class="' + (s > 1 ? 'd' : s === 1 ? 'c' : '') + '">Em análise</div><div class="' + (s > 1 ? 'd' : '') + '">Plugins liberados</div></div>';
  }
  function alertFor(o, proof) {
    if (o.status !== 'pending') return '';
    var n = E(o.order_number), t = LC.brl(o.total_cents);
    if (!isManual(o)) return '<div class="alert warn"><div class="t"><b>Pedido ' + n + ' aguardando pagamento</b><span>Total ' + t + '</span></div><button class="b sm" data-retry="' + n + '">Pagar agora</button></div>';
    if (proof && proof.status === 'pending') return '<div class="alert info"><div class="t"><b>Comprovante em análise — pedido ' + n + '</b><span>Enviado ' + ago(proof.created_at) + '. Você será avisado(a) assim que for aprovado.</span></div><a class="b ghost sm" href="' + payLink(o.order_number) + '">Ver pedido</a></div>';
    if (proof && proof.status === 'rejected') return '<div class="alert err"><div class="t"><b>Comprovante recusado — pedido ' + n + '</b><span>' + E(proof.reject_reason || 'Envie um novo comprovante.') + '</span></div><a class="b sm" href="' + payLink(o.order_number) + '">Enviar novamente</a></div>';
    return '<div class="alert warn"><div class="t"><b>Pedido ' + n + ' aguardando pagamento</b><span>Faça o PIX/transferência de ' + t + ' e envie o comprovante.</span></div><a class="b sm" href="' + payLink(o.order_number) + '">Pagar / enviar comprovante</a></div>';
  }
  function wireOrderActions(root) {
    root.querySelectorAll('[data-retry]').forEach(function (b) { b.onclick = function () { LC.busy(b, true); LC.api('POST', '/api/orders/' + b.dataset.retry + '/retry').then(function (r) { location.href = r.redirectUrl; }).catch(function (e) { LC.toast(e.message, true); LC.busy(b, false); }); }; });
    root.querySelectorAll('[data-cancel]').forEach(function (b) {
      b.onclick = function () {
        confirmBox('Cancelar pedido?', 'O pedido ' + b.dataset.cancel + ' será cancelado. Você pode fazer um novo pedido quando quiser.', 'Cancelar pedido', true).then(function (ok) {
          if (!ok) return; LC.api('POST', '/api/orders/' + b.dataset.cancel + '/cancel').then(function () { LC.toast('Pedido cancelado.'); render(); }).catch(function (e) { LC.toast(e.message, true); });
        });
      };
    });
    root.querySelectorAll('[data-dl]').forEach(function (b) {
      b.onclick = function () { LC.busy(b, true, 'Gerando link…'); LC.api('POST', '/api/downloads/request', { versionId: +b.dataset.dl }).then(function (r) { location.href = r.url; }).catch(function (e) { LC.toast(e.message, true); }).then(function () { LC.busy(b, false); }); };
    });
  }
  function proofMap(list) { var m = {}; (list || []).forEach(function (p) { m[p.order_number] = p; }); return m; }
  function pluginCard(p) {
    var src = p.source === 'admin_grant' ? 'Liberado pelo suporte' + (p.reason ? ' · ' + E(p.reason) : '') : 'Compra ' + E(p.order_number || '');
    return '<article class="pc" style="--ac:' + E(/^#[0-9a-f]{3,8}$/i.test(p.accent || '') ? p.accent : '#33E6FF') + '"><div class="im"><img src="/assets/img/' + E(p.image || '') + '.webp" alt="Interface do ' + E(p.name) + '" loading="lazy" onerror="this.remove()"></div><div class="bd">' +
      '<h3>' + pretty(p.name) + '</h3><div class="mt">' + src + '<br>Desde ' + LC.dt(p.granted_at) + '<br>' + (p.version ? 'Versão v' + E(p.version) + ' · ' + LC.size(p.fileSize) : '<span style="color:var(--warn)">Arquivo ainda não disponível</span>') + '</div>' +
      '<div class="act">' + (p.fileAvailable ? '<button class="b sm block" data-dl="' + p.versionId + '">' + IC.dl + 'Baixar instalador</button>' : '<button class="b ghost sm block" disabled>Download em breve</button>') + '</div></div></article>';
  }

  /* ---------- Visão geral ---------- */
  function resumo(el) {
    return Promise.all([LC.api('GET', '/api/account/summary'), LC.api('GET', '/api/account/plugins'), LC.api('GET', '/api/account/orders'), LC.api('GET', '/api/pay/my'), LC.api('GET', '/api/account/notifications')]).then(function (r) {
      var s = r[0], pl = r[1], os = r[2], pm = proofMap(r[3]), ns = r[4], first = E(me.user.name.split(' ')[0]);
      var alerts = os.filter(function (o) { return o.status === 'pending'; }).slice(0, 3).map(function (o) { return alertFor(o, pm[o.order_number]); }).join('');
      var recent = os.slice(0, 3);
      el.innerHTML = '<div class="hero"><h1>Olá, <span>' + first + '</span></h1><p>' + (pl.length ? 'Você tem ' + pl.length + (pl.length === 1 ? ' plugin' : ' plugins') + ' na sua conta, prontos para baixar.' : 'Sua conta está pronta. Escolha seus primeiros plugins e monte sua cadeia de sinal.') + '</p><div class="row"><a class="b" href="/#plugins">' + IC.store + 'Explorar plugins</a>' + (pl.length ? '<a class="b ghost" href="/conta/plugins" data-link>Meus plugins</a>' : '') + '</div></div>' + alerts +
        '<div class="stats"><div class="stat"><div class="ic">' + IC.box + '</div><div class="v">' + s.plugins + '</div><div class="k">Plugins na conta</div></div><div class="stat"><div class="ic">' + IC.check + '</div><div class="v">' + s.paidOrders + '</div><div class="k">Pedidos pagos</div></div>' +
        '<div class="stat w"><div class="ic">' + IC.receipt + '</div><div class="v">' + s.pendingOrders + '</div><div class="k">Aguardando pagamento</div></div><div class="stat n"><div class="ic">' + IC.bell + '</div><div class="v">' + s.unread + '</div><div class="k">Notificações novas</div></div></div>' +
        (pl.length ? '<div class="card"><h2>Meus plugins <a href="/conta/plugins" data-link>Ver todos</a></h2><div class="pg">' + pl.slice(0, 3).map(pluginCard).join('') + '</div></div>' : '') +
        '<div class="card"><h2>Pedidos recentes <a href="/conta/pedidos" data-link>Ver todos</a></h2>' + (recent.length ? '<div class="tw"><table><tbody>' + recent.map(function (o) { return '<tr><td class="mono">' + E(o.order_number) + '</td><td class="muted">' + LC.dt(o.created_at) + '</td><td>' + LC.pill(o.status) + '</td><td class="num"><b>' + LC.brl(o.total_cents) + '</b></td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="empty" style="border:0;padding:20px">Você ainda não fez nenhum pedido.</div>') + '</div>' +
        '<div class="card" style="padding:0;overflow:hidden"><h2 style="padding:20px 22px 6px">Últimas notificações <a href="/conta/notificacoes" data-link>Ver todas</a></h2>' + (ns.length ? ns.slice(0, 4).map(ntRow).join('') : '<div class="empty" style="border:0">Nada por aqui ainda.</div>') + '</div>';
      wireOrderActions(el); wireNt(el);
    });
  }

  /* ---------- Plugins ---------- */
  function plugins(el) {
    return LC.api('GET', '/api/account/plugins').then(function (list) {
      var h = head('Meus plugins', 'Tudo a que você tem acesso. Os downloads são gerados na hora, só para você.', list.length ? '<label class="srch">' + IC.search + '<input id="q" type="search" placeholder="Buscar plugin" aria-label="Buscar plugin"></label>' : '<a class="b ghost sm" href="/#plugins">Ver plugins</a>');
      if (!list.length) { el.innerHTML = h + '<div class="empty">Você ainda não tem plugins na conta.<br><a class="b" href="/#plugins">Explorar plugins</a></div>'; return; }
      el.innerHTML = h + '<div class="alert info"><div class="t"><b>Como instalar</b><span>Feche o DAW, rode o instalador e, se o plugin não aparecer, faça um rescan de plugins (VST3, Windows).</span></div></div><div class="pg" id="pg">' + list.map(pluginCard).join('') + '</div>';
      var q = document.getElementById('q'); q.oninput = function () { var t = q.value.toLowerCase(); el.querySelectorAll('.pc').forEach(function (c, i) { c.style.display = list[i].name.toLowerCase().indexOf(t) >= 0 ? '' : 'none'; }); };
      wireOrderActions(el);
    });
  }

  /* ---------- Pedidos ---------- */
  function pedidos(el) {
    return Promise.all([LC.api('GET', '/api/account/orders'), LC.api('GET', '/api/pay/my')]).then(function (r) {
      var os = r[0], pm = proofMap(r[1]), filter = 'all';
      var FIL = [['all', 'Todos'], ['pending', 'Pendentes'], ['paid', 'Pagos'], ['other', 'Cancelados / outros']];
      function draw() {
        var list = os.filter(function (o) { return filter === 'all' || (filter === 'other' ? ['pending', 'paid'].indexOf(o.status) < 0 : o.status === filter); });
        document.getElementById('ol').innerHTML = list.length ? list.map(function (o) {
          var proof = pm[o.order_number], acts = '';
          if (o.status === 'pending') acts = (isManual(o) ? '<a class="b sm" href="' + payLink(o.order_number) + '">' + (proof && proof.status === 'pending' ? 'Ver comprovante' : 'Pagar / enviar comprovante') + '</a>' : '<button class="b sm" data-retry="' + E(o.order_number) + '">Pagar agora</button>') + '<button class="b danger sm" data-cancel="' + E(o.order_number) + '">Cancelar pedido</button>';
          else if (o.status === 'failed') acts = '<button class="b sm" data-retry="' + E(o.order_number) + '">Tentar novamente</button>';
          else if (o.status === 'paid') acts = '<a class="b sm" href="/conta/plugins" data-link>Ver meus plugins</a>';
          return '<div class="od"><div class="top"><div><div class="no">' + E(o.order_number) + '</div><div class="dt">' + LC.dt(o.created_at) + '</div></div>' + LC.pill(o.status) + '</div>' + timeline(o, proof) +
            (o.status === 'pending' && proof && proof.status === 'rejected' ? '<div class="msg err">Comprovante recusado: ' + E(proof.reject_reason || '') + '</div>' : '') +
            '<ul>' + o.items.map(function (i) { return '<li><span>' + E(i.product_name) + '</span><b>' + LC.brl(i.unit_price_cents) + '</b></li>'; }).join('') + '</ul><div class="tot"><span>Total</span><span>' + LC.brl(o.total_cents) + '</span></div>' + (acts ? '<div class="acts">' + acts + '</div>' : '') + '</div>';
        }).join('') : '<div class="empty">Nenhum pedido neste filtro.</div>';
        wireOrderActions(el);
      }
      if (!os.length) { el.innerHTML = head('Pedidos', 'Histórico das suas compras.') + '<div class="empty">Nenhum pedido ainda.<br><a class="b" href="/#plugins">Explorar plugins</a></div>'; return; }
      el.innerHTML = head('Pedidos', 'Acompanhe o pagamento e a liberação de cada compra.') + '<div class="chips">' + FIL.map(function (f) { return '<button class="chip' + (f[0] === 'all' ? ' on' : '') + '" data-f="' + f[0] + '">' + f[1] + '</button>'; }).join('') + '</div><div id="ol"></div>';
      el.querySelectorAll('.chip').forEach(function (c) { c.onclick = function () { filter = c.dataset.f; el.querySelectorAll('.chip').forEach(function (x) { x.classList.toggle('on', x === c); }); draw(); }; });
      draw();
    });
  }

  /* ---------- Pagamentos ---------- */
  function pagamentos(el) {
    return LC.api('GET', '/api/account/payments').then(function (ps) {
      el.innerHTML = head('Pagamentos', 'Cada tentativa de pagamento fica registrada aqui.') + (ps.length ? '<div class="card"><div class="tw"><table><thead><tr><th>Data</th><th>Pedido</th><th>Método</th><th>Status</th><th class="num">Valor</th></tr></thead><tbody>' + ps.map(function (p) {
        return '<tr><td>' + LC.dt(p.created_at) + '</td><td class="mono">' + E(p.order_number) + '</td><td>' + E(METHOD[p.provider] || p.provider) + '</td><td>' + LC.pill(p.status) + '</td><td class="num"><b>' + LC.brl(p.amount_cents) + '</b></td></tr>'; }).join('') + '</tbody></table></div></div>' : '<div class="empty">Nenhum pagamento registrado ainda.</div>');
    });
  }

  /* ---------- Notificações ---------- */
  var NTK = { payment_success: ['ok', 'check'], proof_rejected: ['err', 'receipt'], payment_failed: ['err', 'card'], refund: ['warn', 'card'], order_cancelled: ['warn', 'receipt'], proof_sent: ['', 'receipt'], welcome: ['', 'user'] };
  function ntRow(n) {
    var k = NTK[n.type] || ['', 'bell'];
    return '<div class="nt ' + k[0] + (n.read_at ? ' rd' : '') + '" data-id="' + n.id + '" data-link-to="' + E(n.link || '') + '"><span class="ic">' + IC[k[1]] + '</span><div><h3>' + E(n.title) + '</h3><p>' + E(n.body || '') + '</p><time>' + ago(n.created_at) + '</time></div><span class="dot"></span></div>';
  }
  function wireNt(root) {
    root.querySelectorAll('.nt').forEach(function (n) {
      n.onclick = function () {
        var go = n.dataset.linkTo, id = +n.dataset.id, was = !n.classList.contains('rd');
        var done = was ? LC.api('POST', '/api/account/notifications/read', { id: id }).catch(function () {}) : Promise.resolve();
        n.classList.add('rd'); done.then(function () { if (go) { if (go.indexOf('/conta') === 0 && go.split('?')[0] === location.pathname) { render(); } else location.href = go; } else if (was) { me.unread = Math.max(0, me.unread - 1); paintSide(location.pathname); } });
      };
    });
  }
  function notificacoes(el) {
    return LC.api('GET', '/api/account/notifications').then(function (ns) {
      var unread = ns.some(function (n) { return !n.read_at; });
      el.innerHTML = head('Notificações', 'Avisos sobre pedidos, pagamentos e liberações.', unread ? '<button class="b ghost sm" id="ra">Marcar todas como lidas</button>' : '') +
        (ns.length ? '<div class="card" style="padding:0;overflow:hidden">' + ns.map(ntRow).join('') + '</div>' : '<div class="empty">Você não tem notificações.</div>');
      var ra = document.getElementById('ra'); if (ra) ra.onclick = function () { LC.api('POST', '/api/account/notifications/read', {}).then(function () { render(); }); };
      wireNt(el);
    });
  }

  /* ---------- Perfil ---------- */
  function perfil(el) {
    return LC.api('GET', '/api/account/profile').then(function (p) {
      el.innerHTML = head('Perfil', 'Seus dados na Line Collection.') +
        '<form class="card" id="pf" style="max-width:680px"><div id="m"></div><div class="fr"><div class="fl"><label for="un">Usuário</label><input id="un" value="' + E(me.user.username ? '@' + me.user.username : '—') + '" disabled></div><div class="fl"><label for="em">Email</label><input id="em" value="' + E(p.email) + '" disabled></div></div>' +
        '<div class="fl"><label for="name">Nome completo</label><input id="name" value="' + E(p.name) + '" required minlength="2" maxlength="80" autocomplete="name"></div>' +
        '<div class="fr"><div class="fl"><label for="phone">Telefone</label><input id="phone" value="' + E(p.phone || '') + '" maxlength="30" autocomplete="tel"></div><div class="fl"><label for="country">País</label><input id="country" value="' + E(p.country || '') + '" maxlength="60"></div></div>' +
        '<div class="fl"><label for="daw">DAW que você usa</label><input id="daw" value="' + E(p.daw || '') + '" placeholder="FL Studio, Ableton…" maxlength="60"></div>' +
        '<div class="fl"><label for="bio">Sobre você</label><textarea id="bio" maxlength="300">' + E(p.bio || '') + '</textarea><div class="h">Conta criada em ' + LC.dt(p.created_at) + '</div></div><button class="b" type="submit">Salvar alterações</button></form>';
      document.getElementById('pf').onsubmit = function (e) {
        e.preventDefault(); var b = e.target.querySelector('button'), body = {}; LC.busy(b, true, 'Salvando…');
        ['name', 'phone', 'country', 'daw', 'bio'].forEach(function (k) { body[k] = document.getElementById(k).value; });
        LC.api('PUT', '/api/account/profile', body).then(function () { LC.toast('Perfil salvo.'); me.user.name = body.name.trim(); paintSide('/conta/perfil'); document.getElementById('m').innerHTML = ''; })
          .catch(function (er) { document.getElementById('m').innerHTML = '<div class="msg err">' + E(er.message) + '</div>'; }).then(function () { LC.busy(b, false); });
      };
    });
  }

  /* ---------- Segurança ---------- */
  function seguranca(el) {
    var eye = '<button type="button" aria-label="Mostrar senha" data-eye>' + IC.eye + '</button>';
    el.innerHTML = head('Segurança', 'Proteja o acesso à sua conta.') +
      '<form class="card" id="pw" style="max-width:520px"><h2>Alterar senha</h2><div id="m"></div>' +
      '<div class="fl"><label for="cur">Senha atual</label><div class="pw"><input id="cur" type="password" autocomplete="current-password" required>' + eye + '</div></div>' +
      '<div class="fl"><label for="np">Nova senha</label><div class="pw"><input id="np" type="password" autocomplete="new-password" required minlength="8" maxlength="100">' + eye + '</div><div class="bars" id="bars" data-s="0"><i></i><i></i><i></i><i></i></div><div class="h">Mínimo 8 caracteres, com letras e números.</div></div>' +
      '<div class="fl"><label for="nc">Confirmar nova senha</label><div class="pw"><input id="nc" type="password" autocomplete="new-password" required>' + eye + '</div></div>' +
      '<div class="h" style="margin-bottom:14px">Ao trocar a senha, os outros dispositivos conectados são desconectados.</div><button class="b" type="submit">Alterar senha</button></form>' +
      '<div class="card" style="max-width:520px"><h2>Sessão</h2><p class="muted small" style="margin-bottom:14px">Conectado como <b>' + E(me.user.email) + '</b>.</p><button class="b danger sm" id="lo2">' + IC.out + 'Sair desta conta</button></div>';
    document.getElementById('lo2').onclick = logout;
    el.querySelectorAll('[data-eye]').forEach(function (b) { b.onclick = function () { var i = b.parentNode.querySelector('input'); i.type = i.type === 'password' ? 'text' : 'password'; }; });
    var np = document.getElementById('np'); np.oninput = function () { var v = np.value, s = 0; if (v.length >= 8) s++; if (/[A-Za-z]/.test(v) && /\d/.test(v)) s++; if (v.length >= 12) s++; if (/[^A-Za-z0-9]/.test(v) && /[A-Z]/.test(v)) s++; document.getElementById('bars').dataset.s = v ? Math.max(1, s) : 0; };
    document.getElementById('pw').onsubmit = function (e) {
      e.preventDefault(); var b = e.target.querySelector('button[type=submit]'), m = document.getElementById('m');
      if (np.value !== document.getElementById('nc').value) { m.innerHTML = '<div class="msg err">A confirmação não confere com a nova senha.</div>'; return; }
      LC.busy(b, true, 'Salvando…');
      LC.api('POST', '/api/account/password', { current: document.getElementById('cur').value, password: np.value, confirm: document.getElementById('nc').value })
        .then(function () { m.innerHTML = '<div class="msg ok">Senha alterada com sucesso.</div>'; e.target.reset(); document.getElementById('bars').dataset.s = 0; })
        .catch(function (er) { m.innerHTML = '<div class="msg err">' + E(er.message) + '</div>'; }).then(function () { LC.busy(b, false); });
    };
    return Promise.resolve();
  }

  LC.me().then(function () { render(true); });
})();