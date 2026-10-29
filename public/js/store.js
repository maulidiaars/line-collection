/* Loja: preços vindos do servidor, botões de compra, carrinho e estado de login na página inicial. */
(function () {
  'use strict';
  var CART = 'lc_cart';
  var brl = function (c) { return 'R$ ' + (c / 100).toFixed(2).replace('.', ',').replace(/,00$/, ''); };
  var BUNDLE = { pacoteVoz: 'pacote-voz', pacoteMix: 'pacote-mix-master', pacoteCompleto: 'pacote-completo' };

  function getCart() { try { return JSON.parse(localStorage.getItem(CART) || '[]'); } catch (e) { return []; } }
  function setCart(a) { try { localStorage.setItem(CART, JSON.stringify(a)); } catch (e) {} }
  function toast(msg, err) {
    var t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : ''); t.setAttribute('role', 'status'); t.textContent = msg;
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 3500);
  }
  function api(path) { return fetch(path, { credentials: 'same-origin' }).then(function (r) { return r.json(); }); }

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function run(products, launchActive) {
    var by = {}; products.forEach(function (p) { by[p.slug] = p; });
    var plugins = products.filter(function (p) { return p.kind === 'plugin'; });

    // Preços por plugin (seções) — usa o valor atual do servidor
    document.querySelectorAll('.plug').forEach(function (sec) {
      var p = by[sec.id === 'synthline' ? 'synthkeyline' : sec.id]; if (!p) return;
      var row = sec.querySelector('.buy-row .p'); if (!row) return;
      row.innerHTML = launchActive && p.launchPriceCents != null && p.launchPriceCents < p.priceCents
        ? '<s>' + brl(p.priceCents) + '</s><span>' + brl(p.launchPriceCents) + '</span>' : '<span>' + brl(p.priceCents) + '</span>';
    });

    // Cartões de pacotes
    var sumNormal = plugins.reduce(function (a, p) { return a + p.priceCents; }, 0);
    document.querySelectorAll('.price').forEach(function (card) {
      var btn = card.querySelector('[data-buy]'); if (!btn) return;
      var key = btn.getAttribute('data-buy'), p = by[BUNDLE[key]];
      if (key === 'avulso') {
        var a = by.autoline; if (!a) return;
        var was = card.querySelector('.was'), val = card.querySelector('.val'), l = card.querySelector('.launch'), af = card.querySelector('.after');
        var on = launchActive && a.launchPriceCents != null;
        if (was) { was.hidden = !on; was.innerHTML = 'de <s>' + brl(a.priceCents) + '</s>'; }
        if (val) val.textContent = brl(on ? a.launchPriceCents : a.priceCents);
        if (l) l.hidden = !on; if (af) { af.hidden = !on; af.textContent = 'depois ' + brl(a.priceCents) + ' por plugin'; }
        return;
      }
      if (!p) return;
      var on2 = launchActive && p.launchPriceCents != null && p.launchPriceCents < p.priceCents;
      var included = p.includes ? p.includes.reduce(function (a, i) { return a + (by[i.slug] ? by[i.slug].priceCents : 0); }, 0) : sumNormal;
      var w = card.querySelector('.was'), v = card.querySelector('.val'), la = card.querySelector('.launch'), aft = card.querySelector('.after');
      if (w) { w.hidden = !on2; w.innerHTML = 'de <s>' + brl(p.priceCents) + '</s>'; }
      if (v) v.textContent = brl(on2 ? p.launchPriceCents : p.priceCents);
      if (la) la.hidden = !on2;
      if (aft) { aft.textContent = (on2 ? 'depois ' + brl(p.priceCents) + ' · ' : '') + 'avulsos somariam ' + brl(included); }
    });

    // Botões "Comprar"
    document.querySelectorAll('[data-buy]').forEach(function (a) {
      var key = a.getAttribute('data-buy'); if (key === 'avulso') return;
      var slug = BUNDLE[key] || key, p = by[slug];
      if (!p) { a.textContent = 'Indisponível'; a.setAttribute('aria-disabled', 'true'); return; }
      if (p.owned) { a.textContent = 'Na sua conta ✓'; a.classList.add('owned'); a.setAttribute('href', '/conta/plugins'); return; }
      a.setAttribute('href', '#');
      a.addEventListener('click', function (e) { e.preventDefault(); if (window.LCNav) LCNav.add(slug, p.name); });
    });
  }

  Promise.all([api('/api/auth/me'), api('/api/products')]).then(function (r) {
    if (r[1] && r[1].products) run(r[1].products, r[1].launchActive);
  }).catch(function () {});
})();