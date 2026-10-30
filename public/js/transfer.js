/* Página de pagamento por PIX / transferência: instruções, envio do comprovante e acompanhamento da aprovação. */
(function () {
  'use strict';
  var app = document.getElementById('app'), E = LC.esc, num = new URLSearchParams(location.search).get('pedido'), D = null, file = null, timer = 0, prevUrl = null;
  var P = function (d) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + d + '</svg>'; };
  var UP = P('<path d="M12 16V5M7 9l5-5 5 5M5 20h14"/>'), OK = P('<path d="M5 12.5l4.5 4.5L19 7.5"/>');
  var OKTYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'], MAX = 6 * 1024 * 1024;
  var PIXT = { cpf: 'CPF', cnpj: 'CNPJ', email: 'E-mail', phone: 'Telefone', random: 'Chave aleatória' };

  function copy(text, label) {
    function ok() { LC.toast((label || 'Texto') + ' copiado.'); }
    if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(text).then(ok, fallback); } else fallback();
    function fallback() { var t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); ok(); } catch (e) { LC.toast('Não foi possível copiar. Selecione e copie manualmente.', true); } t.remove(); }
  }
  var kv = function (k, v, cp) { return v ? '<div class="kv"><span>' + k + '</span><div style="display:flex;align-items:center;min-width:0"><b>' + E(v) + '</b>' + (cp ? '<button type="button" data-copy="' + E(v) + '" data-lb="' + E(k) + '">Copiar</button>' : '') + '</div></div>' : ''; };

  function steps(s) {   // s: 0 pagar, 1 enviar comprovante/análise, 2 pago
    var L = ['Pague com PIX ou transferência', 'Envie o comprovante', 'Aprovação e liberação'];
    return '<div class="steps">' + L.map(function (t, i) { var c = i < s ? 'd' : i === s ? 'c' : ''; return '<div class="step ' + c + '"><i>' + (i < s ? '✓' : i + 1) + '</i>' + t + '</div>'; }).join('') + '</div>';
  }
  function summary(d) {
    var o = d.order;
    return '<div class="card"><h2>Resumo do pedido</h2>' + kv('Pedido', o.number, true) +
      o.items.map(function (i) { return '<div class="kv"><b style="font-weight:500;text-align:left">' + E(i.product_name) + '</b><b>' + LC.brl(i.unit_price_cents) + '</b></div>'; }).join('') +
      '<div class="total"><span class="muted">Total a pagar</span><b>' + LC.brl(o.total_cents) + '</b></div><p class="small muted">Pague exatamente este valor. O pedido é liberado depois que o comprovante é aprovado.</p></div>';
  }
  function methods(d) {
    var h = '', p = d.pay;
    if (d.pix) {
      h += '<div class="card"><h2>Pagar com PIX <span class="pill pending" style="font-size:11px">Recomendado</span></h2><div class="pix"><div class="qr' + (d.pix.qr ? '' : ' no') + '">' + (d.pix.qr || 'QR Code indisponível.<br>Use o código ao lado.') + '</div><div><b style="font-size:15px">Escaneie o QR Code ou use o PIX Copia e Cola</b><p class="small muted" style="margin-top:4px">Abra o app do seu banco → PIX → Pagar com QR Code / Copia e Cola. O valor já vai preenchido.</p>' +
        '<div class="cc"><code title="Código PIX">' + E(d.pix.payload) + '</code><button class="b sm" data-copy="' + E(d.pix.payload) + '" data-lb="Código PIX">Copiar</button></div></div></div>' +
        '<div style="margin-top:14px">' + kv('Titular', p.holder) + kv('Chave PIX (' + (PIXT[d.pix.type] || 'chave') + ')', d.pix.key, true) + kv('Valor', LC.brl(d.order.total_cents)) + '</div></div>';
    }
    if (p.account) {
      h += '<div class="card"><h2>Transferência bancária</h2>' + kv('Banco', p.bank, true) + kv('Agência', p.agency, true) + kv('Conta', p.account, true) + kv('Titular', p.holder, true) + kv('CPF / CNPJ', p.doc, true) + kv('Valor', LC.brl(d.order.total_cents)) + '</div>';
    }
    if (p.note) h += '<div class="alert info"><div class="t"><b>Instruções do vendedor</b><span style="white-space:pre-wrap">' + E(p.note) + '</span></div></div>';
    h += '<div class="alert warn"><div class="t"><b>Dica</b><span>Se o seu banco permitir, escreva o número do pedido <b>' + E(d.order.number) + '</b> na descrição do pagamento.</span></div></div>';
    return h;
  }
  function uploadCard(d, latest) {
    var rej = latest && latest.status === 'rejected';
    return '<div class="card" id="upc"><h2>2. Enviar comprovante</h2>' + (rej ? '<div class="msg err"><b>Comprovante recusado.</b><br>' + E(latest.reject_reason || '') + '<br>Envie um novo comprovante.</div>' : '') +
      '<div id="dz" class="dz"><input id="fi" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" aria-label="Escolher comprovante"><span class="ic">' + UP + '</span><b>Arraste o comprovante aqui</b><small>ou clique para escolher · JPG, PNG, WEBP ou PDF · até 6 MB</small><small>Dica: você também pode colar a imagem (Ctrl+V)</small></div>' +
      '<div id="pvw" hidden></div><div class="fl" style="margin-top:14px" id="nbox" hidden><label for="note">Observação (opcional)</label><input id="note" maxlength="300" placeholder="Ex.: pago no PIX às 14h"></div>' +
      '<div class="prog" id="prog" hidden><i></i></div><div id="um"></div><button class="b block lg" id="send" disabled style="margin-top:14px">Enviar comprovante</button></div>';
  }
  function proofCard(p) {
    var isPdf = p.mime === 'application/pdf';
    return '<div class="card"><h2>Comprovante enviado <span class="pill review">Em análise</span></h2><div class="pv">' + (isPdf ? '<span class="fi">PDF</span>' : '<img class="lb" src="/api/pay/proofs/' + p.id + '/file" alt="Comprovante enviado" data-open="' + p.id + '">') +
      '<div><b>Enviado ' + LC.dt(p.created_at) + '</b><small>' + LC.size(p.size) + (p.note ? ' · ' + E(p.note) : '') + '</small></div><a class="b ghost sm" href="/api/pay/proofs/' + p.id + '/file" target="_blank" rel="noopener">Abrir</a></div>' +
      '<p class="small muted" style="margin-top:14px">Recebemos o seu comprovante. Assim que o vendedor confirmar o pagamento, os plugins entram automaticamente na sua conta e você recebe uma notificação. Esta página atualiza sozinha.</p>' +
      '<button class="b ghost sm" id="repl" style="margin-top:12px">Enviei o arquivo errado — substituir</button></div>';
  }

  function render() {
    var d = D, o = d.order, latest = d.proofs[0] || null, st = o.status;
    document.title = 'Pedido ' + o.number + ' — Line Collection';
    if (st === 'paid') {
      app.innerHTML = steps(3) + '<div class="card"><div class="done"><div class="ok">' + OK + '</div><h2>Pagamento aprovado!</h2><p>O pedido <b>' + E(o.number) + '</b> foi confirmado. Seus plugins já estão na sua conta, prontos para baixar.</p><a class="b lg" href="/conta/plugins">Ir para Meus plugins</a></div></div>';
      stopPoll(); return;
    }
    if (st !== 'pending') {
      app.innerHTML = '<div class="card"><div class="done"><h2>Pedido ' + E(LC.STATUS[st] || st).toLowerCase() + '</h2><p>O pedido <b>' + E(o.number) + '</b> não está mais aguardando pagamento.</p><a class="b" href="/conta/pedidos">Ver meus pedidos</a></div></div>'; stopPoll(); return;
    }
    if (!d.configured) {
      app.innerHTML = steps(0) + '<div class="alert warn"><div class="t"><b>Dados de pagamento ainda não configurados</b><span>' + (d.isAdmin ? 'Você é administrador: cadastre a chave PIX / conta em Admin → Pagamentos → “Dados para pagamento”.' : 'O vendedor ainda não cadastrou os dados de pagamento. Seu pedido está salvo — volte em instantes ou entre em contato.') + '</span></div>' + (d.isAdmin ? '<a class="b sm" href="/admin/pagamentos">Abrir configurações</a>' : '') + '</div>' + summary(d);
      return;
    }
    var waiting = latest && latest.status === 'pending';
    app.innerHTML = steps(waiting ? 1 : 0) + '<div class="ph"><div><h1>Pagamento do pedido</h1><p>Siga os passos abaixo. Leva menos de 2 minutos.</p></div><a class="b danger sm" id="cx" href="#">Cancelar pedido</a></div><div class="pgrid"><div>' + methods(d) + '</div><div>' + summary(d) + (waiting ? proofCard(latest) : uploadCard(d, latest)) + '</div></div>';
    wire(); if (waiting) startPoll(); else stopPoll();
  }

  function wire() {
    app.querySelectorAll('[data-copy]').forEach(function (b) { b.onclick = function () { copy(b.dataset.copy, b.dataset.lb); }; });
    var cx = document.getElementById('cx'); if (cx) cx.onclick = function (e) {
      e.preventDefault(); LC.modal('<h2>Cancelar pedido?</h2><p>O pedido ' + E(num) + ' será cancelado. Se você já pagou, não cancele: envie o comprovante.</p><div class="row"><button class="b ghost sm" data-close>Voltar</button><button class="b danger sm" id="yes">Cancelar pedido</button></div>', function (bg, close) {
        bg.querySelector('#yes').onclick = function () { LC.api('POST', '/api/orders/' + encodeURIComponent(num) + '/cancel').then(function () { close(); location.href = '/conta/pedidos'; }).catch(function (er) { LC.toast(er.message, true); }); };
      });
    };
    app.querySelectorAll('[data-open]').forEach(function (i) { i.onclick = function () { window.open('/api/pay/proofs/' + i.dataset.open + '/file', '_blank', 'noopener'); }; });
    var repl = document.getElementById('repl'); if (repl) repl.onclick = function () { stopPoll(); D.proofs = D.proofs.filter(function (p) { return p.status !== 'pending'; }); renderUploadOnly(); };
    var dz = document.getElementById('dz'); if (!dz) return;
    var fi = document.getElementById('fi');
    fi.onchange = function () { pick(fi.files[0]); };
    ['dragenter', 'dragover'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('over'); }); });
    dz.addEventListener('drop', function (e) { if (e.dataTransfer.files[0]) pick(e.dataTransfer.files[0]); });
    document.getElementById('send').onclick = send;
  }
  function renderUploadOnly() { render(); }
  document.addEventListener('paste', function (e) { if (!document.getElementById('dz')) return; var it = Array.prototype.filter.call(e.clipboardData.items || [], function (i) { return i.kind === 'file'; })[0]; if (it) pick(it.getAsFile()); });

  function pick(f) {
    var m = document.getElementById('um'); m.innerHTML = '';
    if (!f) return;
    if (OKTYPES.indexOf(f.type) < 0) { m.innerHTML = '<div class="msg err" style="margin-top:12px">Formato inválido. Envie JPG, PNG, WEBP ou PDF.</div>'; return; }
    if (f.size > MAX) { m.innerHTML = '<div class="msg err" style="margin-top:12px">Arquivo grande demais (máximo 6 MB).</div>'; return; }
    file = f; if (prevUrl) URL.revokeObjectURL(prevUrl);
    var pv = document.getElementById('pvw'), isPdf = f.type === 'application/pdf'; if (!isPdf) prevUrl = URL.createObjectURL(f);
    pv.hidden = false; pv.className = 'pv'; pv.style.marginTop = '14px';
    pv.innerHTML = (isPdf ? '<span class="fi">PDF</span>' : '<img src="' + prevUrl + '" alt="Pré-visualização">') + '<div><b>' + E(f.name) + '</b><small>' + LC.size(f.size) + '</small></div><button type="button" id="rm" aria-label="Remover arquivo">×</button>';
    document.getElementById('rm').onclick = function () { file = null; pv.hidden = true; document.getElementById('dz').hidden = false; document.getElementById('nbox').hidden = true; document.getElementById('send').disabled = true; document.getElementById('fi').value = ''; };
    document.getElementById('dz').hidden = true; document.getElementById('nbox').hidden = false; document.getElementById('send').disabled = false;
  }
  function send() {
    if (!file) return; var b = document.getElementById('send'), prog = document.getElementById('prog'), m = document.getElementById('um');
    b.disabled = true; b.textContent = 'Enviando…'; prog.hidden = false; m.innerHTML = '';
    var fd = new FormData(); fd.append('file', file); fd.append('note', document.getElementById('note').value);
    LC.me().then(function (me) {
      var x = new XMLHttpRequest(); x.open('POST', '/api/pay/orders/' + encodeURIComponent(num) + '/proof'); x.setRequestHeader('X-CSRF-Token', me.csrf || ''); x.setRequestHeader('Accept', 'application/json');
      x.upload.onprogress = function (e) { if (e.lengthComputable) prog.firstChild.style.width = Math.round(e.loaded / e.total * 100) + '%'; };
      x.onload = function () {
        var j = {}; try { j = JSON.parse(x.responseText); } catch (e) {}
        if (x.status >= 200 && x.status < 300) { LC.toast('Comprovante enviado! Aguarde a aprovação.'); file = null; load(); }
        else { prog.hidden = true; b.disabled = false; b.textContent = 'Enviar comprovante'; m.innerHTML = '<div class="msg err" style="margin-top:12px">' + E(j.error || 'Não foi possível enviar. Tente novamente.') + '</div>'; }
      };
      x.onerror = function () { prog.hidden = true; b.disabled = false; b.textContent = 'Enviar comprovante'; m.innerHTML = '<div class="msg err" style="margin-top:12px">Falha de conexão. Verifique a internet e tente de novo.</div>'; };
      x.send(fd);
    });
  }

  function startPoll() { if (timer) return; timer = setInterval(function () { if (!document.hidden) load(true); }, 8000); }
  function stopPoll() { clearInterval(timer); timer = 0; }
  function load(silent) {
    return LC.api('GET', '/api/pay/orders/' + encodeURIComponent(num)).then(function (d) {
      var changed = !D || D.order.status !== d.order.status || JSON.stringify(D.proofs) !== JSON.stringify(d.proofs); D = d;
      if (!silent || changed) render();
    }).catch(function (e) { if (!silent) app.innerHTML = '<div class="empty"><b>Pedido não encontrado.</b><br>' + E(e.message) + '<br><a class="b" href="/conta/pedidos">Ver meus pedidos</a></div>'; });
  }

  if (!num) { app.innerHTML = '<div class="empty"><b>Nenhum pedido informado.</b><br><a class="b" href="/conta/pedidos">Ver meus pedidos</a></div>'; return; }
  LC.me().then(function (m) { if (!m.user) { location.href = '/entrar?next=' + encodeURIComponent(location.pathname + location.search); return; } return load(); });
})();