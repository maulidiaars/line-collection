#!/usr/bin/env python3
"""Gera dist/ (página 'Em breve' pública + site completo em /previa/) a partir de
/workspace/Line-Site-Preview (código) e Line-Site-Preview.bak-oceano-20261018 (imagens/vídeos v1)."""
import os, re, shutil, hashlib, subprocess
from PIL import Image
D = '/workspace/line-site-deploy'; SRC = '/workspace/Line-Site-Preview'; V1 = '/workspace/Line-Site-Preview.bak-oceano-20261018'
OUT = f'{D}/dist'; P = f'{OUT}/previa'
shutil.rmtree(OUT, ignore_errors=True); os.makedirs(P)
def rd(p): return open(p, encoding='utf-8').read()
def wr(p, s): os.makedirs(os.path.dirname(p), exist_ok=True); open(p, 'w', encoding='utf-8').write(s)
def sub1(s, a, b, n=1):
    assert s.count(a) >= 1, f'nao achei: {a[:80]}'
    return s.replace(a, b) if n == 0 else s.replace(a, b, n)

# ---------- arquivos do site completo ----------
for d in ['css', 'js', 'vendor', 'audio']: shutil.copytree(f'{SRC}/{d}', f'{P}/{d}')
shutil.copytree(f'{V1}/assets', f'{P}/assets')           # capturas v1 (visual original)
shutil.copytree(f'{V1}/videos', f'{P}/videos')           # vídeos v1
shutil.copy(f'{V1}/js/textures.js', f'{P}/js/textures.js')  # texturas do hero v1
import base64, io, json
_t = rd(f'{P}/js/textures.js')
# v7: TODAS as texturas do hero = capturas Vidro (assets-vidro/); chave "delayline" = imagem do PingLine
for key, fn in [('synthline', 'synthline.webp'), ('delayline', 'pingline.webp'), ('compline', 'compline.webp'), ('limitline', 'limitline.webp'),
                ('harmoline', 'harmoline.webp'), ('driveline', 'driveline.webp'), ('autoline-full', 'autoline-full.webp'),
                ('reverbline', 'reverbline.webp'), ('eqline', 'eqline.webp')]:
    buf = io.BytesIO(); Image.open(f'{D}/assets-vidro/{fn}').convert('RGB').save(buf, 'WEBP', quality=80, method=6)
    _t, n = re.subn(r'"%s": "data:image/webp;base64,[^"]+"' % key, lambda m_: '"%s": "data:image/webp;base64,%s"' % (key, base64.b64encode(buf.getvalue()).decode()), _t)
    assert n == 1, key
wr(f'{P}/js/textures.js', _t)
# DelayLine -> PingLine nos nomes de arquivo
for a, b in [('assets/img/delayline.webp', 'assets/img/pingline.webp'), ('assets/img/delayline-alt.webp', 'assets/img/pingline-alt.webp'),
             ('audio/DelayLine-dry.mp3', 'audio/PingLine-dry.mp3'), ('audio/DelayLine-wet.mp3', 'audio/PingLine-wet.mp3')]:
    os.rename(f'{P}/{a}', f'{P}/{b}')
os.remove(f'{P}/videos/delayline.mp4')   # vídeo mostra o título "DELAYLINE" -> removido (fica só a animação)
# imagens corrigidas (assets-fix/): PingLine = render real do editor PingLine v1 (título PINGLINE);
# EqLine = 'Padrão' sem mojibake; vídeo EqLine sem os 9 quadros iniciais com 'PadrÃ£o'; SilentLine = render real do editor v1.3
FIX = f'{D}/assets-fix'
for f in ['pingline.webp', 'pingline-alt.webp', 'pingline@2x.webp', 'pingline-alt@2x.webp', 'eqline.webp',
          'silentline.webp', 'silentline-alt.webp', 'silentline@2x.webp', 'silentline-alt@2x.webp']:
    shutil.copy(f'{FIX}/{f}', f'{P}/assets/img/{f}')
shutil.copy(f'{FIX}/eqline.mp4', f'{P}/videos/eqline.mp4')

# v7: visual Vidro moderno em todos os plugins = capturas renderizadas do código real dos editores Vidro
# (assets-vidro/, inclui @2x); SilentLine = render real do editor v2.0 (v8). Sobrescreve v1 e assets-fix.
import glob as _g
_vid = sorted(_g.glob(f'{D}/assets-vidro/*.webp')); assert len(_vid) == 38, len(_vid)
for f in _vid: shutil.copy(f, f'{P}/assets/img/{os.path.basename(f)}')
SIZES = {os.path.basename(f)[:-5]: Image.open(f).size[0] for f in __import__('glob').glob(f'{P}/assets/img/*.webp')}

# ---------- index.html ----------
h = rd(f'{SRC}/index.html')
h = sub1(h, '<title>Line Collection — Plugins by Carlos Chicano (prévia)</title>\n<meta name="robots" content="noindex">',
 '<title>Line Collection — Plugins by Carlos Chicano (prévia privada)</title>\n<meta name="robots" content="noindex, nofollow, noarchive, nosnippet, noimageindex">\n<meta name="googlebot" content="noindex, nofollow">\n<meta name="theme-color" content="#0A0D14">\n<link rel="icon" href="/favicon.svg" type="image/svg+xml">\n<link rel="preload" href="/fonts/inter-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>')
h = sub1(h, '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">', '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">')
h = sub1(h, 'css/style.css?v=6', 'css/style.css?v=7')
h = sub1(h, 'PRÉVIA LOCAL · não publicada · preços ilustrativos', 'PRÉVIA PRIVADA · só você vê esta página')
LOGO = rd(f'{D}/logo.svg').strip().replace('id="lcg"', 'id="lcg{n}"').replace('url(#lcg)', 'url(#lcg{n})').replace('id="lck"', 'id="lck{n}"').replace('url(#lck)', 'url(#lck{n})')
h = sub1(h, '<a class="logo" href="#top"><span>LINE</span>COLLECTION</a>', '<a class="logo" href="#top">' + LOGO.format(n=1) + '<b><span>LINE</span>COLLECTION</b></a>')
h = sub1(h, '<footer><div class="logo"><span>LINE</span>COLLECTION</div>', '<footer><div class="logo">' + LOGO.format(n=2) + '<b><span>LINE</span>COLLECTION</b></div>')
h = sub1(h, '<a class="btn sm" href="#precos">Comprar</a>', '<a class="btn sm" href="#precos">Ver preços</a>')
h = sub1(h, '10 plugins com o novo visual Vidro moderno para gravar, mixar, masterizar e compor — da afinação da voz ao sintetizador.</p>',
 '10 plugins para gravar, mixar, masterizar e compor — da voz limpa e afinada ao sintetizador.</p>')
h = sub1(h, '<p class="by">by Carlos Chicano</p>', '<p class="by">by Carlos Chicano</p>\n    <p class="teaser">✦ <b>Atualização 2.0 gratuita</b> a caminho para quem comprar</p>')
# PingLine
h = sub1(h, '<a href="#delayline" class="mini tilt" style="--ac:#FFC93D"><img src="assets/img/delayline.webp" alt="DELAYLINE"><h4>DELAY<b>LINE</b></h4><p>Delay</p></a>',
 '<a href="#pingline" class="mini tilt" style="--ac:#FFC93D"><img src="assets/img/pingline.webp" alt="PINGLINE"><h4>PING<b>LINE</b></h4><p>Delay</p></a>')
h = sub1(h, '<span>DelayLine</span>', '<span>PingLine</span>')
h = sub1(h, '<section class="plug" id="delayline"', '<section class="plug" id="pingline"')
h = sub1(h, 'src="assets/img/delayline.webp" alt="Interface do DELAYLINE"', 'src="assets/img/pingline.webp" alt="Interface do PINGLINE"')
h = sub1(h, 'src="assets/img/delayline-alt.webp"', 'src="assets/img/pingline-alt.webp"')
h = sub1(h, '<h3>DELAY<span>LINE</span></h3>', '<h3>PING<span>LINE</span></h3>')
h = sub1(h, '''<canvas data-demo="delayline" aria-label="Animação ilustrativa"></canvas>
      <video src="videos/delayline.mp4" poster="assets/img/delayline.webp" muted loop playsinline preload="none" aria-label="Vídeo ilustrativo"></video>
      <figcaption>Animação e vídeo ilustrativos — não representam o áudio real.</figcaption>''',
 '''<canvas data-demo="delayline" aria-label="Animação ilustrativa"></canvas>
      <figcaption>Animação ilustrativa — vídeo demo em breve. Não representa o áudio real.</figcaption>''')
# SilentLine (novo, no lugar do ProgLine): card no grid + seção logo depois do HarmoLine
SL_MINI = '<a href="#silentline" class="mini tilt" style="--ac:#33E6FF"><img src="assets/img/silentline.webp" alt="SILENTLINE"><h4>SILENT<b>LINE</b></h4><p>Redutor de ruído vocal</p></a>'
m = re.search(r'<a href="#harmoline" class="mini tilt".*?</a>', h, re.S); assert m
h = h[:m.end()] + SL_MINI + h[m.end():]
SL_SEC = '''<section class="plug" id="silentline" style="--ac:#33E6FF">
  <div class="stage"><div class="card3d tilt deep">
    <img class="main" src="assets/img/silentline.webp" alt="Interface do SILENTLINE">
    <img class="ghost" src="assets/img/silentline-alt.webp" alt=""><div class="shine"></div></div></div>
  <div class="copy"><p class="cat">Redutor de ruído vocal com IA</p><h3>SILENT<span>LINE</span></h3>
    <p class="pitch">Tira chiado, ventilador, ar-condicionado e barulho de sala da sua voz sem abafar. A IA (DeepFilterNet 3) roda no seu próprio computador, com um modo de latência mínima para cantar ao vivo e qualidade máxima para mixar.</p><ul><li>3 motores: IA RÁPIDA (~5 ms, ao vivo), IA completa (~23 ms) e CLÁSSICO manual (5,3 ms)</li><li>Botão QUALIDADE MÁX para a mixagem e latência mostrada em ms</li><li>Brilho e Preservar Ar: voz limpa e presente, nunca abafada</li><li>Proteger Efeitos preserva as caudas de reverb e delay</li><li>Redução, Mix, Gate, Output, Auto Gain, Aprender Ruído e limitador de segurança em −0,3 dBFS</li></ul>
    <figure class="demo"><canvas data-demo="silentline" aria-label="Animação ilustrativa"></canvas>
      <figcaption>Animação ilustrativa — demo de áudio em breve. Não representa o áudio real.</figcaption></figure></div></section>
'''
i = h.index('<section class="plug" id="harmoline"'); j = h.index('</section>', i) + len('</section>')
h = h[:j] + '\n' + SL_SEC + h[j:]
h = sub1(h, '<span>Voz</span>→<span>AutoLine</span>', '<span>Voz</span>→<span>SilentLine</span>→<span>AutoLine</span>')
# nitidez: srcset/sizes, dimensões e decodificação
def img_attrs(m):
    tag, name = m.group(0), m.group(2)
    w = SIZES.get(name); extra = ''
    if f'{name}@2x' in SIZES: extra += f' srcset="assets/img/{name}.webp {w}w, assets/img/{name}@2x.webp {SIZES[name+"@2x"]}w"'
    im = Image.open(f'{P}/assets/img/{name}.webp'); extra += f' width="{im.size[0]}" height="{im.size[1]}" decoding="async"'
    if 'class="main"' in tag: extra += ' sizes="(max-width:900px) 92vw, min(1120px, 52vw)"'
    elif 'class="ghost"' in tag: extra += ' sizes="(max-width:900px) 0px, 33vw"'
    else: extra += ' sizes="(max-width:600px) 90vw, 300px" loading="lazy"'
    return tag[:-1] + extra + '>'
h = re.sub(r'<img ([^>]*?)src="assets/img/([a-z\-]+)\.webp"[^>]*>', img_attrs, h)
# compra por plugin
KEY = {'synthline': 'synthkeyline'}
def buy_row(m):
    sec_id = m.group(1); key = KEY.get(sec_id, sec_id)
    return m.group(0)
parts = re.split(r'(<section class="plug" id="[a-z]+")', h)
out = parts[0]
for i in range(1, len(parts), 2):
    sid = re.search(r'id="([a-z]+)"', parts[i]).group(1); key = KEY.get(sid, sid); body = parts[i+1]
    row = (f'<div class="buy-row"><span class="p"><s data-preco="avulso">R$ 99</s><span data-preco="avulsoLancamento">R$ 69</span></span>'
           f'<a class="btn sm" data-buy="{key}" href="#">Comprar</a><span class="soon">em breve</span></div>\n    <figure class="demo">')
    body = body.replace('<figure class="demo">', row, 1)
    out += parts[i] + body
h = out
# preços
pr_old = re.search(r'<section id="precos" class="pricing">.*?</section>', h, re.S).group(0)
pr_new = '''<section id="precos" class="pricing">
  <h2 class="reveal">Escolha seu jeito <span>de começar</span></h2>
  <p class="reveal sub">Preço especial de lançamento nos primeiros 7 dias. Depois, valor normal.</p>
  <div class="price-grid four">
    <div class="price tilt"><h3>Plugin avulso</h3><p class="was">de <s>R$ 99</s></p><p class="val">R$ 69</p><p class="launch">lançamento · 7 dias</p><p class="after">depois R$ 99 por plugin</p><ul><li>1 plugin à escolha</li><li>Chave de ativação pessoal</li><li>VST3 para Windows</li><li>Atualização 2.0 gratuita</li></ul><a class="btn ghost" data-buy="avulso" href="#">Comprar</a><span class="soon">em breve</span></div>
    <div class="price tilt"><h3>Pacote Voz</h3><p class="was">de <s>R$ 149</s></p><p class="val">R$ 119</p><p class="launch">lançamento · 7 dias</p><p class="after">depois R$ 149 · avulsos somariam R$ 297</p><ul><li>3 plugins para voz</li><li>AutoLine (afinação vocal)</li><li>HarmoLine (harmonias)</li><li>SilentLine (redução de ruído)</li><li>Atualização 2.0 gratuita</li></ul><a class="btn ghost" data-buy="pacoteVoz" href="#">Comprar</a><span class="soon">em breve</span></div>
    <div class="price tilt"><h3>Pacote Mix &amp; Master</h3><p class="was">de <s>R$ 299</s></p><p class="val">R$ 219</p><p class="launch">lançamento · 7 dias</p><p class="after">depois R$ 299 · avulsos somariam R$ 594</p><ul><li>6 plugins de mixagem e master</li><li>EqLine, CompLine, DriveLine</li><li>PingLine, ReverbLine, LimitLine</li><li>Atualização 2.0 gratuita</li></ul><a class="btn ghost" data-buy="pacoteMix" href="#">Comprar</a><span class="soon">em breve</span></div>
    <div class="price tilt hot"><span class="tag">MELHOR CUSTO-BENEFÍCIO</span><h3>Pacote Completo</h3><p class="was">de <s>R$ 499</s></p><p class="val">R$ 349</p><p class="launch">lançamento · 7 dias</p><p class="after">depois R$ 499 · avulsos somariam R$ 990</p><ul><li>Todos os 10 plugins</li><li>AutoLine, HarmoLine, SilentLine, EqLine, CompLine</li><li>LimitLine, DriveLine, PingLine, ReverbLine, SynthKeyLine</li><li>Atualização 2.0 gratuita</li></ul><a class="btn" data-buy="pacoteCompleto" href="#">Comprar</a><span class="soon">em breve</span></div>
  </div>
</section>'''
h = h.replace(pr_old, pr_new)
h = sub1(h, '<details><summary>Os preços são definitivos?</summary><p>Não. Esta é uma prévia e todos os preços exibidos são ilustrativos.</p></details>',
 '<details><summary>Quanto tempo vale o preço de lançamento?</summary><p>7 dias a partir do lançamento. Nesse período: R$ 69 por plugin, R$ 119 o Pacote Voz, R$ 219 o Pacote Mix &amp; Master e R$ 349 o Pacote Completo. Depois, R$ 99, R$ 149, R$ 299 e R$ 499.</p></details>\n  <details><summary>O que vem em cada pacote?</summary><p><b>Pacote Voz:</b> AutoLine, HarmoLine e SilentLine. <b>Pacote Mix &amp; Master:</b> EqLine, CompLine, DriveLine, PingLine, ReverbLine e LimitLine. <b>Pacote Completo:</b> os 10 plugins, incluindo também o SynthKeyLine.</p></details>\n  <details><summary>Vai ter atualização?</summary><p>Sim. A versão 2.0 está a caminho e será gratuita para quem comprar.</p></details>')
h = sub1(h, 'Prévia local — não publicada.', 'Prévia privada — não publicada.')
h = sub1(h, '<script src="js/textures.js?v=6"></script><script src="js/site.js?v=5"></script><script src="js/audio-demos.js?v=4"></script>',
 '<script src="js/config.js?v=1"></script><script src="js/textures.js?v=8"></script><script src="js/site.js?v=6"></script><script src="js/audio-demos.js?v=5"></script>')
# ---- ProgLine fora da oferta ----
h, n1 = re.subn(r'<a href="#progline" class="mini tilt".*?</a>', '', h, flags=re.S)
h, n2 = re.subn(r'<section class="plug" id="progline".*?</section>', '', h, flags=re.S)
assert n1 == 1 and n2 == 1, (n1, n2)
assert 'prog' not in h.lower(), 'sobrou ProgLine no HTML'
assert 'delay' not in re.sub(r'data-demo="delayline"|delays clássicos|delay/reverb|Chorus, delay e reverb|>Delay<|reverb e delay', '', h).lower(), 'sobrou DelayLine'
assert 'kitline' not in h.lower()
assert h.count('id="silentline"') == 1 and h.count('href="#silentline"') == 1
assert '9 plugins' not in h and 'PadrÃ' not in h
# ---- v7: o visual Vidro É o produto — sem anúncio de "Atualização 2.0 gratuita" ----
h = sub1(h, '\n    <p class="teaser">✦ <b>Atualização 2.0 gratuita</b> a caminho para quem comprar</p>', '')
h, nli = re.subn(r'<li>Atualização 2\.0 gratuita</li>', '', h); assert nli == 4, nli
h = sub1(h, '\n  <details><summary>Vai ter atualização?</summary><p>Sim. A versão 2.0 está a caminho e será gratuita para quem comprar.</p></details>', '')
for bad in ['2.0', 'Atualização', 'atualização']:
    assert bad not in h, bad
# ---- v5: sem demos (áudio A/B, animações e vídeos) — originais em demos-backup-v5/ ----
h, nfig = re.subn(r'\s*<figure class="demo">.*?</figure>', '', h, flags=re.S)
assert nfig == 10, nfig
h = sub1(h, '<script src="js/audio-demos.js?v=5"></script>', '')
h = h.replace('css/style.css?v=7', 'css/style.css?v=8')
for bad in ['data-demo', '<video', '<audio', 'audio-demos', 'class="demo"', 'ilustrativ']:
    assert bad not in h, bad
wr(f'{P}/index.html', h)

# ---------- CSS / JS ----------
wr(f'{P}/css/style.css', rd(f'{SRC}/css/style.css') + '\n' + rd(f'{D}/glass.css') + '\n' + rd(f'{D}/sem-demo.css'))
shutil.copy(f'{D}/config.js', f'{P}/js/config.js')
a = rd(f'{SRC}/js/audio-demos.js')
a = sub1(a, "delayline:['DelayLine','Seco','Com DelayLine']", "pingline:['PingLine','Seco','Com PingLine']")
a = sub1(a, "||'#2EE6C8'", "||'#33E6FF'")
a = sub1(a, ",progline:['ProgLine','Lofi','RnB + melodia']", "")
for f in ['assets/img/progline.webp', 'assets/img/progline-alt.webp', 'audio/ProgLine-dry.mp3', 'audio/ProgLine-wet.mp3']:
    os.remove(f'{P}/{f}')
wr(f'{P}/js/audio-demos.js', a)
# v5: demos fora do deploy
os.remove(f'{P}/js/audio-demos.js'); shutil.rmtree(f'{P}/audio'); shutil.rmtree(f'{P}/videos')
s = rd(f'{SRC}/js/site.js')
s = sub1(s, '{id:"delayline",name:["DELAY","LINE"],cat:"Delay",accent:"#FFC93D",img:"delayline",alt:"delayline-alt"',
            '{id:"delayline",name:["PING","LINE"],cat:"Delay",accent:"#FFC93D",img:"pingline",alt:"pingline-alt",tex:"delayline"')
# textura do hero continua com chave "delayline" no textures.js
s = sub1(s, 'window.__TEX&&window.__TEX[I.img]||Hi(I.img)', 'window.__TEX&&window.__TEX[I.tex||I.img]||Hi(I.img)')
# nitidez: no meio da rolagem o cartão fica reto (sem rotação/zoom 3D que borra o raster)
s = sub1(s, '.to(s,{rotateY:-6*r,rotateX:-4,z:40,', '.to(s,{rotateY:0,rotateX:0,z:0,')
s = sub1(s, '.to(s,{rotateY:-10*r,rotateX:-6,z:60,opacity:1,duration:.24,ease:"none"})', '.to(s,{rotateY:0,rotateX:0,z:0,opacity:1,duration:.24,ease:"none"})')
s = sub1(s, 'Yn.setPixelRatio(Math.min(devicePixelRatio,1.75))', 'Yn.setPixelRatio(Math.min(devicePixelRatio,2))')
SL_GI = (',{id:"silentline",name:["SILENT","LINE"],cat:"Redutor de ru\\xEDdo vocal",accent:"#33E6FF",img:"silentline",alt:"silentline-alt",'
         'pitch:"Tira chiado e barulho de sala da voz sem abafar, com IA local.",feats:[]}')
i0 = s.index('{id:"harmoline"'); i1 = s.index(',{id:"eqline"', i0)
s = s[:i1] + SL_GI + s[i1:]
SL_DEMO = ('silentline(C){y(16,6);let R=u/2,L=(C*.22)%1.25-.1,w=L*d,F=[],B=[];'
  'for(let G=0;G<=d;G+=3){let q=G/d*9+C*.5,z=Math.max(0,Math.sin(q*.8))**1.4*(.55+.45*Math.sin(q*2.7)),'
  'Y=z*Math.sin(G*.21+C*9)*u*.36,J=(S(G+Math.floor(C*40))-.5)*u*.17;F.push([G,Y+J]),B.push([G,Y*.97])}'
  's.fillStyle="rgba(150,175,205,.28)";F.forEach(([G,Y])=>{G>w&&s.fillRect(G,R-Math.abs(Y),2,Math.abs(Y)*2)});'
  'f(p,10),s.fillStyle=p;B.forEach(([G,Y])=>{G<=w&&s.fillRect(G,R-Math.abs(Y),2,Math.max(1,Math.abs(Y)*2))}),A();'
  's.strokeStyle="rgba(255,255,255,.55)",s.beginPath(),s.moveTo(w,8),s.lineTo(w,u-8),s.stroke();'
  'm("COM RU\\xCDDO",d-12,20,"rgba(180,200,225,.75)","right"),m("VOZ LIMPA",12,20,p),m("IA R\\xC1PIDA \\xB7 5,3 ms",d-12,u-12,p,"right"),'
  'm("REDU\\xC7\\xC3O "+Math.round(62+8*Math.sin(C*.9))+"%",12,u-12,p)},')
k = s.index('synthline(C){', s.index('function yh'))
s = s[:k] + SL_DEMO + s[k:]
ids = ['autoline','harmoline','silentline','eqline','compline','limitline','driveline','delayline','reverbline','synthline']
for i, pid in enumerate(ids):
    s, n = re.subn(r'(\{id:"%s",name:\[[^\]]*\],cat:"[^"]*",accent:")#[0-9A-Fa-f]{6}' % pid, r'\g<1>' + ('#33E6FF' if i % 2 == 0 else '#C45CFF'), s)
    assert n == 1, pid
i0 = s.index(',{id:"progline"'); i1 = s.index('"]}];function yh', i0) + 3
s = s[:i0] + s[i1:]
assert 'progline' not in s.lower()
wr(f'{P}/js/site.js', s)

# ---------- público ----------
os.makedirs(f'{OUT}/fonts')
for f in ['inter-latin-wght-normal.woff2', 'inter-latin-ext-wght-normal.woff2']: shutil.copy(f'/tmp/fnt/package/files/{f}', f'{OUT}/fonts/{f}')
for f in ['jetbrains-mono-latin-400-normal.woff2', 'jetbrains-mono-latin-600-normal.woff2']: shutil.copy(f'/tmp/fnt2/package/files/{f}', f'{OUT}/fonts/{f}')
shutil.copy('/tmp/fnt/package/LICENSE', f'{OUT}/fonts/LICENSE-Inter-OFL.txt'); shutil.copy('/tmp/fnt2/package/LICENSE', f'{OUT}/fonts/LICENSE-JetBrainsMono-OFL.txt')
shutil.copy(f'{D}/logo.svg', f'{OUT}/favicon.svg')
eb = rd(f'{D}/em-breve.html'); wr(f'{OUT}/index.html', eb); wr(f'{OUT}/404.html', eb)
wr(f'{OUT}/robots.txt', 'User-agent: *\nDisallow: /\n')
wr(f'{OUT}/_headers', '''/*
  X-Robots-Tag: noindex, nofollow, noarchive, nosnippet, noimageindex
  Referrer-Policy: no-referrer
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
/previa/*
  Cache-Control: private, no-cache
/index.html
  Cache-Control: no-cache
''')

# ---------- edge function (senha da prévia) ----------
user, pw = None, None
for line in open(f'{D}/SENHA-PREVIA.txt', encoding='utf-8'):
    if line.startswith('Usuario:'): user = line.split(':', 1)[1].strip()
    if line.startswith('Senha:'): pw = line.split(':', 1)[1].strip()
hsh = hashlib.sha256(f'{user}:{pw}'.encode()).hexdigest()
ef = rd(f'{D}/previa-auth.ts.in').replace('__HASH__', hsh)
wr(f'{D}/netlify/edge-functions/previa-auth.ts', ef)
print('dist pronto; hash', hsh[:8] + '…')
