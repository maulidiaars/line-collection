(function () {
  'use strict';
  var app = document.getElementById('app'), E = LC.esc;
  var ref = new URLSearchParams(location.search).get('ref') || '';
  LC.topbar();
  LC.api('GET', '/api/sandbox/info?ref=' + encodeURIComponent(ref)).then(function (p) {
    app.innerHTML = '<div class="auth-wrap"><div class="auth-card" style="max-width:520px"><span class="tag-sbx">Modo teste · sem dinheiro real</span>' +
      '<h1 style="margin:14px 0 6px">Pagamento simulado</h1><p class="sub">Esta tela substitui o Mercado Pago durante os testes. Escolha o resultado que quer simular para o pedido <b class="mono">' + E(p.order_number) + '</b> (' + LC.brl(p.amount_cents) + ').</p><div id="m"></div>' +
      '<div style="display:grid;gap:10px">' +
      '<button class="btn" data-o="approved">Simular pagamento aprovado</button>' +
      '<button class="btn ghost" data-o="pending">Simular pagamento pendente (Pix/boleto)</button>' +
      '<button class="btn ghost" data-o="rejected">Simular pagamento recusado</button>' +
      '<button class="btn danger" data-o="cancelled">Simular pagamento cancelado</button></div>' +
      '<p class="small muted" style="margin-top:18px">A simulação usa o mesmo código do webhook real: o servidor registra o evento, confere o valor e só então libera os plugins.</p></div></div>';
    app.querySelectorAll('[data-o]').forEach(function (b) {
      b.onclick = function () {
        app.querySelectorAll('button').forEach(function (x) { x.disabled = true; });
        LC.api('POST', '/api/sandbox/resolve', { ref: ref, outcome: b.dataset.o }).then(function () { location.href = '/pagamento/resultado?pedido=' + encodeURIComponent(p.order_number); })
          .catch(function (e) { document.getElementById('m').innerHTML = '<div class="msg err">' + E(e.message) + '</div>'; app.querySelectorAll('button').forEach(function (x) { x.disabled = false; }); });
      };
    });
  }).catch(function (e) { app.innerHTML = '<div class="auth-wrap"><div class="auth-card"><h1>Pagamento não encontrado</h1><p class="sub">' + E(e.message) + '</p><a class="btn" href="/conta/pedidos">Ver pedidos</a></div></div>'; });
})();
