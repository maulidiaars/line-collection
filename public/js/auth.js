/* Entrar / Criar conta / Recuperar senha / Nova senha — Line Collection.
   - Login: usuário OU email + senha.   - Cadastro: nome completo, usuário, email e senha.
   - Cada erro aparece logo abaixo do campo correspondente. */
(function () {
  'use strict';
  var qs = new URLSearchParams(location.search);
  var next = qs.get('next'); if (!next || next[0] !== '/' || next.indexOf('//') === 0 || next.indexOf('\\') >= 0) next = '/conta';   // evita open-redirect
  var reason = qs.get('reason'), app = document.getElementById('app'), E = LC.esc;
  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function logo(k) {
    return '<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="ag' + k + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#33E6FF"/><stop offset=".55" stop-color="#7A8CFF"/><stop offset="1" stop-color="#C45CFF"/></linearGradient><radialGradient id="ak' + k + '" cx=".5" cy=".35" r=".7"><stop offset="0" stop-color="#3A4250"/><stop offset="1" stop-color="#0B0E14"/></radialGradient></defs><circle cx="32" cy="32" r="27" fill="none" stroke="#1A2330" stroke-width="5"/><path d="M13.1 50.9A27 27 0 1 1 50.9 50.9" fill="none" stroke="url(#ag' + k + ')" stroke-width="5" stroke-linecap="round"/><circle cx="32" cy="32" r="17" fill="url(#ak' + k + ')" stroke="rgba(255,255,255,.12)"/><circle cx="32" cy="20.5" r="2.6" fill="#33E6FF"/></svg>';
  }
  var EYE = '<svg class="on" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg><svg class="off" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.7 6.7C3.9 8.5 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 4.3-1M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
  var CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  var BACK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>';

  var PATHS = { '/entrar': 'login', '/cadastro': 'register', '/esqueci-senha': 'forgot', '/redefinir-senha': 'reset' };
  var URLS = { login: '/api/auth/login', register: '/api/auth/register', forgot: '/api/auth/forgot', reset: '/api/auth/reset' };
  var FIELDS = { login: ['identifier', 'password'], register: ['name', 'username', 'email', 'password'], forgot: ['email'], reset: ['password', 'confirm'] };
  var cur = PATHS[location.pathname] || 'login';

  function href(p) { var q = new URLSearchParams(); if (next !== '/conta') q.set('next', next); if (reason) q.set('reason', reason); var s = q.toString(); return p + (s ? '?' + s : ''); }
  function val(id) { var el = document.getElementById(id); return el ? el.value : ''; }

  /* ---------- regras de validação (no navegador; o servidor valida de novo) ---------- */
  var RULE = {
    identifier: function (v) { return v.trim() ? '' : 'Informe seu usuário ou email.'; },
    name: function (v) { v = v.trim(); return v.length < 2 ? 'Informe seu nome completo.' : v.length > 80 ? 'O nome é longo demais (máximo 80 caracteres).' : ''; },
    username: function (v) {
      if (!v) return 'Escolha um nome de usuário.';
      if (v.length < 3) return 'Use pelo menos 3 caracteres.';
      if (v.length > 20) return 'Use no máximo 20 caracteres.';
      if (!/^[a-z0-9][a-z0-9._]{1,18}[a-z0-9]$/.test(v)) return 'Use só letras minúsculas, números, ponto ou underline (começando e terminando com letra ou número).';
      return '';
    },
    email: function (v) { return /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(v.trim()) ? '' : 'Digite um email válido, como voce@email.com.'; },
    password: function (v) {
      if (!v) return 'Informe sua senha.';
      if (cur === 'login') return '';
      if (v.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
      if (v.length > 100) return 'A senha é longa demais (máximo 100 caracteres).';
      if (!/[A-Za-z]/.test(v) || !/[0-9]/.test(v)) return 'A senha precisa ter letras e números.';
      return '';
    },
    confirm: function (v) { return !v ? 'Repita a nova senha.' : v !== val('password') ? 'As senhas não conferem.' : ''; }
  };

  /* ---------- mensagens por campo ---------- */
  function setMsg(id, text, kind) {
    var f = document.getElementById('f-' + id), m = document.getElementById(id + '-m'), inp = document.getElementById(id); if (!f || !m) return;
    m.textContent = text || ''; m.className = 'm' + (text && kind ? ' ' + kind : '');
    f.classList.toggle('bad', kind === 'err'); f.classList.toggle('good', kind === 'ok');
    if (inp) { if (kind === 'err') inp.setAttribute('aria-invalid', 'true'); else inp.removeAttribute('aria-invalid'); }
  }
  function banner(text, kind) { var b = document.getElementById('m'); if (!b) return; b.className = 'au-banner' + (text ? ' ' + (kind || 'err') : ''); b.textContent = text || ''; }
  function validate(id) {
    var el = document.getElementById(id); if (!el) return true;
    var err = RULE[id](el.value);
    if (err) { setMsg(id, err, 'err'); return false; }
    if (id === 'username') {
      if (uOk === false && uVal === el.value) { setMsg(id, uMsg, 'err'); return false; }
      if (uOk === true && uVal === el.value) setMsg(id, 'Usuário disponível.', 'ok');
      return true;
    }
    setMsg(id, '', (cur === 'login' || id === 'password') ? '' : 'ok');
    return true;
  }
  function focusField(id) { var el = document.getElementById(id); if (el) { el.focus(); if (el.select && el.type !== 'password') el.select(); } }

  /* ---------- usuário disponível? (consulta enquanto digita) ---------- */
  var uTimer = 0, uSeq = 0, uOk = null, uVal = '', uMsg = '';
  function checkUser(v) {
    clearTimeout(uTimer); uOk = null; if (RULE.username(v)) return;
    setMsg('username', 'Verificando…', 'info'); var my = ++uSeq;
    uTimer = setTimeout(function () {
      fetch('/api/auth/username-check?u=' + encodeURIComponent(v), { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (j) {
        if (my !== uSeq) return;
        uVal = v; uOk = !!j.available; uMsg = j.reason || 'Este usuário já está em uso.';
        if (uOk) setMsg('username', 'Usuário disponível.', 'ok'); else setMsg('username', uMsg, 'err');
      }).catch(function () { if (my === uSeq) { uOk = null; setMsg('username', '', ''); } });
    }, 350);
  }

  /* ---------- força da senha ---------- */
  function strength(v) {
    var s = 0; if (v.length >= 8) s++; if (/[A-Za-z]/.test(v) && /[0-9]/.test(v)) s++; if (v.length >= 12) s++; if (/[^A-Za-z0-9]/.test(v) && /[A-Z]/.test(v)) s++;
    return v ? Math.max(1, s) : 0;
  }
  function pwUpdate() {
    var v = val('password'), box = document.getElementById('pwx'); if (!box) return;
    box.hidden = !v; var s = strength(v);
    box.querySelector('.bars').setAttribute('data-s', s);
    box.querySelector('.pwl').textContent = ['', 'Senha fraca', 'Senha razoável', 'Senha boa', 'Senha forte'][s] || '';
    var r = box.querySelectorAll('.rules span');
    r[0].classList.toggle('y', v.length >= 8); r[1].classList.toggle('y', /[A-Za-z]/.test(v)); r[2].classList.toggle('y', /[0-9]/.test(v));
  }

  /* ---------- montagem do HTML ---------- */
  function fld(o) {
    return '<div class="f' + (o.pw ? ' pw' : '') + '" id="f-' + o.id + '"><label for="' + o.id + '"><span>' + o.label + '</span>' + (o.link || '') + '</label><div class="in"><input id="' + o.id + '" name="' + o.id + '" type="' + (o.type || 'text') + '" autocomplete="' + o.auto + '" placeholder="' + E(o.ph || '') + '" aria-describedby="' + o.id + '-m"' + (o.attrs || '') + '>' +
      (o.pw ? '<button type="button" class="eye" data-eye="' + o.id + '" aria-label="Mostrar senha" aria-pressed="false">' + EYE + '</button>' : '') + '</div><p class="m" id="' + o.id + '-m" aria-live="polite"></p>' + (o.after || '') + '</div>';
  }
  var PWX = '<div class="pwx" id="pwx" hidden><div class="bars" data-s="0"><i></i><i></i><i></i><i></i></div><p class="pwl"></p><div class="rules"><span>8+ caracteres</span><span>Letras</span><span>Números</span></div></div>';
  var CAPS = '<p class="caps" id="caps">Caps Lock está ativado.</p>';
  var REM = '<label class="rm"><input type="checkbox" id="remember"><i></i><span>Lembrar de mim neste dispositivo</span></label>';
  function rem() { var c = document.getElementById('remember'); return !!(c && c.checked); }

  function build() {
    var v = cur, tabs = '', h = '', sub = '', body = '', btn = '', foot = '';
    if (v === 'login' || v === 'register') {
      tabs = '<nav class="au-tabs" aria-label="Acesso"><a href="' + href('/entrar') + '" data-tab="login"' + (v === 'login' ? ' aria-current="page"' : '') + '>Entrar</a><a href="' + href('/cadastro') + '" data-tab="register"' + (v === 'register' ? ' aria-current="page"' : '') + '>Criar conta</a></nav>';
    }
    if (v === 'login') {
      h = 'Bem-vindo de volta'; sub = 'Entre com seu usuário ou email para acessar seus plugins e pedidos.'; btn = 'Entrar';
      body = fld({ id: 'identifier', label: 'Usuário ou email', auto: 'username', ph: 'seu_usuario ou voce@email.com', attrs: ' autocapitalize="none" spellcheck="false" autofocus' }) +
        fld({ id: 'password', label: 'Senha', type: 'password', auto: 'current-password', ph: 'Sua senha', pw: true, link: '<a href="/esqueci-senha">Esqueci minha senha</a>', after: CAPS }) + REM;
      foot = '<span>Novo por aqui? <a href="' + href('/cadastro') + '" data-tab="register">Criar conta</a></span>';
    } else if (v === 'register') {
      h = 'Criar conta'; sub = 'Leva menos de um minuto. Seus plugins ficam salvos na sua conta.'; btn = 'Criar conta';
      body = fld({ id: 'name', label: 'Nome completo', auto: 'name', ph: 'Nome e sobrenome', attrs: ' maxlength="80" autofocus' }) +
        fld({ id: 'username', label: 'Usuário', auto: 'username', ph: 'ex.: carlos_beats', attrs: ' maxlength="20" autocapitalize="none" spellcheck="false"' }) +
        fld({ id: 'email', label: 'Email', type: 'email', auto: 'email', ph: 'voce@email.com', attrs: ' autocapitalize="none" spellcheck="false"' }) +
        fld({ id: 'password', label: 'Nova senha', type: 'password', auto: 'new-password', ph: 'Mínimo 8 caracteres', pw: true, attrs: ' maxlength="100"', after: PWX + CAPS }) + REM;
      foot = '<span>Já tem conta? <a href="' + href('/entrar') + '" data-tab="login">Entrar</a></span>';
    } else if (v === 'forgot') {
      h = 'Recuperar senha'; sub = 'Informe seu email e enviaremos um link para criar uma nova senha.'; btn = 'Enviar link';
      body = fld({ id: 'email', label: 'Email', type: 'email', auto: 'email', ph: 'voce@email.com', attrs: ' autocapitalize="none" spellcheck="false" autofocus' });
      foot = '<a href="' + href('/entrar') + '">Voltar para o login</a>';
    } else {
      h = 'Nova senha'; sub = 'Escolha uma nova senha para a sua conta.'; btn = 'Salvar nova senha';
      body = fld({ id: 'password', label: 'Nova senha', type: 'password', auto: 'new-password', ph: 'Mínimo 8 caracteres', pw: true, attrs: ' maxlength="100" autofocus', after: PWX + CAPS }) +
        fld({ id: 'confirm', label: 'Confirmar nova senha', type: 'password', auto: 'new-password', ph: 'Repita a senha', pw: true });
      foot = '<a href="' + href('/entrar') + '">Voltar para o login</a>';
    }
    var info = '';
    if (v === 'login' || v === 'register') {
      if (reason === 'wall') info = '<div class="au-banner info" role="status">Entre ou crie uma conta para ver os plugins e fazer suas compras.</div>';
      else if (reason === 'cart') info = '<div class="au-banner info" role="status">Entre ou crie uma conta para adicionar plugins ao carrinho. O item que você escolheu será adicionado automaticamente.</div>';
    }
    return '<div class="au-box"><div class="au-top"><a class="au-mlogo" href="/" aria-label="Line Collection">' + logo('m') + '<b><span>LINE</span>COLLECTION</b></a><a href="/">' + BACK + 'Voltar ao site</a></div>' +
      '<header class="au-h"><h1>' + h + '</h1><p>' + sub + '</p></header>' + tabs + info +
      '<form id="f" novalidate><div id="m" class="au-banner" role="alert"></div>' + body + '<button class="au-btn" type="submit"><span>' + btn + '</span></button></form>' +
      '<div class="au-foot">' + foot + '</div></div>';
  }

  function render() {
    uOk = null; uVal = ''; document.title = { login: 'Entrar', register: 'Criar conta', forgot: 'Recuperar senha', reset: 'Nova senha' }[cur] + ' — Line Collection';
    app.innerHTML = build();
    var f = document.getElementById('f');
    if (cur === 'reset' && !qs.get('token')) banner('Link inválido ou incompleto. Peça um novo em "Esqueci minha senha".', 'err');
    f.addEventListener('submit', submit);
    FIELDS[cur].forEach(function (id) {
      var el = document.getElementById(id); if (!el) return; var touched = false;
      el.addEventListener('blur', function () { touched = true; if (id !== 'password' || cur !== 'login') validate(id); });
      el.addEventListener('input', function () {
        if (id === 'username') { var p = el.selectionStart, n = el.value.toLowerCase().replace(/\s+/g, ''); if (n !== el.value) { el.value = n; try { el.setSelectionRange(p, p); } catch (e) {} } }
        if (id === 'password' && cur !== 'login') { pwUpdate(); if (document.getElementById('confirm') && val('confirm')) validate('confirm'); }
        banner('');
        if (id === 'username') { setMsg('username', '', ''); if (touched || el.value.length >= 3) { if (!RULE.username(el.value)) checkUser(el.value); else if (touched) validate(id); } return; }
        if (touched || el.getAttribute('aria-invalid')) validate(id);
      });
      if (el.type === 'password') {
        el.addEventListener('keyup', function (e) { var c = document.getElementById('caps'); if (c && e.getModifierState) c.classList.toggle('on', e.getModifierState('CapsLock')); });
        el.addEventListener('blur', function () { var c = document.getElementById('caps'); if (c) c.classList.remove('on'); });
      }
    });
    app.querySelectorAll('[data-eye]').forEach(function (b) {
      b.addEventListener('click', function () {
        var el = document.getElementById(b.getAttribute('data-eye')), show = el.type === 'password';
        el.type = show ? 'text' : 'password'; b.setAttribute('aria-pressed', show ? 'true' : 'false'); b.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha'); el.focus();
      });
    });
    app.querySelectorAll('[data-tab]').forEach(function (a) {   // troca entre Entrar / Criar conta sem recarregar
      a.addEventListener('click', function (e) {
        e.preventDefault(); var t = a.getAttribute('data-tab'); if (t === cur) return;
        cur = t; history.pushState({}, '', a.getAttribute('href')); render();
      });
    });
    var first = f.querySelector('input'); if (first && window.innerWidth > 900) first.focus();
  }
  window.addEventListener('popstate', function () { cur = PATHS[location.pathname] || 'login'; qs = new URLSearchParams(location.search); reason = qs.get('reason'); render(); });

  /* ---------- envio ---------- */
  function post(url, body) {
    return LC.me().then(function (m) {
      var h = { 'Content-Type': 'application/json', Accept: 'application/json' }; if (m.csrf) h['X-CSRF-Token'] = m.csrf;
      return fetch(url, { method: 'POST', credentials: 'same-origin', headers: h, body: JSON.stringify(body) });
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, status: r.status, json: j }; }); });
  }
  function busy(on) {
    var b = document.querySelector('.au-btn'); if (!b) return; b.disabled = on; b.classList.toggle('load', on);
  }
  function done(icon, title, text, linkHref, linkText) {
    app.innerHTML = '<div class="au-box"><div class="au-done"><div class="ic">' + icon + '</div><h1>' + E(title) + '</h1><p>' + E(text) + '</p>' + (linkHref ? '<a class="au-btn" href="' + linkHref + '"><span>' + E(linkText) + '</span></a>' : '') + '</div></div>';
  }
  function submit(e) {
    e.preventDefault(); banner('');
    var bad = null; FIELDS[cur].forEach(function (id) { if (!validate(id) && !bad) bad = id; });
    if (bad) { focusField(bad); return; }
    var body;
    if (cur === 'login') body = { identifier: val('identifier').trim(), password: val('password'), remember: rem() };
    else if (cur === 'register') body = { name: val('name').trim(), username: val('username'), email: val('email').trim().toLowerCase(), password: val('password'), remember: rem() };
    else if (cur === 'forgot') body = { email: val('email').trim().toLowerCase() };
    else body = { token: qs.get('token') || '', password: val('password'), confirm: val('confirm') };
    busy(true);
    post(URLS[cur], body).then(function (r) {
      if (r.ok) {
        if (cur === 'login' || cur === 'register') {
          var u = r.json.user || {}, dest = (u.role === 'admin' && next === '/conta') ? '/admin' : next;
          var b = document.querySelector('.au-btn span'); if (b) b.textContent = cur === 'login' ? 'Entrando…' : 'Conta criada!';
          location.assign(dest); return;
        }
        if (cur === 'forgot') { done(CHECK, 'Verifique seu email', r.json.message || 'Se o email estiver cadastrado, enviaremos um link para redefinir a senha.', href('/entrar'), 'Voltar para o login'); return; }
        done(CHECK, 'Senha atualizada', r.json.message || 'Faça login com a nova senha.', href('/entrar'), 'Ir para o login'); setTimeout(function () { location.href = href('/entrar'); }, 2500); return;
      }
      busy(false);
      var j = r.json || {}, msg = j.error || (r.status === 429 ? 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' : 'Algo deu errado. Tente novamente.');
      if (j.field && document.getElementById(j.field)) {
        setMsg(j.field, msg, 'err'); focusField(j.field);
        if (j.field === 'username') { uOk = false; uVal = val('username'); uMsg = msg; }
      } else banner(msg, 'err');
    }).catch(function () { busy(false); banner('Não foi possível conectar ao servidor. Verifique sua internet e tente de novo.', 'err'); });
  }

  /* ---------- painel de marca (ondas de sinal, só decorativo) ---------- */
  function art() {
    var mark = document.getElementById('artLogo'); if (mark) mark.innerHTML = logo('a');
    var cv = document.getElementById('art'); if (!cv || !cv.getContext) return;
    var ctx = cv.getContext('2d'), W = 0, H = 0, dpr = 1, t0 = performance.now();
    function size() { dpr = Math.min(window.devicePixelRatio || 1, 2); var r = cv.getBoundingClientRect(); W = r.width; H = r.height; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); draw(performance.now()); }
    function draw(now) {
      if (!W || !H) return;
      var t = reduced ? 3 : (now - t0) / 1000; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      var N = 9;
      for (var i = 0; i < N; i++) {
        var k = i / (N - 1), y0 = H * (0.3 + 0.5 * k), a = H * 0.05 * (0.5 + k);
        ctx.beginPath();
        for (var x = 0; x <= W; x += 6) {
          var u = x / W, env = Math.exp(-Math.pow((u - 0.55) / 0.3, 2)) + 0.12;
          var y = y0 - a * env * (Math.sin(u * 9 + t * 0.9 + i * 0.8) + 0.5 * Math.sin(u * 23 - t * 1.3 + i * 1.7) + 0.3 * Math.sin(u * 51 + t * 2 + i));
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.lineWidth = i === N - 1 ? 1.8 : 1; ctx.strokeStyle = i === N - 1 ? 'rgba(51,230,255,.85)' : 'rgba(214,232,246,' + (0.07 + 0.3 * k).toFixed(2) + ')';
        if (i === N - 1) { ctx.shadowColor = 'rgba(51,230,255,.8)'; ctx.shadowBlur = 12; } ctx.stroke(); ctx.shadowBlur = 0;
      }
    }
    size(); if (reduced) { addEventListener('resize', size); return; }
    if ('ResizeObserver' in window) new ResizeObserver(size).observe(cv); else addEventListener('resize', size);
    (function loop(now) { if (cv.offsetParent !== null && !document.hidden) draw(now); requestAnimationFrame(loop); })(performance.now());
  }

  art();
  LC.me().then(function (m) {
    if (m.user && cur !== 'reset') { location.replace(next); return; }   // já está logado
    render();
  }).catch(function () { render(); });
})();