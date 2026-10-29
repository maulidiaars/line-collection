(function () {
  'use strict';
  var app = document.getElementById('app'), E = LC.esc;
  var NAV = [['/conta', 'Resumo'], ['/conta/perfil', 'Meu perfil'], ['/conta/plugins', 'Meus plugins'], ['/conta/pedidos', 'Pedidos'], ['/conta/pagamentos', 'Pagamentos'], ['/conta/notificacoes', 'Notificações'], ['/conta/configuracoes', 'Configurações']];
  var VIEWS = { '/conta': resumo, '/conta/perfil': perfil, '/conta/plugins': plugins, '/conta/pedidos': pedidos, '/conta/pagamentos': pagamentos, '/conta/notificacoes': notificacoes, '/conta/configuracoes': config };
  var me;

  function shell(path, inner) {
    var side = NAV.map(function (n) { return '<a href="' + n[0] + '" class="' + (n[0] === path ? 'on' : '') + '" data-link>' + n[1] + (n[0] === '/conta/notificacoes' && me.unread ? '<span class="badge">' + me.unread + '</span>' : '') + '</a>'; }).join('');
    app.innerHTML = '<div class="shell"><aside class="side" aria-label="Menu da conta">' + side + '</aside><section id="view">' + inner + '</section></div>';
  }
  function render() {
    var path = location.pathname.replace(/\/$/, '') || '/conta';
    var fn = VIEWS[path] || resumo; if (!VIEWS[path]) path = '/conta';
    document.title = (NAV.filter(function (n) { return n[0] === path; })[0] || ['', 'Minha conta'])[1] + ' — Line Collection';
    LC.me(true).then(function (m) { me = m; shell(path, '<div class="skeleton"></div>'); return fn(document.getElementById('view')); })
      .catch(function (e) { document.getElementById('view').innerHTML = '<div class="msg err">' + E(e.message) + '</div>'; });
  }
  document.addEventListener('click', function (e) { var a = e.target.closest('a[data-link]'); if (a && a.origin === location.origin) { e.preventDefault(); history.pushState(null, '', a.pathname); render(); window.scrollTo(0, 0); } });
  window.addEventListener('popstate', render);

  function head(t, p, extra) { return '<div class="page-h"><div><h1>' + t + '</h1>' + (p ? '<p>' + p + '</p>' : '') + '</div>' + (extra || '') + '</div>'; }

  function resumo(el) {
    return LC.api('GET', '/api/account/summary').then(function (s) {
      el.innerHTML = head('Olá, ' + E(me.user.name.split(' ')[0]), 'Resumo da sua conta.') +
        '<div class="stats"><div class="stat"><div class="k">Plugins</div><div class="v cy">' + s.plugins + '</div></div><div class="stat"><div class="k">Pedidos pagos</div><div class="v">' + s.paidOrders + '</div></div><div class="stat"><div class="k">Aguardando</div><div class="v">' + s.pendingOrders + '</div></div><div class="stat"><div class="k">Não lidas</div><div class="v">' + s.unread + '</div></div></div>' +
        '<div class="panel"><h2>Pedidos recentes</h2>' + (s.recent.length ? '<div class="tbl-wrap"><table><thead><tr><th>Pedido</th><th>Data</th><th>Status</th><th class="num">Total</th></tr></thead><tbody>' +
          s.recent.map(function (o) { return '<tr><td class="mono">' + E(o.order_number) + '</td><td>' + LC.dt(o.created_at) + '</td><td>' + LC.pill(o.status) + '</td><td class="num">' + LC.brl(o.total_cents) + '</td></tr>'; }).join('') + '</tbody></table></div>' :
          '<div class="empty">Você ainda não fez nenhum pedido.<br><br><a class="btn sm" href="/#plugins">Ver plugins</a></div>') + '</div>' +
        (s.plugins ? '<a class="btn ghost" href="/conta/plugins" data-link>Ir para Meus plugins →</a>' : '');
    });
  }

  function perfil(el) {
    return LC.api('GET', '/api/account/profile').then(function (p) {
      el.innerHTML = head('Meu perfil', 'Dados da sua conta. O email não pode ser alterado aqui.') +
        '<form class="panel" id="pf" style="max-width:640px"><div id="m"></div>' +
        '<div class="field"><label for="email">Email</label><input id="email" value="' + E(p.email) + '" disabled></div>' +
        '<div class="field"><label for="name">Nome</label><input id="name" value="' + E(p.name) + '" required maxlength="80"></div>' +
        '<div class="row"><div class="field"><label for="phone">Telefone</label><input id="phone" value="' + E(p.phone || '') + '" maxlength="30"></div><div class="field"><label for="country">País</label><input id="country" value="' + E(p.country || '') + '" maxlength="60"></div></div>' +
        '<div class="field"><label for="daw">DAW que você usa</label><input id="daw" value="' + E(p.daw || '') + '" placeholder="FL Studio, Ableton…" maxlength="60"></div>' +
        '<div class="field"><label for="bio">Sobre você</label><textarea id="bio" maxlength="300">' + E(p.bio || '') + '</textarea></div>' +
        '<p class="small muted" style="margin-bottom:14px">Conta criada em ' + LC.dt(p.created_at) + '</p><button class="btn" type="submit">Salvar alterações</button></form>';
      document.getElementById('pf').onsubmit = function (e) {
        e.preventDefault(); var b = e.target.querySelector('button'); LC.busy(b, true);
        var body = {}; ['name', 'phone', 'country', 'daw', 'bio'].forEach(function (k) { body[k] = document.getElementById(k).value; });
        LC.api('PUT', '/api/account/profile', body).then(function () { LC.toast('Perfil salvo.'); me.user.name = body.name; LC.topbar(); }).catch(function (er) { document.getElementById('m').innerHTML = '<div class="msg err">' + E(er.message) + '</div>'; }).then(function () { LC.busy(b, false); });
      };
    });
  }

  function plugins(el) {
    return LC.api('GET', '/api/account/plugins').then(function (list) {
      var h = head('Meus plugins', 'Tudo o que você tem acesso. Os downloads são gerados na hora, só para você.', '<a class="btn ghost sm" href="/#plugins">Ver mais plugins</a>');
      if (!list.length) { el.innerHTML = h + '<div class="empty">Você ainda não tem plugins na conta.<br><br><a class="btn sm" href="/#plugins">Explorar plugins</a></div>'; return; }
      el.innerHTML = h + '<div class="plug-grid">' + list.map(function (p) {
        var nm = E(p.name);
        var src = p.source === 'admin_grant' ? 'Liberado pelo suporte' + (p.reason ? ' · ' + E(p.reason) : '') : 'Compra ' + E(p.order_number || '');
        return '<article class="pcard" style="--ac:' + E(p.accent) + '"><img src="/assets/img/' + E(p.image || '') + '.webp" alt="Interface do ' + nm + '" onerror="this.style.display=\'none\'"><div class="b"><h3>' + nm + '</h3>' +
          '<div class="meta">' + LC.pill('active') + '<br>' + src + '<br>Desde ' + LC.dt(p.granted_at) + '<br>Versão: ' + (p.version ? 'v' + E(p.version) + ' · ' + LC.size(p.fileSize) : '<span style="color:var(--warn)">arquivo ainda não disponível</span>') + '</div>' +
          '<div class="act">' + (p.fileAvailable ? '<button class="btn sm" data-dl="' + p.versionId + '">Baixar instalador</button>' : '<button class="btn ghost sm" disabled>Download em breve</button>') + '</div></div></article>';
      }).join('') + '</div>';
      el.querySelectorAll('[data-dl]').forEach(function (b) {
        b.onclick = function () { LC.busy(b, true, 'Gerando link…'); LC.api('POST', '/api/downloads/request', { versionId: +b.dataset.dl }).then(function (r) { location.href = r.url; }).catch(function (e) { LC.toast(e.message, true); }).then(function () { LC.busy(b, false); }); };
      });
    });
  }

  function pedidos(el) {
    return LC.api('GET', '/api/account/orders').then(function (os) {
      var h = head('Pedidos', 'Histórico de todas as suas compras.');
      if (!os.length) { el.innerHTML = h + '<div class="empty">Nenhum pedido ainda.</div>'; return; }
      el.innerHTML = h + os.map(function (o) {
        var act = '';
        if (o.status === 'pending' || o.status === 'failed') act = '<button class="btn sm" data-retry="' + E(o.order_number) + '">Pagar agora</button> ' + (o.status === 'pending' ? '<button class="btn danger sm" data-cancel="' + E(o.order_number) + '">Cancelar pedido</button>' : '');
        return '<div class="panel"><div class="page-h" style="margin-bottom:12px"><div><span class="mono">' + E(o.order_number) + '</span><p>' + LC.dt(o.created_at) + '</p></div><div>' + LC.pill(o.status) + '</div></div>' +
          '<div class="tbl-wrap"><table><tbody>' + o.items.map(function (i) { return '<tr><td>' + E(i.product_name) + '</td><td class="num">' + LC.brl(i.unit_price_cents) + '</td></tr>'; }).join('') + '<tr><td><b>Total</b></td><td class="num"><b>' + LC.brl(o.total_cents) + '</b></td></tr></tbody></table></div>' +
          (act ? '<div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap">' + act + '</div>' : '') + '</div>';
      }).join('');
      el.querySelectorAll('[data-retry]').forEach(function (b) { b.onclick = function () { LC.busy(b, true); LC.api('POST', '/api/orders/' + b.dataset.retry + '/retry').then(function (r) { location.href = r.redirectUrl; }).catch(function (e) { LC.toast(e.message, true); LC.busy(b, false); }); }; });
      el.querySelectorAll('[data-cancel]').forEach(function (b) { b.onclick = function () { if (!confirm('Cancelar este pedido?')) return; LC.api('POST', '/api/orders/' + b.dataset.cancel + '/cancel').then(function () { LC.toast('Pedido cancelado.'); render(); }).catch(function (e) { LC.toast(e.message, true); }); }; });
    });
  }

  function pagamentos(el) {
    return LC.api('GET', '/api/account/payments').then(function (ps) {
      var h = head('Pagamentos', 'Cada tentativa de pagamento fica registrada aqui.');
      el.innerHTML = h + (ps.length ? '<div class="tbl-wrap"><table><thead><tr><th>Data</th><th>Pedido</th><th>Método</th><th>Status</th><th class="num">Valor</th></tr></thead><tbody>' + ps.map(function (p) {
        return '<tr><td>' + LC.dt(p.created_at) + '</td><td class="mono">' + E(p.order_number) + '</td><td>' + E(p.method || (p.provider === 'sandbox' ? 'teste' : '—')) + '</td><td>' + LC.pill(p.status) + '</td><td class="num">' + LC.brl(p.amount_cents) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="empty">Nenhum pagamento registrado.</div>');
    });
  }

  function notificacoes(el) {
    return LC.api('GET', '/api/account/notifications').then(function (ns) {
      el.innerHTML = head('Notificações', '', ns.some(function (n) { return !n.read_at; }) ? '<button class="btn ghost sm" id="readAll">Marcar todas como lidas</button>' : '') +
        (ns.length ? '<div class="panel" style="padding:0">' + ns.map(function (n) {
          return '<div class="notif ' + (n.read_at ? 'read' : '') + '" data-id="' + n.id + '"><span class="pt"></span><div><h3>' + E(n.title) + '</h3><p>' + E(n.body || '') + '</p><time>' + LC.dt(n.created_at) + '</time>' + (n.link ? ' · <a class="small" style="color:var(--cy)" href="' + E(n.link) + '" data-link>abrir</a>' : '') + '</div></div>'; }).join('') + '</div>' : '<div class="empty">Sem notificações por enquanto.</div>');
      var ra = document.getElementById('readAll'); if (ra) ra.onclick = function () { LC.api('POST', '/api/account/notifications/read', {}).then(render); };
      el.querySelectorAll('.notif:not(.read)').forEach(function (n) { n.style.cursor = 'pointer'; n.onclick = function () { LC.api('POST', '/api/account/notifications/read', { id: +n.dataset.id }).then(function () { n.classList.add('read'); }); }; });
    });
  }

  function config(el) {
    el.innerHTML = head('Configurações', 'Segurança da conta.') +
      '<form class="panel" id="pw" style="max-width:520px"><h2>Alterar senha</h2><div id="m"></div>' +
      '<div class="field"><label for="cur">Senha atual</label><input id="cur" type="password" autocomplete="current-password" required></div>' +
      '<div class="field"><label for="np">Nova senha</label><input id="np" type="password" autocomplete="new-password" required minlength="8"></div>' +
      '<div class="field"><label for="nc">Confirmar nova senha</label><input id="nc" type="password" autocomplete="new-password" required></div>' +
      '<p class="hint" style="margin-bottom:14px">Ao trocar a senha, os outros dispositivos conectados são desconectados.</p><button class="btn" type="submit">Alterar senha</button></form>';
    document.getElementById('pw').onsubmit = function (e) {
      e.preventDefault(); var b = e.target.querySelector('button'), m = document.getElementById('m'); LC.busy(b, true);
      LC.api('POST', '/api/account/password', { current: cur.value, password: np.value, confirm: nc.value })
        .then(function () { m.innerHTML = '<div class="msg ok">Senha alterada com sucesso.</div>'; e.target.reset(); })
        .catch(function (er) { m.innerHTML = '<div class="msg err">' + E(er.message) + '</div>'; }).then(function () { LC.busy(b, false); });
    };
    return Promise.resolve();
  }

  LC.me().then(function (m) { me = m; LC.topbar(); render(); });
})();
