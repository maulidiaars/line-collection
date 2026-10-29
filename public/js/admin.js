(function () {
  'use strict';
  var app = document.getElementById('app'), E = LC.esc, me;
  var NAV = [['/admin', 'Resumo'], ['/admin/produtos', 'Produtos'], ['/admin/pedidos', 'Pedidos'], ['/admin/usuarios', 'Usuários'], ['/admin/auditoria', 'Auditoria']];
  var VIEWS = { '/admin': resumo, '/admin/produtos': produtos, '/admin/pedidos': pedidos, '/admin/usuarios': usuarios, '/admin/auditoria': auditoria };
  var money = function (c) { return LC.brl(c || 0); };
  var toCents = function (v) { v = String(v).trim().replace(/\./g, '').replace(',', '.'); if (v === '') return null; var n = Math.round(parseFloat(v) * 100); return isNaN(n) ? NaN : n; };
  var fromCents = function (c) { return c == null ? '' : (c / 100).toFixed(2).replace('.', ','); };

  function adminBar() {
    var el = document.getElementById('top'); if (!el) return;
    el.innerHTML = '<a class="logo" href="/admin">' + LC.LOGO + '<b><span>LINE</span>COLLECTION</b></a><span class="adm-tag">ADMIN</span><div class="sp"></div><span class="adm-user">' + E(me.user.name || '') + '</span><button type="button" class="btn ghost sm" id="admOut">Sair</button>';
    document.getElementById('admOut').onclick = function () { LC.api('POST', '/api/auth/logout').then(function () { location.href = '/entrar'; }); };
  }
  function render() {
    var path = location.pathname.replace(/\/$/, '') || '/admin'; if (!VIEWS[path]) path = '/admin';
    var side = '<div class="grp">Administração</div>' + NAV.map(function (n) { return '<a href="' + n[0] + '" data-link class="' + (n[0] === path ? 'on' : '') + '">' + n[1] + '</a>'; }).join('');
    app.innerHTML = '<div class="shell"><aside class="side">' + side + '</aside><section id="view"><div class="skeleton"></div></section></div>';
    document.title = NAV.filter(function (n) { return n[0] === path; })[0][1] + ' — Admin Line Collection';
    VIEWS[path](document.getElementById('view')).catch(function (e) { document.getElementById('view').innerHTML = '<div class="msg err">' + E(e.message) + '</div>'; });
  }
  document.addEventListener('click', function (e) { var a = e.target.closest('a[data-link]'); if (a && a.origin === location.origin) { e.preventDefault(); history.pushState(null, '', a.pathname); render(); window.scrollTo(0, 0); } });
  window.addEventListener('popstate', render);
  var head = function (t, p, x) { return '<div class="page-h"><div><h1>' + t + '</h1>' + (p ? '<p>' + p + '</p>' : '') + '</div>' + (x || '') + '</div>'; };
  var tbl = function (cols, rows, empty) { return rows.length ? '<div class="tbl-wrap"><table><thead><tr>' + cols.map(function (c) { return '<th' + (c[1] ? ' class="num"' : '') + '>' + c[0] + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>' : '<div class="empty">' + (empty || 'Nada por aqui.') + '</div>'; };
  var err = function (box, e) { box.innerHTML = '<div class="msg err">' + E(e.message) + '</div>'; };

  // ---------- Resumo ----------
  function resumo(el) {
    return LC.api('GET', '/api/admin/summary').then(function (s) {
      el.innerHTML = head('Resumo', 'Visão geral da loja. A receita conta somente pedidos com pagamento verificado.') +
        '<div class="stats"><div class="stat"><div class="k">Receita verificada</div><div class="v cy">' + money(s.revenueCents) + '</div></div><div class="stat"><div class="k">Usuários</div><div class="v">' + s.users + '</div></div><div class="stat"><div class="k">Pedidos</div><div class="v">' + s.orders + '</div></div><div class="stat"><div class="k">Pagos</div><div class="v">' + s.paid + '</div></div><div class="stat"><div class="k">Aguardando</div><div class="v">' + s.pending + '</div></div><div class="stat"><div class="k">Falhos/cancelados</div><div class="v">' + s.failed + '</div></div><div class="stat"><div class="k">Reembolsados</div><div class="v">' + s.refunded + '</div></div><div class="stat"><div class="k">Acessos manuais</div><div class="v">' + s.manualGrants + '</div></div></div>' +
        '<div class="panel"><h2>Mais vendidos</h2>' + tbl([['Produto'], ['Vendas', 1], ['Receita', 1]], s.top.map(function (t) { return '<tr><td>' + E(t.name) + '</td><td class="num">' + t.sold + '</td><td class="num">' + money(t.cents) + '</td></tr>'; }), 'Nenhuma venda paga ainda.') + '</div>' +
        '<div class="panel"><h2>Pedidos recentes</h2>' + tbl([['Pedido'], ['Cliente'], ['Status'], ['Total', 1]], s.recentOrders.map(function (o) { return '<tr><td class="mono">' + E(o.order_number) + '</td><td>' + E(o.email) + '</td><td>' + LC.pill(o.status) + '</td><td class="num">' + money(o.total_cents) + '</td></tr>'; }), 'Sem pedidos.') + '</div>' +
        '<div class="panel"><h2>Atividade administrativa</h2>' + tbl([['Quando'], ['Admin'], ['Ação']], s.activity.map(function (a) { return '<tr><td>' + LC.dt(a.created_at) + '</td><td>' + E(a.admin || '—') + '</td><td class="mono">' + E(a.action) + '</td></tr>'; }), 'Sem atividade.') + '</div>';
    });
  }

  // ---------- Produtos ----------
  function produtos(el) {
    return Promise.all([LC.api('GET', '/api/admin/products'), LC.api('GET', '/api/admin/settings')]).then(function (r) {
      var list = r[0], st = r[1];
      el.innerHTML = head('Produtos', 'Preços, versões, arquivos e bundles.', '<button class="btn sm" id="newP">+ Novo produto</button>') +
        '<div class="panel"><label style="display:flex;align-items:center;gap:10px;text-transform:none;font:14px Inter;letter-spacing:0;color:var(--tx);margin:0"><input type="checkbox" id="launch" style="width:auto"' + (st.launchActive ? ' checked' : '') + '> Promoção de lançamento ativa (usa o "preço de lançamento" de cada produto)</label></div>' +
        tbl([['Produto'], ['Tipo'], ['Preço', 1], ['Lançamento', 1], ['Vendas', 1], ['Arquivo'], ['Status'], ['']], list.map(function (p) {
          var cur = p.versions.filter(function (v) { return v.is_current; })[0];
          return '<tr><td><b>' + E(p.name) + '</b><div class="small muted mono">' + E(p.slug) + '</div></td><td>' + p.kind + '</td><td class="num">' + money(p.price_cents) + '</td><td class="num">' + (p.launch_price_cents != null ? money(p.launch_price_cents) : '—') + '</td><td class="num">' + p.sold + '</td>' +
            '<td>' + (p.kind === 'bundle' ? '<span class="muted small">via plugins</span>' : cur && cur.has_file ? '<span class="small">v' + E(cur.version) + ' · ' + LC.size(cur.file_size) + '</span>' : '<span class="small" style="color:var(--warn)">sem arquivo</span>') + '</td>' +
            '<td>' + (p.is_active ? LC.pill('active') : LC.pill('cancelled').replace('Cancelado', 'Inativo')) + '</td><td style="white-space:nowrap"><button class="btn ghost sm" data-edit="' + p.id + '">Editar</button>' + (p.kind === 'plugin' ? ' <button class="btn ghost sm" data-ver="' + p.id + '">Versões</button>' : '') + '</td></tr>'; }));
      document.getElementById('launch').onchange = function () { LC.api('PUT', '/api/admin/settings/launch', { active: this.checked }).then(function () { LC.toast('Configuração salva.'); }).catch(function (e) { LC.toast(e.message, true); }); };
      document.getElementById('newP').onclick = function () { editor(null, list); };
      el.querySelectorAll('[data-edit]').forEach(function (b) { b.onclick = function () { editor(list.filter(function (p) { return p.id == b.dataset.edit; })[0], list); }; });
      el.querySelectorAll('[data-ver]').forEach(function (b) { b.onclick = function () { versoes(list.filter(function (p) { return p.id == b.dataset.ver; })[0]); }; });
    });
  }

  function editor(p, all) {
    var isNew = !p, plugins = all.filter(function (x) { return x.kind === 'plugin'; });
    p = p || { name: '', slug: '', kind: 'plugin', category: '', description: '', features: [], accent: '#33E6FF', price_cents: 9900, launch_price_cents: null, is_active: 1, includes: [] };
    var M = LC.modal('<h2>' + (isNew ? 'Novo produto' : 'Editar ' + E(p.name)) + '</h2><p class="small muted" style="margin-bottom:16px">Valores em reais (ex.: 99,00). O servidor sempre usa estes valores, nunca os do navegador do cliente.</p><div id="em"></div>' +
      (isNew ? '<div class="row"><div class="field"><label for="k">Tipo</label><select id="k"><option value="plugin">Plugin</option><option value="bundle">Bundle</option></select></div><div class="field"><label for="sl">Slug (URL)</label><input id="sl" placeholder="automático"></div></div>' : '') +
      '<div class="field"><label for="n">Nome</label><input id="n" value="' + E(p.name) + '" maxlength="80"></div><div class="field"><label for="c">Categoria</label><input id="c" value="' + E(p.category || '') + '"></div>' +
      '<div class="field"><label for="d">Descrição</label><textarea id="d">' + E(p.description || '') + '</textarea></div><div class="field"><label for="f">Destaques (um por linha)</label><textarea id="f">' + E((p.features || []).join('\n')) + '</textarea></div>' +
      '<div class="row"><div class="field"><label for="pr">Preço (R$)</label><input id="pr" value="' + fromCents(p.price_cents) + '" inputmode="decimal"></div><div class="field"><label for="lp">Preço lançamento (R$)</label><input id="lp" value="' + fromCents(p.launch_price_cents) + '" inputmode="decimal" placeholder="opcional"></div></div>' +
      '<div class="row"><div class="field"><label for="ac">Cor de destaque</label><input id="ac" type="color" value="' + E(p.accent || '#33E6FF') + '" style="height:44px;padding:4px"></div><div class="field"><label for="ia">Status</label><select id="ia"><option value="1"' + (p.is_active ? ' selected' : '') + '>Ativo (à venda)</option><option value="0"' + (!p.is_active ? ' selected' : '') + '>Inativo (oculto)</option></select></div></div>' +
      '<div class="field" id="incBox"' + (p.kind === 'bundle' || isNew ? '' : ' hidden') + '><label>Plugins incluídos no bundle</label>' + plugins.map(function (x) { return '<label style="display:flex;gap:8px;align-items:center;text-transform:none;font:14px Inter;letter-spacing:0;color:var(--tx)"><input type="checkbox" class="inc" value="' + x.id + '" style="width:auto"' + (p.includes.indexOf(x.id) >= 0 ? ' checked' : '') + '>' + E(x.name) + '</label>'; }).join('') + '</div>' +
      (!isNew ? '<div class="field"><label for="im">Imagem do produto (PNG/JPG/WEBP até 3 MB)</label><input id="im" type="file" accept="image/png,image/jpeg,image/webp"></div>' : '') +
      '<div class="acts"><button class="btn ghost" data-close>Cancelar</button><button class="btn" id="sv">Salvar</button></div>', function (bg, close) {
        var k = bg.querySelector('#k'), box = bg.querySelector('#incBox');
        if (k) { box.hidden = k.value !== 'bundle'; k.onchange = function () { box.hidden = k.value !== 'bundle'; }; }
        bg.querySelector('#sv').onclick = function () {
          var b = this, m = bg.querySelector('#em'); m.innerHTML = '';
          var price = toCents(bg.querySelector('#pr').value), lp = toCents(bg.querySelector('#lp').value);
          if (price == null || isNaN(price) || isNaN(lp)) { m.innerHTML = '<div class="msg err">Preço inválido.</div>'; return; }
          var body = { name: bg.querySelector('#n').value, category: bg.querySelector('#c').value, description: bg.querySelector('#d').value, features: bg.querySelector('#f').value.split('\n'),
            priceCents: price, launchPriceCents: lp, accent: bg.querySelector('#ac').value, isActive: bg.querySelector('#ia').value === '1',
            includes: [].map.call(bg.querySelectorAll('.inc:checked'), function (c) { return +c.value; }) };
          if (isNew) { body.kind = bg.querySelector('#k').value; body.slug = bg.querySelector('#sl').value; }
          LC.busy(b, true);
          var req = isNew ? LC.api('POST', '/api/admin/products', body) : LC.api('PUT', '/api/admin/products/' + p.id, body);
          req.then(function (r) {
            var f = bg.querySelector('#im') && bg.querySelector('#im').files[0];
            if (!f) return;
            var fd = new FormData(); fd.append('image', f); return LC.api('POST', '/api/admin/products/' + (p.id || r.id) + '/image', fd, true);
          }).then(function () { close(); LC.toast('Produto salvo.'); render(); }).catch(function (e) { err(m, e); LC.busy(b, false); });
        };
      });
  }

  function versoes(p) {
    var M = LC.modal('<h2>Versões · ' + E(p.name) + '</h2><p class="small muted" style="margin-bottom:14px">Arquivos ficam em armazenamento privado. Clientes só baixam com link temporário, após o servidor conferir o acesso.</p><div id="vm"></div>' +
      (p.versions.length ? '<div class="tbl-wrap" style="margin-bottom:18px"><table><thead><tr><th>Versão</th><th>Arquivo</th><th>SHA-256</th><th></th></tr></thead><tbody>' + p.versions.map(function (v) {
        return '<tr><td>v' + E(v.version) + (v.is_current ? ' ' + LC.pill('active').replace('Ativo', 'Atual') : '') + '</td><td class="small">' + (v.has_file ? E(v.original_name) + '<br>' + LC.size(v.file_size) : '—') + '</td><td class="mono small">' + E((v.sha256 || '').slice(0, 12)) + '</td><td>' + (!v.is_current && v.has_file ? '<button class="btn ghost sm" data-cur="' + v.id + '">Tornar atual</button>' : '') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="empty" style="margin-bottom:18px">Nenhum arquivo enviado ainda. Clientes verão "download em breve".</div>') +
      '<form id="vf"><h2 style="font-size:15px">Enviar nova versão</h2><div class="row"><div class="field"><label for="vv">Versão</label><input id="vv" placeholder="1.0.0" required></div><div class="field"><label for="vfile">Arquivo (.zip .exe .msi .7z)</label><input id="vfile" type="file" accept=".zip,.exe,.msi,.7z" required></div></div><div class="field"><label for="vc">Notas da versão</label><textarea id="vc"></textarea></div><div class="acts"><button type="button" class="btn ghost" data-close>Fechar</button><button class="btn" type="submit">Enviar</button></div></form>', function (bg, close) {
        bg.querySelectorAll('[data-cur]').forEach(function (b) { b.onclick = function () { LC.api('PUT', '/api/admin/versions/' + b.dataset.cur + '/current').then(function () { close(); LC.toast('Versão atual atualizada.'); render(); }).catch(function (e) { err(bg.querySelector('#vm'), e); }); }; });
        bg.querySelector('#vf').onsubmit = function (e) {
          e.preventDefault(); var b = e.target.querySelector('[type=submit]'); LC.busy(b, true, 'Enviando…');
          var fd = new FormData(); fd.append('version', bg.querySelector('#vv').value); fd.append('changelog', bg.querySelector('#vc').value); fd.append('file', bg.querySelector('#vfile').files[0]);
          LC.api('POST', '/api/admin/products/' + p.id + '/versions', fd, true).then(function () { close(); LC.toast('Versão enviada. Clientes foram notificados.'); render(); }).catch(function (er) { err(bg.querySelector('#vm'), er); LC.busy(b, false); });
        };
      });
  }

  // ---------- Pedidos ----------
  function pedidos(el) {
    el.innerHTML = head('Pedidos', 'Busque por número do pedido ou email.') + '<div class="toolbar"><input id="q" placeholder="Buscar…" type="search"><select id="st"><option value="">Todos os status</option><option value="pending">Aguardando</option><option value="paid">Pagos</option><option value="failed">Falhos</option><option value="cancelled">Cancelados</option><option value="refunded">Reembolsados</option></select></div><div id="lst"></div>';
    var t;
    function load() {
      return LC.api('GET', '/api/admin/orders?q=' + encodeURIComponent(q.value) + '&status=' + st.value).then(function (os) {
        lst.innerHTML = tbl([['Pedido'], ['Cliente'], ['Data'], ['Status'], ['Total', 1], ['']], os.map(function (o) { return '<tr><td class="mono">' + E(o.order_number) + '</td><td>' + E(o.email) + '</td><td>' + LC.dt(o.created_at) + '</td><td>' + LC.pill(o.status) + '</td><td class="num">' + money(o.total_cents) + '</td><td><button class="btn ghost sm" data-o="' + o.id + '">Detalhes</button></td></tr>'; }), 'Nenhum pedido encontrado.');
        lst.querySelectorAll('[data-o]').forEach(function (b) { b.onclick = function () { pedido(+b.dataset.o, load); }; });
      });
    }
    q.oninput = function () { clearTimeout(t); t = setTimeout(load, 300); }; st.onchange = load;
    return load();
  }
  function pedido(id, done) {
    LC.api('GET', '/api/admin/orders/' + id).then(function (o) {
      LC.modal('<h2>Pedido ' + E(o.order_number) + '</h2><p class="small muted" style="margin-bottom:14px">' + E(o.email) + ' · ' + LC.dt(o.created_at) + '</p><div id="om"></div>' +
        '<p style="margin-bottom:12px">' + LC.pill(o.status) + ' &nbsp; <b>' + money(o.total_cents) + '</b></p>' +
        tbl([['Item'], ['Valor', 1]], o.items.map(function (i) { return '<tr><td>' + E(i.product_name) + '</td><td class="num">' + money(i.unit_price_cents) + '</td></tr>'; })) +
        '<h2 style="font-size:15px;margin:18px 0 8px">Pagamentos</h2>' + tbl([['Gateway'], ['Status'], ['Ref. gateway'], ['Valor', 1]], o.payments.map(function (p) { return '<tr><td>' + E(p.provider) + '</td><td>' + LC.pill(p.status) + '<div class="small muted mono">' + E(p.raw_status || '') + '</div></td><td class="mono small">' + E(p.provider_payment_id || '—') + '</td><td class="num">' + money(p.amount_cents) + '</td></tr>'; }), 'Sem pagamentos.') +
        '<div class="acts"><button class="btn ghost" data-close>Fechar</button>' + (o.status === 'pending' ? '<button class="btn danger" id="oc">Cancelar pedido</button>' : '') + (o.status === 'paid' ? '<button class="btn danger" id="orf">Reembolsar</button>' : '') + '</div>', function (bg, close) {
          var oc = bg.querySelector('#oc'), rf = bg.querySelector('#orf');
          if (oc) oc.onclick = function () { if (confirm('Cancelar este pedido?')) LC.api('POST', '/api/admin/orders/' + id + '/cancel').then(function () { close(); LC.toast('Pedido cancelado.'); done(); }).catch(function (e) { err(bg.querySelector('#om'), e); }); };
          if (rf) rf.onclick = function () { var r = prompt('Motivo do reembolso (obrigatório). O acesso aos plugins deste pedido será removido.'); if (!r) return; LC.api('POST', '/api/admin/orders/' + id + '/refund', { reason: r }).then(function (x) { close(); LC.toast(x.message || 'Reembolso registrado.'); done(); }).catch(function (e) { err(bg.querySelector('#om'), e); }); };
        });
    }).catch(function (e) { LC.toast(e.message, true); });
  }

  // ---------- Usuários ----------
  function usuarios(el) {
    el.innerHTML = head('Usuários', 'Busque por email ou nome.') + '<div class="toolbar"><input id="q" placeholder="email@exemplo.com" type="search"></div><div id="lst"></div>';
    var t;
    function load() {
      return LC.api('GET', '/api/admin/users?q=' + encodeURIComponent(q.value)).then(function (us) {
        lst.innerHTML = tbl([['Usuário'], ['Papel'], ['Plugins', 1], ['Pedidos', 1], ['Status'], ['']], us.map(function (u) { return '<tr><td><b>' + E(u.name) + '</b><div class="small muted">' + E(u.email) + '</div></td><td>' + (u.role === 'admin' ? 'Admin' : 'Cliente') + '</td><td class="num">' + u.plugins + '</td><td class="num">' + u.orders + '</td><td>' + (u.is_active ? LC.pill('active') : LC.pill('revoked').replace('Revogado', 'Desativada')) + '</td><td><button class="btn ghost sm" data-u="' + u.id + '">Abrir</button></td></tr>'; }), 'Nenhum usuário encontrado.');
        lst.querySelectorAll('[data-u]').forEach(function (b) { b.onclick = function () { usuario(+b.dataset.u); }; });
      });
    }
    q.oninput = function () { clearTimeout(t); t = setTimeout(load, 300); };
    return load();
  }
  function usuario(id) {
    Promise.all([LC.api('GET', '/api/admin/users/' + id), LC.api('GET', '/api/admin/products')]).then(function (r) {
      var u = r[0], prods = r[1];
      var M = LC.modal('<h2>' + E(u.name) + '</h2><p class="small muted" style="margin-bottom:14px">' + E(u.email) + ' · cadastro ' + LC.dt(u.created_at) + ' · ' + (u.role === 'admin' ? 'Admin' : 'Cliente') + '</p><div id="um"></div>' +
        '<h2 style="font-size:15px;margin:6px 0 8px">Plugins e acessos</h2>' + tbl([['Plugin'], ['Origem'], ['Status'], ['']], u.entitlements.map(function (e) { return '<tr><td>' + E(e.name) + '</td><td class="small">' + (e.source === 'purchase' ? 'Compra' : 'Liberação manual<div class="muted">' + E(e.reason || '') + '</div>') + '</td><td>' + LC.pill(e.status) + (e.revoked_reason ? '<div class="small muted">' + E(e.revoked_reason) + '</div>' : '') + '</td><td>' + (e.status === 'active' ? '<button class="btn danger sm" data-rv="' + e.id + '">Revogar</button>' : '') + '</td></tr>'; }), 'Sem plugins.') +
        '<h2 style="font-size:15px;margin:18px 0 8px">Pedidos</h2>' + tbl([['Pedido'], ['Status'], ['Total', 1]], u.orders.map(function (o) { return '<tr><td class="mono">' + E(o.order_number) + '</td><td>' + LC.pill(o.status) + '</td><td class="num">' + money(o.total_cents) + '</td></tr>'; }), 'Sem pedidos.') +
        '<div class="acts" style="justify-content:space-between"><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="gr">Liberar plugin</button><button class="btn ghost" id="nt">Enviar aviso</button></div><div style="display:flex;gap:8px"><button class="btn ' + (u.is_active ? 'danger' : 'ghost') + '" id="ac">' + (u.is_active ? 'Desativar conta' : 'Reativar conta') + '</button><button class="btn ghost" data-close>Fechar</button></div></div>', function (bg, close) {
          var um = bg.querySelector('#um');
          bg.querySelectorAll('[data-rv]').forEach(function (b) { b.onclick = function () {
            var reason = prompt('Motivo da revogação (obrigatório):'); if (!reason) return;
            if (!confirm('Confirmar: remover o acesso deste usuário ao plugin?')) return;
            LC.api('POST', '/api/admin/entitlements/' + b.dataset.rv + '/revoke', { reason: reason, confirm: true }).then(function () { close(); LC.toast('Acesso revogado.'); usuario(id); }).catch(function (e) { err(um, e); }); }; });
          bg.querySelector('#ac').onclick = function () { LC.api('PUT', '/api/admin/users/' + id + '/active', { active: !u.is_active }).then(function () { close(); LC.toast('Conta atualizada.'); render(); }).catch(function (e) { err(um, e); }); };
          bg.querySelector('#nt').onclick = function () { var t = prompt('Título do aviso:'); if (!t) return; var b = prompt('Mensagem:') || ''; LC.api('POST', '/api/admin/users/' + id + '/notify', { title: t, body: b }).then(function () { LC.toast('Aviso enviado.'); }).catch(function (e) { err(um, e); }); };
          bg.querySelector('#gr').onclick = function () { close(); conceder(u, prods); };
        });
    }).catch(function (e) { LC.toast(e.message, true); });
  }
  function conceder(u, prods) {
    LC.modal('<h2>Liberar plugin para ' + E(u.name) + '</h2><p class="small muted" style="margin-bottom:14px">Liberação manual não é pagamento e <b>não entra na receita</b>. O usuário recebe uma notificação na conta.</p><div id="gm"></div>' +
      '<div class="field"><label for="gp">Plugin ou pacote</label><select id="gp">' + prods.filter(function (p) { return p.is_active; }).map(function (p) { return '<option value="' + p.id + '">' + E(p.name) + (p.kind === 'bundle' ? ' (pacote)' : '') + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="gt">Motivo</label><select id="gt"><option>presente</option><option>promoção</option><option>compensação</option><option>pedido manual</option><option>outro</option></select></div>' +
      '<div class="field"><label for="gn">Observação (opcional)</label><input id="gn" maxlength="300"></div>' +
      '<label style="display:flex;gap:8px;align-items:center;text-transform:none;font:14px Inter;letter-spacing:0;color:var(--tx)"><input type="checkbox" id="gc" style="width:auto"> Confirmo que quero liberar este acesso</label>' +
      '<div class="acts"><button class="btn ghost" data-close>Cancelar</button><button class="btn" id="gs">Liberar acesso</button></div>', function (bg, close) {
        bg.querySelector('#gs').onclick = function () {
          var b = this; if (!bg.querySelector('#gc').checked) { err(bg.querySelector('#gm'), new Error('Marque a confirmação para continuar.')); return; }
          LC.busy(b, true);
          LC.api('POST', '/api/admin/users/' + u.id + '/grant', { productId: +bg.querySelector('#gp').value, reasonType: bg.querySelector('#gt').value, reasonNote: bg.querySelector('#gn').value, confirm: true })
            .then(function (r) { close(); LC.toast('Acesso liberado (' + r.granted + ' plugin' + (r.granted > 1 ? 's' : '') + ').'); usuario(u.id); }).catch(function (e) { err(bg.querySelector('#gm'), e); LC.busy(b, false); });
        };
      });
  }

  // ---------- Auditoria ----------
  function auditoria(el) {
    return LC.api('GET', '/api/admin/audit').then(function (rows) {
      el.innerHTML = head('Auditoria', 'Registro de todas as ações administrativas (últimas 200).') +
        tbl([['Quando'], ['Admin'], ['Ação'], ['Alvo'], ['Detalhes']], rows.map(function (a) { return '<tr><td>' + LC.dt(a.created_at) + '</td><td>' + E(a.admin || '—') + '</td><td class="mono small">' + E(a.action) + '</td><td class="small">' + E((a.target_type || '') + ' ' + (a.target_id || '')) + '</td><td class="small muted" style="max-width:300px;word-break:break-word">' + E(a.details || '') + '</td></tr>'; }), 'Nenhuma ação registrada.');
    });
  }

  LC.me().then(function (m) { me = m; if (!m.user || m.user.role !== 'admin') { location.href = '/entrar'; return; } adminBar(); render(); });
})();