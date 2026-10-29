/* Line Collection — landing page. Sem bibliotecas externas.
   Carregado no <head>; só marca a página como "js" na hora e inicia o resto no DOMContentLoaded.
   Foco em desempenho: canvas leve (30 fps, resolução limitada, qualidade adaptativa) e pausa quando fora da tela. */
(function () {
  'use strict';
  var root = document.documentElement;
  root.classList.add('js');
  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ---------- reveal ao rolar ---------- */
  function reveal() {
    var els = $$('.rv');
    if (!('IntersectionObserver' in window) || reduced) { els.forEach(function (e) { e.classList.add('in'); }); return; }
    var io = new IntersectionObserver(function (list) {
      list.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    els.forEach(function (e) {
      if (e.parentElement && e.parentElement.classList.contains('copy')) e.style.setProperty('--rd', (Array.prototype.indexOf.call(e.parentElement.children, e) * 0.07) + 's');
      io.observe(e);
    });
    setTimeout(function () { els.forEach(function (e) { if (e.getBoundingClientRect().top < innerHeight) e.classList.add('in'); }); }, 1500);
  }

  /* ---------- navbar: decora o que nav.js montou ---------- */
  function decorateNav(nav) {
    if (nav.dataset.lp) return; nav.dataset.lp = '1';
    var links = $('.sn-links', nav), right = $('.sn-right', nav);
    if (links && !$('a[href="/#plugins"]', links)) {
      var a = document.createElement('a'); a.href = '/#plugins'; a.textContent = 'Plugins'; links.insertBefore(a, links.firstChild);
    }
    var burger = null;
    if (links) $$('a', links).forEach(function (l) {
      l.addEventListener('click', function () { nav.classList.remove('open'); if (burger) burger.setAttribute('aria-expanded', 'false'); });
    });
    if (right) {
      burger = document.createElement('button'); burger.type = 'button'; burger.className = 'sn-burger';
      burger.setAttribute('aria-label', 'Abrir menu'); burger.setAttribute('aria-expanded', 'false'); burger.innerHTML = '<i></i>';
      right.insertBefore(burger, right.firstChild);
      burger.addEventListener('click', function () {
        var o = nav.classList.toggle('open'); burger.setAttribute('aria-expanded', o ? 'true' : 'false');
      });
    }
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { nav.classList.remove('open'); if (burger) burger.setAttribute('aria-expanded', 'false'); } });
    document.addEventListener('click', function (e) { if (!nav.contains(e.target)) nav.classList.remove('open'); });
    addEventListener('resize', function () { if (innerWidth > 820) nav.classList.remove('open'); });
    var prog = document.createElement('div'); prog.className = 'sn-prog'; prog.innerHTML = '<i></i>'; nav.appendChild(prog);
    var bar = prog.firstChild, scrolled = false, ticking = false;

    function onScroll() {
      if (ticking) return; ticking = true;
      requestAnimationFrame(function () {
        ticking = false;
        var max = document.documentElement.scrollHeight - innerHeight;
        bar.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, scrollY / max).toFixed(3) : 0) + ')';   // só transform: não força layout
        var s = scrollY > 24; if (s !== scrolled) { scrolled = s; nav.classList.toggle('is-scrolled', s); }
      });
    }
    addEventListener('scroll', onScroll, { passive: true }); onScroll();

    // link ativo conforme a seção visível
    if ('IntersectionObserver' in window && links) {
      var map = { plugins: '/#plugins', precos: '/#precos', faq: '/#faq' };
      var spy = new IntersectionObserver(function (list) {
        list.forEach(function (en) {
          var href = map[en.target.id]; if (!href) return;
          var l = $('a[href="' + href + '"]', links); if (l) l.setAttribute('aria-current', en.isIntersecting ? 'true' : 'false');
        });
      }, { rootMargin: '-45% 0px -50% 0px' });
      ['plugins', 'precos', 'faq'].forEach(function (id) { var s = document.getElementById(id); if (s) spy.observe(s); });
    }
  }
  function watchNav() {
    var host = document.getElementById('siteNav'); if (!host) return;
    if ($('.sn-in', host)) { decorateNav(host); return; }
    var mo = new MutationObserver(function () { if ($('.sn-in', host)) { mo.disconnect(); decorateNav(host); } });
    mo.observe(host, { childList: true });
  }

  /* ---------- hero: ridgeline de espectro (canvas 2D, decorativo e LEVE) ----------
     Por que é leve: 30 fps; resolução limitada; cada linha só preenche a faixa entre a curva e a própria base
     (em vez da tela inteira); sem shadowBlur; para de desenhar quando sai da tela; reduz a qualidade sozinho se o PC estiver lento. */
  function ridge() {
    var cv = document.getElementById('ridge'); if (!cv || !cv.getContext) return;
    var ctx = cv.getContext('2d'), hero = cv.parentElement;
    var W = 0, H = 0, sc = 1, N = 15, P = 72, deg = 0, visible = true, raf = 0, last = 0, gap = 1000 / 30;
    var cx = 0.68, tx = 0.68, t0 = performance.now(), nFrames = 0, cost = 0;

    function quality() {
      var m = W < 700; N = (m ? 10 : 15) - deg * 3; P = (m ? 48 : 72) - deg * 14; if (N < 7) N = 7; if (P < 32) P = 32;
    }
    function size() {
      var r = cv.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height);
      sc = Math.min(window.devicePixelRatio || 1, 1.25);
      cv.width = Math.round(W * sc); cv.height = Math.round(H * sc); quality(); draw(performance.now());
    }
    function bump(x, c, w) { var d = (x - c) / w; return Math.exp(-d * d); }
    function draw(now) {
      var t = reduced ? 2.4 : (now - t0) / 1000;
      cx += (tx - cx) * 0.06;
      ctx.setTransform(sc, 0, 0, sc, 0, 0); ctx.clearRect(0, 0, W, H);
      var yTop = H * 0.3, yBot = H * 0.9, amp = H * 0.36, mobile = W < 700, c1 = mobile ? 0.5 : cx;
      ctx.fillStyle = '#06080D';
      for (var i = 0; i < N; i++) {
        var k = i / (N - 1), y0 = yTop + k * (yBot - yTop), a = amp * (0.42 + 0.58 * k), mod = 0.78 + 0.22 * Math.sin(t * 1.3 + i * 0.4);
        var curve = new Path2D(), x, y, u, j;
        for (j = 0; j <= P; j++) {
          u = j / P;
          var env = bump(u, c1, 0.17) + bump(u, mobile ? 0.18 : 0.38, 0.09) * 0.45 + bump(u, 0.88, 0.1) * 0.5 + 0.05;
          var n = Math.sin(u * 19 + t * 1.1 + i * 1.7) * 0.5 + Math.sin(u * 43 - t * 0.8 + i * 3.1) * 0.35 + Math.sin(u * 97 + t * 1.7 + i * 0.7) * 0.22;
          y = y0 - a * env * mod * Math.max(0, 0.55 + n * 0.75); x = u * (W + 4) - 2;
          if (j === 0) curve.moveTo(x, y); else curve.lineTo(x, y);
        }
        var area = new Path2D(curve); area.lineTo(W + 2, y0 + 1); area.lineTo(-2, y0 + 1); area.closePath();
        ctx.fill(area);                       // esconde as linhas de trás (só a faixa necessária)
        if (i === N - 1) {                    // linha da frente: gradiente + brilho barato (sem blur)
          var g = ctx.createLinearGradient(0, 0, W, 0);
          g.addColorStop(0, 'rgba(51,230,255,.3)'); g.addColorStop(0.35, '#33E6FF'); g.addColorStop(0.62, '#7A8CFF'); g.addColorStop(0.86, '#C45CFF'); g.addColorStop(1, 'rgba(255,107,213,.6)');
          ctx.globalAlpha = 0.16; ctx.lineWidth = 6; ctx.strokeStyle = g; ctx.stroke(curve);
          ctx.globalAlpha = 1; ctx.lineWidth = 1.7; ctx.stroke(curve);
        } else {
          ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(214,232,246,' + (0.12 + 0.6 * Math.pow(k, 1.6)).toFixed(2) + ')'; ctx.stroke(curve);
        }
      }
    }
    function loop(now) {
      raf = 0; if (!visible || document.hidden) return;
      if (now - last >= gap - 1) {
        last = now; var s = performance.now(); draw(now); cost += performance.now() - s;
        if (++nFrames === 30) {               // qualidade adaptativa
          var avg = cost / 30; nFrames = 0; cost = 0;
          if (avg > 5 && deg < 3) { deg++; quality(); } else if (avg > 9 && gap < 50) gap = 1000 / 20;
        }
      }
      raf = requestAnimationFrame(loop);
    }
    function start() { if (!raf && visible && !document.hidden && !reduced) raf = requestAnimationFrame(loop); }

    size();
    if (reduced) { addEventListener('resize', size); return; }
    if ('ResizeObserver' in window) new ResizeObserver(size).observe(cv); else addEventListener('resize', size);
    if ('IntersectionObserver' in window) new IntersectionObserver(function (l) { visible = l[0].isIntersecting; start(); }).observe(hero);
    document.addEventListener('visibilitychange', start);
    if (window.matchMedia && matchMedia('(pointer:fine)').matches) {
      hero.addEventListener('pointermove', function (e) { var r = hero.getBoundingClientRect(); tx = Math.min(0.9, Math.max(0.2, (e.clientX - r.left) / r.width)); }, { passive: true });
      hero.addEventListener('pointerleave', function () { tx = 0.68; });
    }
    start();
  }

  /* ---------- índice dos plugins: prévia ao passar o mouse/foco ---------- */
  function indexPreview() {
    var rows = $$('#packIdx .idx-row'), imgs = $$('.idx-view img'), view = $('.idx-view'); if (!rows.length || !imgs.length) return;
    function set(i) {
      rows.forEach(function (r, n) { r.classList.toggle('on', n === i); });
      imgs.forEach(function (m, n) { m.classList.toggle('on', n === i); });
      if (view) view.style.setProperty('--vac', rows[i].style.getPropertyValue('--ac'));
    }
    rows.forEach(function (r, i) {
      r.addEventListener('mouseenter', function () { set(i); });
      r.addEventListener('focus', function () { set(i); });
    });
    set(0);
  }

  /* ---------- molduras: brilho que segue o ponteiro (só mouse; sem rolagem pesada) ---------- */
  function frames() {
    if (reduced || !(window.matchMedia && matchMedia('(pointer:fine)').matches)) return;
    $$('.pl-frame').forEach(function (f) {
      var pend = false, ex = 0, ey = 0;
      f.addEventListener('pointermove', function (e) {
        ex = e.clientX; ey = e.clientY; if (pend) return; pend = true;
        requestAnimationFrame(function () {
          pend = false; var r = f.getBoundingClientRect();
          f.style.setProperty('--mx', (ex - r.left) + 'px'); f.style.setProperty('--my', (ey - r.top) + 'px');
        });
      }, { passive: true });
    });
  }

  function init() { reveal(); watchNav(); ridge(); indexPreview(); frames(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();