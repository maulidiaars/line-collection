# Line Collection — website source

Marketing site for **Line Collection**, a set of 10 audio plugins (VST3) by Carlos Chicano.
This folder is a snapshot (2026-10-24) of exactly what is deployed today.

## Stack
- Plain static site: HTML + CSS + vanilla JS. No framework, no bundler.
- `fonte/build.py` (Python 3 + Pillow) assembles the final site into `dist/`.
- Hosting: **Netlify**. The site is called `linecollection`, the domain is `linecollection.art.br` (DNS at Registro.br) and `www` redirects to it.
- A Netlify **Edge Function** (Deno/TypeScript) password-protects `/previa/` with HTTP Basic Auth.
- Fonts: Inter and JetBrains Mono, self-hosted woff2 (OFL).

## Structure
```
publicado-dist/            The deployed output (what is live). Same as dist/.
  index.html, 404.html     Public "Em breve" (coming soon) page
  previa/                  Full site (password protected)
    index.html, css/style.css, js/{config,site,textures}.js, assets/img/*.webp
  fonts/, favicon.svg, robots.txt, _headers
fonte/                     Build inputs
  build.py                 Generator: base site + patches/overrides -> dist/
  config.js                Prices, bundles and buy links (single place to edit)
  glass.css, sem-demo.css  Overrides: glass look, layout without the audio demos
  em-breve.html            Public coming-soon page
  netlify.toml             publish = "dist", edge_functions dir, noindex headers
  netlify/edge-functions/previa-auth.ts   Basic Auth (stores only a SHA-256 of user:pass)
  previa-auth.ts.in        Template; build.py injects the hash from SENHA-PREVIA.txt
  SENHA-PREVIA.example.txt Format of the (not included) credentials file
  assets-vidro/, assets-fix/  Plugin screenshots (webp, @2x) + source renders
  fonts/, logo.svg, shot.mjs (Playwright screenshot helper), LEIA-ME.md (notes, PT)
base-site/
  Line-Site-Preview/       Original base site (index.html, css, js, assets, vendor; audio/ and videos/ are unused right now)
  v1-textures/js/textures.js  textures.js taken from the earlier v1 version
```

## How the build works
`build.py` reads the base site (`SRC`) and copies it into `dist/previa/`. It then applies text and markup patches using exact string matches (`sub1()` asserts that each match is found), swaps in the glass plugin images, strips the audio/video demos, injects `config.js`, and writes the public coming-soon page, the fonts, `_headers`, `robots.txt` and the edge function.

Paths at the top of `build.py` are absolute paths from the machine it was written on. Repoint them before building locally:
```python
D   = '<this folder>/fonte'
SRC = '<this folder>/base-site/Line-Site-Preview'
V1  = '<this folder>/base-site/v1-textures'
```
The fonts are copied from `/tmp/fnt` and `/tmp/fnt2`, the unpacked npm tarballs of `@fontsource-variable/inter` and `@fontsource/jetbrains-mono`. Either point those lines at `fonte/fonts/` or unpack the packages there. The build also expects a `SENHA-PREVIA.txt` next to `build.py`; copy the example file and fill it in.

```bash
pip install pillow
cd fonte && python build.py      # -> fonte/dist/
```

## Preview locally
```bash
cd publicado-dist   # or fonte/dist
python -m http.server 8000
# http://localhost:8000/          coming-soon page
# http://localhost:8000/previa/   full site (no auth locally)
```
Basic Auth only runs on Netlify. To exercise it locally, use `netlify dev`.

## Deploy
```bash
npm i -g netlify-cli
netlify login
netlify link            # pick site "linecollection"
netlify deploy --prod --dir dist
```
Access to the Netlify account goes through Carlos.

## Content / config
- **Prices, bundles, buy links:** `fonte/config.js` (`window.LINE_CONFIG`).
- **Plugin copy:** the base `index.html` plus the text patches in `build.py`.
- **Styling:** base `css/style.css` plus the `glass.css` and `sem-demo.css` overrides.

## Known placeholders / TODO
- All buy links in `config.js` are `"#"` and `lojaAberta: false`, so buttons show "em breve". They become Gumroad product URLs at launch.
- The site is intentionally hidden: noindex headers, `robots.txt` blocks everything, and only "Em breve" is public. At launch, publish the full site at `/`, remove noindex and robots, and drop the password.
- The audio/video demos were removed on purpose. Their originals are in `base-site/Line-Site-Preview/audio|videos`.

## Access
`/previa/` is password protected. The credentials are **not** in this folder; ask Carlos.
