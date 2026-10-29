# Line Collection — deploy pré-lançamento
- Público: https://linecollection.netlify.app/ (só "Em breve") · domínio: linecollection.art.br (aguardando DNS)
- Prévia: /previa/ — Basic Auth (Edge Function netlify/edge-functions/previa-auth.ts), usuário/senha em SENHA-PREVIA.txt (não incluído nesta cópia; veja SENHA-PREVIA.example.txt)
- Rebuild + deploy: `python3 build.py && netlify deploy --prod --site 3701246d-baa0-44d9-8f06-72ae849750f1 --dir dist`
- Links de compra: dist/previa/js/config.js (fonte: config.js aqui) — trocar "#" pelos links do Gumroad e lojaAberta:true
- Lançar: trocar dist/index.html pelo site completo, tirar robots Disallow/noindex e a Edge Function.
DNS (Registro.br > domínio > DNS > Configurar zona DNS > Modo avançado):
  A      (nome vazio)  75.2.60.5
  CNAME  www           linecollection.netlify.app

## v4 (18/10/2026) — SilentLine no lugar do ProgLine + correção de imagens
- SilentLine: card no grid, seção depois do HarmoLine, cadeia "Voz → SilentLine → AutoLine…", animação própria (site.js), chave de compra `silentline` no config.js.
- Pacote Voz = AutoLine + HarmoLine + SilentLine (R$149 / R$119). Completo = 10 plugins (R$499 / R$349). Mix & Master inalterado.
- assets-fix/: imagens que substituem as v1 no build:
  - pingline*.webp = render REAL do editor PingLine v1 (EditorTest de v1-restore/delayline-v1 compilado numa cópia em /tmp), título PINGLINE.
  - eqline.webp = v1 com "Padrão" (recorte do eqline-alt, que já estava certo); eqline.mp4 = vídeo v1 sem os 9 quadros iniciais que mostravam "PadrÃ£o".
  - silentline*.webp = render REAL do editor SilentLine v1.3 (silentline-SiteRender.cpp, com a IA carregada); principal = CLÁSSICO, fantasma = IA RÁPIDA.
  - texturas do hero (textures.js) "delayline" e "eqline" são regeradas dessas imagens no build.
- Backups: build.py.bak-4silentline, config.js.bak-4silentline, LEIA-ME.md.bak-4silentline.

## v5 (18/10/2026) — prévia sem demos ("mostra")
- Removido de TODAS as 10 seções de plugin: player de áudio A/B (audio-demos.js), animações canvas de demo e vídeos ilustrativos (figure.demo + legendas).
- Fora do deploy: previa/audio/ (MP3 seco/processado), previa/videos/ (MP4), js/audio-demos.js. Originais guardados em demos-backup-v5/ (audio/, videos/, js/audio-demos.js, js/site.js e index-v4-com-demos.html); fontes também seguem em /workspace/Line-Site-Preview e Line-Site-Preview.bak-oceano-20261018.
- Layout: sem-demo.css (anexado ao style.css pelo build) — seções sem min-height 100vh, padding menor, descrição/lista maiores; a 2ª captura (ghost) continua no desktop.
- Para trazer as demos de volta: restaurar build.py.bak-5semdemo (e glass/config .bak-5semdemo) e rodar o build.
- Backups: build.py.bak-5semdemo, config.js.bak-5semdemo, glass.css.bak-5semdemo, LEIA-ME.md.bak-5semdemo.

## v6 (18/10/2026) — sem "vazamento" do visual Vidro (v2)
- Auditoria: só silentline.webp / silentline-alt.webp (+ @2x) mostravam a UI de plugin Vidro; usadas na seção, no card do grid e no carrossel 3D do hero (site.js carrega silentline.webp). Todas as outras imagens, texturas do hero e a imagem do PingLine (render do v1) são v1. Não há imagens OG/sociais.
- SilentLine agora = render real do editor v1.3 com a skin v1 (/workspace/silentline-v1skin/, não instalada). Imagens Vidro antigas guardadas em assets-fix/bak-6v1look-vidro/ (fora do deploy).
- Backups: build.py.bak-6v1look, LEIA-ME.md.bak-6v1look (build.py não mudou; só os arquivos em assets-fix/).

## v7 (2026-10-18) — lançamento COM o visual Vidro moderno
- Todas as capturas da prévia (10 seções, cards da grade, texturas do hero 3D, variantes @2x) = visual Vidro atual,
  renderizado do código real dos editores (cópias em /tmp/v7, testes de editor sob xvfb). Originais em assets-vidro/renders-originais/.
- assets-vidro/ (38 webp) é copiado por cima de tudo no build.py; textures.js regenerado inteiro a partir dele (textures.js?v=8).
- SilentLine = imagens Vidro v1.3 originais (CLÁSSICO principal, IA RÁPIDA alt) de assets-fix/bak-6v1look-vidro/.
- Removidos os textos "Atualização 2.0 gratuita" (teaser do hero, 4 itens de lista nos preços, pergunta do FAQ).
- Removido o bloco HI (@2x a partir de renders v1). Backups: *.bak-7vidro.

## v8 (2026-10-18) — SilentLine v2.0 nas imagens
- assets-vidro/silentline*.webp (+ @2x) = render real do editor SilentLine v2.0 (commit f3664f8): CLÁSSICO principal,
  IA RÁPIDA alt (após 45 s de áudio, leitura −11.9 dB e curva de ruído ativas), rodapé "v2.0 · by Carlos Chicano".
  Fontes em /workspace/silentline-v2-renders/ (harness/SiteRender.cpp). O hero 3D carrega silentline.webp direto.
- Backups: build.py.bak-8silentv2, LEIA-ME.md.bak-8silentv2, assets-vidro-bak-8silentv2/ (fora do deploy).
