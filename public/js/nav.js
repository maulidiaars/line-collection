/* Navbar do site (páginas do usuário) + carrinho + aviso de login. Usado IGUAL em todas as páginas do usuário. Admin não usa este arquivo.
   Regras:
   - Visitante (sem login) NÃO consegue adicionar ao carrinho: aparece um aviso pedindo para entrar/criar conta.
   - O carrinho fica no navegador (localStorage) e só existe para quem está logado. O preço final é sempre calculado no servidor. */
(function () {
  'use strict';
  var KEY = 'lc_cart', OFF = 'lc_cart_off', PEND = 'lc_pending';
  var PROD = null, ME = null, csrf = null, host = null, lastFocus = null, undo = null, undoTimer = 0, confirmClear = false;

  var LOGO = '<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="nvg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#33E6FF"/><stop offset=".55" stop-color="#7A8CFF"/><stop offset="1" stop-color="#C45CFF"/></linearGradient><radialGradient id="nvk" cx=".5" cy=".35" r=".7"><stop offset="0" stop-color="#3A4250"/><stop offset="1" stop-color="#0B0E14"/></radialGradient></defs><circle cx="32" cy="32" r="27" fill="none" stroke="#1A2330" stroke-width="5"/><path d="M13.1 50.9A27 27 0 1 1 50.9 50.9" fill="none" stroke="url(#nvg)" stroke-width="5" stroke-linecap="round"/><circle cx="32" cy="32" r="17" fill="url(#nvk)" stroke="rgba(255,255,255,.12)"/><circle cx="32" cy="20.5" r="2.6" fill="#33E6FF"/></svg>';
  var I_CART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2.2l2.1 10.2a1.5 1.5 0 0 0 1.5 1.2h8.1a1.5 1.5 0 0 0 1.5-1.1L20 8H6.2"/><circle cx="9.5" cy="19.5" r="1.3"/><circle cx="17" cy="19.5" r="1.3"/></svg>';
  var I_USER = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 20c1.2-3.6 4.2-5.5 8-5.5s6.8 1.9 8 5.5"/></svg>';
  var I_TRASH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 1.8h6a2 2 0 0 0 2-1.8l1-12M9 7V4.8A.8.8 0 0 1 9.8 4h4.4a.8.8 0 0 1 .8.8V7"/></svg>';
  var I_LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/><circle cx="12" cy="15.5" r="1.2"/></svg>';
  var I_OUT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4H6.5A1.5 1.5 0 0 0 5 5.5v13A1.5 1.5 0 0 0 6.5 20H9M15 8l4 4-4 4M19 12H9"/></svg>';
  var I_CHEV = '<svg class="sn-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  var I_BARS = '<svg viewBox="0 0 64 48" aria-hidden="true"><rect x="6" y="22" width="7" height="20" rx="3"/><rect x="18" y="10" width="7" height="32" rx="3"/><rect x="30" y="28" width="7" height="14" rx="3"/><rect x="42" y="4" width="7" height="38" rx="3"/><rect x="54" y="18" width="7" height="24" rx="3"/></svg>';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function brl(c) { return 'R$ ' + (c / 100).toFixed(2).replace('.', ',').replace(/,00$/, ''); }
  function cur(p) { return p.currentPriceCents != null ? p.currentPriceCents : p.priceCents; }
  function readList(k) { try { var a = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(a) ? a.filter(function (x) { return typeof x === 'string'; }) : []; } catch (e) { return []; } }
  function writeList(k, a) { try { if (a.length) localStorage.setItem(k, JSON.stringify(a)); else localStorage.removeItem(k); } catch (e) {} }
  function getCart() { return readList(KEY); }
  function setCart(a) {
    var seen = {}; a = a.filter(function (s) { if (seen[s]) return false; seen[s] = 1; return true; });
    writeList(KEY, a); writeList(OFF, getOff().filter(function (s) { return a.indexOf(s) >= 0; })); badge(); window.dispatchEvent(new Event('lc:cart'));
  }
  function getOff() { return readList(OFF); }          // itens do carrinho que a pessoa DESmarcou
  function getJSON(u) { return fetch(u, { credentials: 'same-origin' }).then(function (r) { return r.json(); }); }
  function loadMe(force) {
    if (ME && !force) return ME;
    ME = getJSON('/api/auth/me').then(function (j) { csrf = j.csrf || null; return j; }).catch(function () { return {}; });
    return ME;
  }
  function loadProducts(force) {
    if (PROD && !force) return PROD;
    PROD = getJSON('/api/products').then(function (j) { var by = {}; (j.products || []).forEach(function (p) { by[p.slug] = p; }); return by; }).catch(function () { PROD = null; return {}; });
    return PROD;
  }
  function prettyName(n) {
    var m = /^(.*?)(line)$/i.exec(n || ''); return m && m[1] ? esc(m[1].toUpperCase()) + '<span>LINE</span>' : esc(n);
  }

  /* ---------- navbar ---------- */
  function loginHref() {
    var p = location.pathname;
    if (p === '/entrar' || p === '/cadastro') return '/entrar';
    return '/entrar?next=' + encodeURIComponent(p + location.search);
  }
  function mount(el) {
    el = el || document.getElementById('siteNav') || document.getElementById('top'); if (!el) return;
    host = el; el.className = 'sn';
    el.innerHTML = '<div class="sn-in"><a class="logo sn-logo" href="/" aria-label="Line Collection">' + LOGO + '<b><span>LINE</span>COLLECTION</b></a>' +
      '<nav class="sn-links" aria-label="Principal"><a href="/#precos">Pacotes</a><a href="/#faq">FAQ</a></nav>' +
      '<div class="sn-right"><button type="button" class="sn-cart" id="snCart" aria-label="Abrir carrinho" aria-haspopup="dialog">' + I_CART + '<b class="sn-n" id="snN" hidden>0</b></button><span class="sn-slot" id="snSlot"></span></div></div>';
    document.getElementById('snCart').onclick = function () {
      loadMe().then(function (m) { if (m.user) open(); else gate(); });
    };
    badge();
    loadMe().then(function (m) {
      var u = m.user, slot = document.getElementById('snSlot');
      if (!u) { writeList(KEY, []); writeList(OFF, []); badge(); }   // visitante nunca tem carrinho
      else applyPending();
      if (!slot) return;
      if (u) { slot.innerHTML = accountMenu(u, m.unread); wireMenu(slot); }
      else slot.innerHTML = '<a class="btn sm sn-login" href="' + esc(loginHref()) + '">Entrar</a>';
    });
  }
  // Menu da conta (só aparece para quem está logado): mostra QUEM está logado e tem o botão Sair
  function accountMenu(u, unread) {
    var label = u.username ? '@' + u.username : (u.name || 'Minha conta');
    return '<div class="sn-menu"><button type="button" class="sn-acc" id="snAcc" aria-haspopup="menu" aria-expanded="false" aria-controls="snDd">' + I_USER + '<span>' + esc(label) + '</span>' + I_CHEV + (unread ? '<i class="sn-dot">' + esc(unread) + '</i>' : '') + '</button>' +
      '<div class="sn-dd" id="snDd" role="menu" hidden><div class="sn-who"><b>' + esc(u.name || '') + '</b><small>' + esc(u.email) + '</small></div>' +
      '<a role="menuitem" href="/conta">Minha conta</a>' + (u.role === 'admin' ? '<a role="menuitem" href="/admin">Painel admin</a>' : '') +
      '<button type="button" role="menuitem" class="sn-out" id="snOut">' + I_OUT + 'Sair</button></div></div>';
  }
  function wireMenu(slot) {
    var btn = slot.querySelector('#snAcc'), dd = slot.querySelector('#snDd'); if (!btn || !dd) return;
    function set(o) { dd.hidden = !o; btn.setAttribute('aria-expanded', o ? 'true' : 'false'); }
    btn.onclick = function (e) { e.stopPropagation(); set(dd.hidden); };
    document.addEventListener('click', function (e) { if (!slot.contains(e.target)) set(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !dd.hidden) { set(false); btn.focus(); } });
    slot.querySelector('#snOut').onclick = logout;
  }
  function logout() {
    var b = document.getElementById('snOut'); if (b) { b.disabled = true; b.lastChild.textContent = 'Saindo…'; }
    loadMe().then(function () {
      return fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { Accept: 'application/json', 'X-CSRF-Token': csrf || '' } });
    }).catch(function () {}).then(function () {
      writeList(KEY, []); writeList(OFF, []); try { localStorage.removeItem(PEND); } catch (e) {}
      location.href = '/';
    });
  }
  function badge() {
    var n = getCart().length, b = document.getElementById('snN'); if (!b) return;
    b.hidden = !n; b.textContent = n;
    b.classList.remove('bump'); void b.offsetWidth; if (n) b.classList.add('bump');
  }

  /* ---------- aviso: precisa entrar / criar conta ---------- */
  function gate(slug, name) {
    if (document.getElementById('snGate')) return;
    var sec = slug && document.getElementById(slug === 'synthkeyline' ? 'synthline' : slug);
    var back = sec ? '/#' + sec.id : location.pathname + location.search;
    var go = '/entrar?next=' + encodeURIComponent(back) + '&reason=cart';
    var txt = slug ? 'Você precisa entrar ou criar uma conta para adicionar ' + (name ? '<b>' + esc(name) + '</b>' : 'itens') + ' ao carrinho.' : 'Você precisa entrar ou criar uma conta para usar o carrinho.';
    lastFocus = document.activeElement;
    var bg = document.createElement('div'); bg.id = 'snGate'; bg.className = 'sn-gbg';
    bg.innerHTML = '<div class="sn-gate" role="alertdialog" aria-modal="true" aria-labelledby="sgT" aria-describedby="sgD"><div class="sn-gic">' + I_LOCK + '</div>' +
      '<h2 id="sgT">Entre para continuar</h2><p id="sgD">' + txt + '</p>' +
      '<div class="sn-gact"><button type="button" class="sn-btn ghost" data-cancel>Cancelar</button><a class="sn-btn" id="sgGo" href="' + esc(go) + '">Entrar ou criar conta</a></div></div>';
    document.body.appendChild(bg); document.documentElement.classList.add('sn-lock');
    requestAnimationFrame(function () { bg.classList.add('on'); });
    function done() {
      document.removeEventListener('keydown', key); document.documentElement.classList.remove('sn-lock');
      bg.classList.remove('on'); setTimeout(function () { bg.remove(); }, 160);
      if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch (e) {}
    }
    function key(e) {
      if (e.key === 'Escape') { e.preventDefault(); done(); }
      else if (e.key === 'Tab') {
        var f = bg.querySelectorAll('button,a'); if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', key);
    bg.addEventListener('mousedown', function (e) { if (e.target === bg) done(); });
    bg.querySelector('[data-cancel]').onclick = done;
    // lembra o item: depois do login ele entra no carrinho sozinho
    document.getElementById('sgGo').addEventListener('click', function () {
      if (slug) { try { localStorage.setItem(PEND, JSON.stringify({ slug: slug, t: Date.now() })); } catch (e) {} }
    });
    document.getElementById('sgGo').focus();
  }
  function applyPending() {
    var raw = null; try { raw = JSON.parse(localStorage.getItem(PEND) || 'null'); } catch (e) {}
    try { localStorage.removeItem(PEND); } catch (e) {}
    if (!raw || !raw.slug || Date.now() - (raw.t || 0) > 30 * 60e3) return;
    loadProducts().then(function (by) { var p = by[raw.slug]; if (p && !p.owned) doAdd(p.slug, p.name); });
  }

  /* ---------- adicionar ao carrinho (usado pelos botões "Comprar") ---------- */
  function add(slug, name) {
    loadMe().then(function (m) { if (!m.user) gate(slug, name); else doAdd(slug, name); });
  }
  function doAdd(slug, name) {
    loadProducts().then(function (by) {
      var p = by[slug];
      if (p && p.owned) { toast((name || p.name) + ' já está na sua conta.'); return; }
      var c = getCart(), had = c.indexOf(slug) >= 0; if (!had) c.push(slug); setCart(c);
      toast((name || (p && p.name) || 'Item') + (had ? ' já está no carrinho' : ' adicionado ao carrinho'), true);
    });
  }
  function toast(msg, withBtn) {
    var old = document.querySelector('.sn-toast'); if (old) old.remove();
    var t = document.createElement('div'); t.className = 'sn-toast'; t.setAttribute('role', 'status');
    t.innerHTML = '<span>' + esc(msg) + '</span>' + (withBtn ? '<button type="button">Ver carrinho</button>' : '');
    if (withBtn) t.querySelector('button').onclick = function () { t.remove(); open(); };
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 4200);
  }

  /* ---------- carrinho (painel lateral) ---------- */
  function open() {
    if (document.getElementById('snDrawer')) return;
    lastFocus = document.activeElement; confirmClear = false;
    var bg = document.createElement('div'); bg.id = 'snDrawer'; bg.className = 'sn-bg';
    bg.innerHTML = '<aside class="sn-pane" role="dialog" aria-modal="true" aria-label="Carrinho"><div class="sn-ph"><h2>Seu carrinho<span class="sn-cnt" id="snCnt" hidden></span></h2><button type="button" class="sn-x" data-x aria-label="Fechar carrinho">×</button></div>' +
      '<div class="sn-tb" id="snTb" hidden></div><div class="sn-pb" id="snBody"></div><div class="sn-undo" id="snUndo" hidden></div><div class="sn-pf" id="snFoot"></div></aside>';
    document.body.appendChild(bg); document.documentElement.classList.add('sn-lock');
    bg.addEventListener('mousedown', function (e) { if (e.target === bg) close(); });
    bg.addEventListener('click', onClick);
    bg.addEventListener('change', onChange);
    document.addEventListener('keydown', onKey);
    requestAnimationFrame(function () { bg.classList.add('on'); });
    draw(true);
  }
  function onKey(e) {
    var bg = document.getElementById('snDrawer'); if (!bg) return;
    if (e.key === 'Escape') { close(); return; }
    if (e.key === 'Tab') {
      var f = Array.prototype.filter.call(bg.querySelectorAll('button,a[href],input,[tabindex="0"]'), function (x) { return !x.disabled && x.offsetParent !== null; });
      if (!f.length) return; var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || !bg.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  function close() {
    var bg = document.getElementById('snDrawer'); if (!bg) return;
    document.removeEventListener('keydown', onKey); document.documentElement.classList.remove('sn-lock');
    clearTimeout(undoTimer); undo = null;
    bg.classList.remove('on'); setTimeout(function () { bg.remove(); }, 180);
    var b = document.getElementById('snCart'); if (b) b.focus();
  }

  var VIEW = { by: {}, cart: [], sel: [] };
  function draw(first) {
    var body = document.getElementById('snBody'); if (!body) return;
    loadProducts().then(function (by) {
      var raw = getCart(), known = Object.keys(by).length > 0;
      if (!known) {
        body.innerHTML = '<div class="sn-empty">' + I_BARS + '<p>Não foi possível carregar o carrinho.</p><span>Verifique sua conexão e tente de novo.</span><button type="button" class="sn-btn ghost" data-retry>Tentar de novo</button></div>';
        document.getElementById('snFoot').innerHTML = ''; document.getElementById('snTb').hidden = true; return;
      }
      // remove do carrinho o que não existe mais ou que a pessoa já possui
      var cart = raw.filter(function (s) { return by[s] && !by[s].owned; });
      if (cart.length !== raw.length) { setCart(cart); if (first) showUndo(null, 'Itens indisponíveis ou que você já possui foram removidos.'); }
      var off = getOff().filter(function (s) { return cart.indexOf(s) >= 0; });
      var sel = cart.filter(function (s) { return off.indexOf(s) < 0; });
      VIEW = { by: by, cart: cart, sel: sel };
      render();
      if (first) { var x = document.querySelector('#snDrawer [data-x]'); if (x) x.focus(); }
    });
  }
  function bundleCovering(by, cart, slug) {   // pacote no carrinho que já inclui este plugin?
    for (var i = 0; i < cart.length; i++) { var b = by[cart[i]]; if (b && b.kind === 'bundle' && (b.includes || []).some(function (x) { return x.slug === slug; })) return b; }
    return null;
  }
  function upsell(by, cart) {                 // pacote mais barato que os plugins soltos que já estão no carrinho
    var best = null;
    Object.keys(by).forEach(function (k) {
      var b = by[k]; if (b.kind !== 'bundle' || b.owned || cart.indexOf(b.slug) >= 0 || !(b.includes || []).length) return;
      var inc = b.includes.map(function (x) { return x.slug; });
      if (!inc.every(function (s) { return cart.indexOf(s) >= 0; })) return;
      var sum = inc.reduce(function (a, s) { return a + cur(by[s]); }, 0), save = sum - cur(b);
      if (save > 0 && (!best || save > best.save)) best = { b: b, inc: inc, save: save };
    });
    return best;
  }
  function render() {
    var by = VIEW.by, cart = VIEW.cart, sel = VIEW.sel;
    var body = document.getElementById('snBody'), foot = document.getElementById('snFoot'), tb = document.getElementById('snTb'), cnt = document.getElementById('snCnt');
    if (!body) return;
    cnt.hidden = !cart.length; cnt.textContent = cart.length;
    if (!cart.length) {
      tb.hidden = true;
      body.innerHTML = '<div class="sn-empty">' + I_BARS + '<p>Seu carrinho está vazio</p><span>Escolha um plugin ou pacote para começar a montar sua cadeia.</span><a class="sn-btn" href="/#plugins" data-x>Explorar plugins</a></div>';
      foot.innerHTML = '<a class="sn-more" href="/#precos" data-x>Ver pacotes</a>'; return;
    }
    // barra de ferramentas: selecionar tudo / remover selecionados / esvaziar
    tb.hidden = false;
    tb.innerHTML = confirmClear
      ? '<div class="sn-conf" role="alertdialog"><span>Remover todos os ' + cart.length + ' itens?</span><span><button type="button" class="sn-link" data-noclear>Cancelar</button><button type="button" class="sn-link danger" data-yesclear>Sim, esvaziar</button></span></div>'
      : '<label class="sn-ck"><input type="checkbox" data-all' + (sel.length === cart.length ? ' checked' : '') + '><i></i><span>Selecionar tudo</span></label>' +
        '<span class="sn-tba"><button type="button" class="sn-link" data-delsel' + (sel.length ? '' : ' disabled') + '>Remover<span class="sn-lg"> selecionados</span>' + (sel.length ? ' (' + sel.length + ')' : '') + '</button><button type="button" class="sn-link danger" data-clear>Esvaziar</button></span>';
    var all = tb.querySelector('[data-all]'); if (all) all.indeterminate = sel.length > 0 && sel.length < cart.length;

    var items = cart.map(function (s) { return by[s]; });
    var dupBlock = {};
    body.innerHTML = items.map(function (p) {
      var on = sel.indexOf(p.slug) >= 0, c = cur(p), cov = p.kind === 'plugin' ? bundleCovering(by, cart, p.slug) : null;
      if (cov && on) dupBlock[p.slug] = cov.name;
      var sub = p.kind === 'bundle' ? (p.includes || []).length + ' plugins' : (p.category || 'Plugin VST3');
      var inc = p.kind === 'bundle' && p.includes ? '<small class="sn-inc" title="' + esc(p.includes.map(function (i) { return i.name; }).join(', ')) + '">' + esc(p.includes.map(function (i) { return i.name; }).join(' · ')) + '</small>' : '';
      var ini = esc((p.name || '?').slice(0, 2).toUpperCase());
      return '<div class="sn-it' + (on ? '' : ' off') + '" style="--ac:' + esc(/^#[0-9a-f]{3,8}$/i.test(p.accent || '') ? p.accent : '#33E6FF') + '">' +
        '<label class="sn-ck" aria-label="Incluir ' + esc(p.name) + ' na compra"><input type="checkbox" data-sel="' + esc(p.slug) + '"' + (on ? ' checked' : '') + '><i></i></label>' +
        '<div class="sn-th"><span>' + ini + '</span>' + (p.image ? '<img src="/assets/img/' + esc(p.image) + '.webp" alt="" loading="lazy" onerror="this.remove()">' : '') + '</div>' +
        '<div class="sn-tx"><b>' + prettyName(p.name) + '</b><small>' + esc(sub) + '</small>' + inc +
        (cov ? '<span class="sn-dup">Já incluído em ' + esc(cov.name) + ' <button type="button" data-rm="' + esc(p.slug) + '">Remover</button></span>' : '') + '</div>' +
        '<div class="sn-pr"><b>' + brl(c) + '</b>' + (c < p.priceCents ? '<s>' + brl(p.priceCents) + '</s>' : '') + '</div>' +
        '<button type="button" class="sn-rm" data-rm="' + esc(p.slug) + '" aria-label="Remover ' + esc(p.name) + ' do carrinho">' + I_TRASH + '</button></div>';
    }).join('');
    VIEW.dup = dupBlock;

    var up = upsell(by, cart);
    if (up) body.insertAdjacentHTML('beforeend', '<div class="sn-tip"><div><b>Pacote mais barato</b><span>Troque ' + esc(up.inc.map(function (s) { return by[s].name; }).join(' + ')) + ' por <b>' + esc(up.b.name) + '</b> e economize ' + brl(up.save) + '.</span></div><button type="button" class="sn-btn sm" data-swap="' + esc(up.b.slug) + '">Trocar</button></div>');
    VIEW.up = up;

    var selItems = sel.map(function (s) { return by[s]; }), total = 0, normal = 0;
    selItems.forEach(function (p) { total += cur(p); normal += p.priceCents; });
    foot.innerHTML = '<div class="sn-sum"><div class="sn-ln"><span>' + sel.length + (sel.length === 1 ? ' item selecionado' : ' itens selecionados') + '</span><span>' + (normal > total ? '<s>' + brl(normal) + '</s>' : '') + '</span></div>' +
      (normal > total ? '<div class="sn-ln disc"><span>Desconto de lançamento</span><span>− ' + brl(normal - total) + '</span></div>' : '') +
      '<div class="sn-tot"><span>Total</span><b>' + brl(total) + '</b></div></div><div id="snMsg" role="alert"></div>' +
      '<button type="button" class="sn-btn block" id="snPay"' + (sel.length ? '' : ' disabled') + '>' + (sel.length ? 'Finalizar compra (' + sel.length + ')' : 'Selecione ao menos 1 item') + '</button>' +
      '<button type="button" class="sn-more" data-x>Continuar comprando</button><p class="sn-sec">Pagamento seguro. O valor final é confirmado pelo servidor.</p>';
  }

  /* ---------- ações do carrinho ---------- */
  function removeSlugs(slugs, label) {
    var cart = getCart(), off = getOff(), gone = cart.filter(function (s) { return slugs.indexOf(s) >= 0; });
    if (!gone.length) return;
    setCart(cart.filter(function (s) { return slugs.indexOf(s) < 0; }));
    showUndo({ slugs: gone, off: off.filter(function (s) { return gone.indexOf(s) >= 0; }) }, label || (gone.length === 1 ? 'Item removido' : gone.length + ' itens removidos'));
    confirmClear = false; draw();
  }
  function showUndo(data, text) {
    var u = document.getElementById('snUndo'); if (!u) return;
    undo = data; clearTimeout(undoTimer);
    u.hidden = false; u.innerHTML = '<span>' + esc(text) + '</span>' + (data ? '<button type="button" data-undo>Desfazer</button>' : '');
    undoTimer = setTimeout(function () { u.hidden = true; undo = null; }, 6000);
  }
  function onChange(e) {
    var t = e.target; if (!t || t.type !== 'checkbox') return;
    var cart = VIEW.cart, off;
    if (t.hasAttribute('data-all')) off = t.checked ? [] : cart.slice();
    else if (t.hasAttribute('data-sel')) { var s = t.getAttribute('data-sel'); off = getOff().filter(function (x) { return x !== s; }); if (!t.checked) off.push(s); }
    else return;
    writeList(OFF, off); VIEW.sel = cart.filter(function (s) { return off.indexOf(s) < 0; }); render();
  }
  function onClick(e) {
    var t = e.target, el;
    if ((el = t.closest('[data-x]'))) { if (el.tagName !== 'A') e.preventDefault(); close(); return; }
    if (t.closest('[data-retry]')) { loadProducts(true).then(function () { draw(); }); return; }
    if ((el = t.closest('[data-rm]'))) { removeSlugs([el.getAttribute('data-rm')]); return; }
    if (t.closest('[data-delsel]')) { if (VIEW.sel.length) removeSlugs(VIEW.sel.slice()); return; }
    if (t.closest('[data-clear]')) { confirmClear = true; render(); return; }
    if (t.closest('[data-noclear]')) { confirmClear = false; render(); return; }
    if (t.closest('[data-yesclear]')) { removeSlugs(VIEW.cart.slice(), 'Carrinho esvaziado'); return; }
    if ((el = t.closest('[data-swap]')) && VIEW.up) {
      var up = VIEW.up; setCart(getCart().filter(function (s) { return up.inc.indexOf(s) < 0; }).concat([up.b.slug])); draw(); return;
    }
    if (t.closest('[data-undo]') && undo) {
      var u = undo; undo = null; var c = getCart(); u.slugs.forEach(function (s) { if (c.indexOf(s) < 0) c.push(s); }); setCart(c); writeList(OFF, getOff().concat(u.off));
      document.getElementById('snUndo').hidden = true; draw(); return;
    }
    if (t.closest('#snPay')) pay(t.closest('#snPay'));
  }
  function pay(btn) {
    var msg = document.getElementById('snMsg'), sel = VIEW.sel.slice(); msg.innerHTML = '';
    var fail = function (txt) { msg.innerHTML = '<div class="sn-err">' + esc(txt) + '</div>'; btn.disabled = false; btn.textContent = 'Finalizar compra (' + sel.length + ')'; };
    if (!sel.length) return;
    var d = Object.keys(VIEW.dup || {}).filter(function (s) { return sel.indexOf(s) >= 0; });
    if (d.length) { fail(VIEW.by[d[0]].name + ' já está incluído em ' + VIEW.dup[d[0]] + '. Remova o item duplicado para continuar.'); return; }
    btn.disabled = true; btn.textContent = 'Criando pedido…';
    loadMe(true).then(function (m) {
      if (!m.user) { location.href = '/entrar?next=' + encodeURIComponent(location.pathname + location.search); return; }
      return fetch('/api/checkout', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': csrf || '' }, body: JSON.stringify({ items: sel }) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || 'Não foi possível criar o pedido.'); return j; }); })
        .then(function (j) { setCart(getCart().filter(function (s) { return sel.indexOf(s) < 0; })); location.href = j.redirectUrl; });
    }).catch(function (e) { fail(e.message); });
  }

  window.LCNav = { mount: mount, add: add, open: open, close: close, count: function () { return getCart().length; } };
  window.addEventListener('storage', function (e) { if (e.key === KEY || e.key === OFF) { badge(); if (document.getElementById('snDrawer')) draw(); } });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { if (document.getElementById('siteNav')) mount(); });
  else if (document.getElementById('siteNav')) mount();
})();