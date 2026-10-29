(function () {
  'use strict';
  var app = document.getElementById('app'), E = LC.esc;
  var num = new URLSearchParams(location.search).get('pedido') || '';
  var tries = 0;
  LC.topbar();

  function view(o) {
    var c = { paid: ['Pagamento confirmado', 'Seu pagamento foi verificado pelo nosso servidor e os plugins já estão na sua conta.', 'ok'],
      pending: ['Aguardando confirmação', 'Ainda não recebemos a confirmação do pagamento. Isso pode levar alguns instantes (Pix e boleto podem demorar mais). Esta página atualiza sozinha; você também pode fechar e voltar depois em Pedidos.', 'info'],
      failed: ['Pagamento não aprovado', 'O pagamento foi recusado ou não pôde ser concluído. Nenhum acesso foi liberado e nada foi cobrado.', 'err'],
      cancelled: ['Pedido cancelado', 'Este pedido foi cancelado. Nenhum acesso foi liberado.', 'err'],
      refunded: ['Pedido reembolsado', 'O valor deste pedido foi devolvido e o acesso removido.', 'info'] }[o.status];
    var actions = o.status === 'paid' ? '<a class="btn" href="/conta/plugins">Ver Meus plugins</a> <a class="btn ghost" href="/conta/pedidos">Pedidos</a>'
      : o.status === 'pending' ? '<button class="btn ghost" id="chk">Verificar agora</button> <a class="btn ghost" href="/conta/pedidos">Pedidos</a>'
      : o.status === 'failed' ? '<button class="btn" id="retry">Tentar pagar novamente</button> <a class="btn ghost" href="/conta/pedidos">Pedidos</a>'
      : '<a class="btn" href="/#plugins">Voltar à loja</a>';
    app.innerHTML = '<div class="auth-wrap"><div class="auth-card" style="max-width:520px"><p class="mono muted small" style="letter-spacing:.14em">PEDIDO ' + E(o.order_number) + '</p><h1 style="margin:8px 0">' + c[0] + '</h1><div class="msg ' + c[2] + '">' + c[1] + '</div>' +
      '<dl class="kv" style="margin-bottom:22px"><dt>Total</dt><dd>' + LC.brl(o.total_cents) + '</dd><dt>Status</dt><dd>' + LC.pill(o.status) + '</dd>' + (o.paid_at ? '<dt>Pago em</dt><dd>' + LC.dt(o.paid_at) + '</dd>' : '') + '</dl><div style="display:flex;gap:10px;flex-wrap:wrap">' + actions + '</div></div></div>';
    var r = document.getElementById('retry'); if (r) r.onclick = function () { LC.busy(r, true); LC.api('POST', '/api/orders/' + encodeURIComponent(num) + '/retry').then(function (x) { location.href = x.redirectUrl; }).catch(function (e) { LC.toast(e.message, true); LC.busy(r, false); }); };
    var k = document.getElementById('chk'); if (k) k.onclick = load;
  }
  function load() {
    LC.api('GET', '/api/orders/' + encodeURIComponent(num) + '/status').then(function (o) {
      view(o);
      if (o.status === 'pending' && ++tries < 30) setTimeout(load, 4000);   // só consulta o status; nunca concede acesso daqui
    }).catch(function (e) { app.innerHTML = '<div class="auth-wrap"><div class="auth-card"><h1>Pedido não encontrado</h1><p class="sub">' + E(e.message) + '</p><a class="btn" href="/conta/pedidos">Ver meus pedidos</a></div></div>'; });
  }
  if (!num) location.href = '/conta/pedidos'; else load();
})();
