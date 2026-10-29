'use strict';
// Seed: produk, bundle, dan harga diambil dari config.js + index.html ORIGINAL (prévia Line Collection).
// Aman dijalankan berulang: tidak menimpa produk yang sudah ada.
const { db, get, run, tx } = require('./index');

// Harga dalam centavo BRL (R$ 99 = 9900). Sumber: window.LINE_CONFIG.precos di config.js original.
const P = { avulso: 9900, avulsoL: 6900, voz: 14900, vozL: 11900, mix: 29900, mixL: 21900, full: 49900, fullL: 34900 };

const plugins = [
  { slug:'autoline', name:'AutoLine', category:'Afinação vocal', accent:'#2EE6C8', image:'autoline-full', alt:null,
    description:'Correção de tom em tempo real que leva sua voz para a nota certa sem roubar o timbre. Do efeito robótico ao natural em um giro de knob.',
    features:['Retune Speed, Humanize e Flex-Tune','Preservação de formantes (Throat Length)','Escalas e tonalidades com teclado de alvo','Detecção de melisma e vibrato','Coral com até 4 vozes de harmonia (CHOIR)'] },
  { slug:'harmoline', name:'HarmoLine', category:'Gerador de harmonia', accent:'#3D8BFF', image:'harmoline', alt:'harmoline-alt',
    description:'Transforma uma voz em um coro. Toque as harmonias via MIDI ou deixe o modo Auto criar vozes diatônicas na escala da música.',
    features:['Modos MIDI, Auto e MIDI + Auto','Até 8 vozes, com Spread estéreo','Formant e Glide por voz','Humanize para vozes naturais','Auto Harmony: 3rd, 5th, Oct Up/Down'] },
  { slug:'silentline', name:'SilentLine', category:'Redutor de ruído vocal com IA', accent:'#33E6FF', image:'silentline', alt:'silentline-alt',
    description:'Tira chiado, ventilador, ar-condicionado e barulho de sala da sua voz sem abafar. A IA (DeepFilterNet 3) roda no seu próprio computador, com um modo de latência mínima para cantar ao vivo e qualidade máxima para mixar.',
    features:['3 motores: IA RÁPIDA (~5 ms, ao vivo), IA completa (~23 ms) e CLÁSSICO manual (5,3 ms)','Botão QUALIDADE MÁX para a mixagem e latência mostrada em ms','Brilho e Preservar Ar: voz limpa e presente, nunca abafada','Proteger Efeitos preserva as caudas de reverb e delay','Redução, Mix, Gate, Output, Auto Gain, Aprender Ruído e limitador de segurança em −0,3 dBFS'] },
  { slug:'eqline', name:'EqLine', category:'EQ paramétrico dinâmico', accent:'#22C3FF', image:'eqline', alt:'eqline-alt',
    description:'Um EQ paramétrico de 10 bandas com analisador de espectro em tempo real, bandas dinâmicas e processamento Mid/Side para mixagem cirúrgica.',
    features:['10 bandas paramétricas','Analisador de espectro em tempo real','Bandas dinâmicas','Processamento Stereo e Mid/Side','Menu de contexto rápido por banda'] },
  { slug:'compline', name:'CompLine', category:'Compressor', accent:'#FF9A3D', image:'compline', alt:'compline-alt',
    description:'Três personalidades em um compressor: VCA limpo, Opto suave e FET agressivo. Com lookahead e escuta do sidechain para controle total.',
    features:['Modos VCA, Opto e FET','Detector Peak ou RMS','Lookahead','Sidechain com escuta (listen)','Medidor de gain reduction'] },
  { slug:'limitline', name:'LimitLine', category:'Limiter de masterização', accent:'#FF5A7A', image:'limitline', alt:'limitline-alt',
    description:'Volume competitivo com transparência. Medição LUFS, estilos de limitação, escuta Delta e dither para o arquivo final.',
    features:['Estilos Transparent, Punchy e Aggressive','Medição de loudness em LUFS','Escuta Delta (o que o limiter remove)','Teto (ceiling) ajustável','Dither para exportação'] },
  { slug:'driveline', name:'DriveLine', category:'Saturação multibanda', accent:'#9B6BFF', image:'driveline', alt:'driveline-alt',
    description:'Saturação em 3 bandas para dar calor, peso e brilho separadamente. Escolha entre Soft, Hard e Tape em cada faixa de frequência.',
    features:['3 bandas independentes (Low, Mid, High)','Curvas Soft, Hard e Tape','Visualização da curva de saturação','Drive e mix por banda'] },
  { slug:'pingline', name:'PingLine', category:'Delay', accent:'#FFC93D', image:'pingline', alt:'pingline-alt',
    description:'Inspirado nos delays clássicos de estúdio: sync com o BPM, botão TAP, ping-pong, freeze e caráter analógico ou LoFi, com ducking para não embolar a voz.',
    features:['Sync com BPM e botão TAP','Ping-Pong e Width','Freeze','Caráter Clean, Analog e LoFi com modulação','Ducking e filtros no feedback','12 presets (Slap, Dotted Ping, Dub, Tape Echo…)'] },
  { slug:'reverbline', name:'ReverbLine', category:'Reverb algorítmico', accent:'#5BE3FF', image:'reverbline', alt:'reverbline-alt',
    description:'Dez espaços algorítmicos com as cores de 1970s, 1980s e Now. Edite o decay por frequência num gráfico interativo e congele a cauda com Freeze.',
    features:['10 modos: Concert Hall, Plate, Room, Chamber, Random Space, Chorus Space, Ambience, Bright Hall, Smooth Plate, Dirty Hall','Cores 1970s, 1980s e Now','EQ de decay por frequência','Freeze e ducking','16 presets'] },
  { slug:'synthkeyline', name:'SynthKeyLine', category:'Instrumento', accent:'#FF6BD5', image:'synthline', alt:'synthline-alt',
    description:'Um sintetizador para criar melodias na hora: 95 timbres inspirados em instrumentos clássicos da indústria, loops no estilo Arcade e vozes femininas para R&B.',
    features:['95 presets em 11 categorias (Keys, Pads, Leads, Bass, Vocals R&B…)','Modo LOOP: 16 padrões, teclas C2–B2 escolhem o loop','Motores Analog, FM e Pluck','Seção VOX com formantes (vogais, breath, vibrato)','Chorus, delay e reverb internos'] },
];

const bundles = [
  { slug:'pacote-voz', name:'Pacote Voz', category:'3 plugins para voz', price:P.voz, launch:P.vozL,
    description:'AutoLine (afinação vocal), HarmoLine (harmonias) e SilentLine (redução de ruído).',
    items:['autoline','harmoline','silentline'], accent:'#2EE6C8' },
  { slug:'pacote-mix-master', name:'Pacote Mix & Master', category:'6 plugins de mixagem e master', price:P.mix, launch:P.mixL,
    description:'EqLine, CompLine, DriveLine, PingLine, ReverbLine e LimitLine.',
    items:['eqline','compline','driveline','pingline','reverbline','limitline'], accent:'#FF9A3D' },
  { slug:'pacote-completo', name:'Pacote Completo', category:'Todos os 10 plugins', price:P.full, launch:P.fullL,
    description:'Os 10 plugins da Line Collection, incluindo também o SynthKeyLine.',
    items:plugins.map(p => p.slug), accent:'#33E6FF' },
];

tx(() => {
  let order = 1;
  for (const p of plugins) {
    if (get('SELECT id FROM products WHERE slug = ?', p.slug)) { order++; continue; }
    run(`INSERT INTO products(slug,name,category,description,features,accent,image,image_alt,kind,price_cents,launch_price_cents,sort_order)
         VALUES (?,?,?,?,?,?,?,?, 'plugin', ?, ?, ?)`,
      p.slug, p.name, p.category, p.description, JSON.stringify(p.features), p.accent, p.image, p.alt, P.avulso, P.avulsoL, order++);
  }
  for (const b of bundles) {
    if (get('SELECT id FROM products WHERE slug = ?', b.slug)) { order++; continue; }
    const r = run(`INSERT INTO products(slug,name,category,description,features,accent,kind,price_cents,launch_price_cents,sort_order)
         VALUES (?,?,?,?,?,?, 'bundle', ?, ?, ?)`,
      b.slug, b.name, b.category, b.description, '[]', b.accent, b.price, b.launch, order++);
    for (const s of b.items) {
      const pl = get('SELECT id FROM products WHERE slug = ?', s);
      run('INSERT INTO bundle_items(bundle_id,plugin_id) VALUES (?,?)', r.lastInsertRowid, pl.id);
    }
  }
  // Pengaturan toko: promo lançamento ativo (como lancamentoAtivo:true no config.js original)
  run("INSERT OR IGNORE INTO settings(key,value) VALUES ('launch_active','1')");
});

const n = get('SELECT COUNT(*) c FROM products').c;
console.log(`Seed selesai. Total produk di database: ${n}`);
