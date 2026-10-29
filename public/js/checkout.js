(function () {
  'use strict';
  var app = document.getElementById('app'), E = LC.esc, CART = 'lc_cart';
  function getCart() { try { return JSON.parse(localStorage.getItem(CART) || '[]'); } catch (e) { return []; } }
  function setCart(a) { try { localStorage.setItem(CART, JSON.stringify(a)); } catch (e) {} }

  Promise.all([LC.topbar(), fetch('/api/products', { credentials: 'same-origin' }).then(function (r) { return r.json(); })]).then(function (r) {
    var data = r[1], by = {}; data.products.forEach(function (p) { by[p.slug] = p; });
    function draw() {
      var cart = getCart().filter(function (s) { return by[s]; }); setCart(cart);
      var items = cart.map(function (s) { return by[s]; });
      if (!items.length) { app.innerHTML = '<div class="co" style="display:block;text-align:center"><div class="empty"><h2 style="font-size:20px;margin-bottom:8px">Seu carrinho está vazio</h2><p style="margin-bottom:18px">Escolha um plugin ou pacote para começar.</p><a class="btn" href="/#plugins">Ver plugins</a></div></div>'; return; }
      var total = items.reduce(function (a, p) { return a + p.currentPriceCents; }, 0);
      var normal = items.reduce(function (a, p) { return a + p.priceCents; }, 0);
      var sbx = data.paymentProvider === 'sandbox';
      app.innerHTML = '<div class="co"><div><div class="page-h"><div><h1>Carrinho</h1><p>Confira os itens antes de pagar.</p></div></div><div class="panel" id="list">' +
        items.map(function (p) {
          var inc = p.includes ? '<div class="small muted">' + p.includes.map(function (i) { return E(i.name); }).join(', ') + '</div>' : '<div class="small muted">' + E(p.category || '') + '</div>';
          var img = p.image ? '<img src="/assets/img/' + E(p.image) + '.webp" alt="" onerror="this.outerHTML=\'<div class=ph>' + E(p.name.slice(0, 2).toUpperCase()) + '</div>\'">' : '<div class="ph">' + E(p.name.slice(0, 2).toUpperCase()) + '</div>';
          return '<div class="co-item">' + img + '<div><b>' + E(p.name) + '</b>' + inc + '<button class="btn danger sm" style="margin-top:8px" data-rm="' + E(p.slug) + '">Remover</button></div><div style="text-align:right;font-variant-numeric:tabular-nums"><b>' + LC.brl(p.currentPriceCents) + '</b>' + (p.currentPriceCents < p.priceCents ? '<div class="small muted"><s>' + LC.brl(p.priceCents) + '</s></div>' : '') + '</div></div>';
        }).join('') + '</div><div id="m"></div></div>' +
        '<aside class="panel sum"><h2>Resumo</h2><div class="line"><span>Itens</span><span>' + items.length + '</span></div>' +
        (normal > total ? '<div class="line"><span>Preço normal</span><s>' + LC.brl(normal) + '</s></div><div class="line" style="color:var(--cy)"><span>Desconto de lançamento</span><span>− ' + LC.brl(normal - total) + '</span></div>' : '') +
        '<div class="tot"><span>Total</span><span>' + LC.brl(total) + '</span></div>' +
        (sbx ? '<p class="msg info small"><span class="tag-sbx">Modo teste</span><br>Pagamento simulado. Nenhum dinheiro é cobrado.</p>' : '<p class="small muted" style="margin-bottom:12px">Você será levado ao Mercado Pago para pagar com segurança. Não guardamos dados do seu cartão.</p>') +
        '<button class="btn block" id="pay">' + (sbx ? 'Ir para pagamento de teste' : 'Pagar com Mercado Pago') + '</button><p class="small muted" style="margin-top:12px">O valor final é confirmado pelo servidor. O acesso aos plugins é liberado automaticamente após a confirmação do pagamento.</p></aside></div>';
      app.querySelectorAll('[data-rm]').forEach(function (b) { b.onclick = function () { setCart(getCart().filter(function (s) { return s !== b.dataset.rm; })); draw(); }; });
      document.getElementById('pay').onclick = function () {
        var b = this, m = document.getElementById('m'); m.innerHTML = '';
        LC.me().then(function (me) {
          if (!me.user) { location.href = '/entrar?next=/carrinho'; return; }
          LC.busy(b, true, 'Criando pedido…');
          return LC.api('POST', '/api/checkout', { items: cart }).then(function (r) { setCart([]); location.href = r.redirectUrl; })
            .catch(function (e) { m.innerHTML = '<div class="msg err">' + E(e.message) + '</div>'; LC.busy(b, false); });
        });
      };
    }
    draw();
  });
})();
