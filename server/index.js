'use strict';
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const path = require('node:path');
const fs = require('node:fs');
const { config, validate } = require('./config');

const problems = validate();
if (problems.length) {
  console.error('\n❌ Configuração incompleta:\n' + problems.map(p => '  - ' + p).join('\n') + '\n\nVeja o arquivo .env.example e o README.md.\n');
  process.exit(1);
}

const { get } = require('./db');
const S = require('./lib/security');

const app = express();
app.disable('x-powered-by');
if (config.isProd) app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:', 'blob:'], fontSrc: ["'self'"], connectSrc: ["'self'"],
    workerSrc: ["'self'", 'blob:'], objectSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'self'"],
    formAction: ["'self'"], upgradeInsecureRequests: config.isProd ? [] : null,
  } },
  crossOriginEmbedderPolicy: false,
  hsts: config.isProd,
}));
app.use(cookieParser());
app.use(express.json({ limit: '100kb' }));
app.use(S.loadUser);
app.use(S.csrfProtect);

// ---- API ----
const apiLimiter = rateLimit({ windowMs: 60e3, max: 300, standardHeaders: true, legacyHeaders: false, skip: () => process.env.NODE_ENV === 'test' });
app.use('/api', apiLimiter, (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.use('/api/auth', require('./routes/auth'));
app.use('/api/account', require('./routes/account'));
app.use('/api', require('./routes/shop'));
app.use('/api/webhooks', require('./routes/webhooks'));
app.use('/api/sandbox', require('./routes/sandbox'));
app.use('/api/pay', require('./routes/manual'));
app.use('/api/downloads', require('./routes/downloads'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

// Link de download curto: /download/:token  (usa o mesmo handler da API)
app.use('/download', require('./routes/downloads'));

// ---- Halaman ----
const PUB = path.join(__dirname, '..', 'public');
const page = (file) => (req, res) => { res.set('Cache-Control', 'no-cache'); res.sendFile(path.join(PUB, 'pages', file)); };
const needLogin = (file) => (req, res) => {
  if (!req.user) return res.redirect('/entrar?next=' + encodeURIComponent(req.originalUrl));
  page(file)(req, res);
};
const needAdmin = (file) => (req, res) => {
  if (!req.user) return res.redirect('/entrar?next=' + encodeURIComponent(req.originalUrl));
  if (req.user.role !== 'admin') return res.status(403).sendFile(path.join(PUB, 'pages', '403.html'));
  page(file)(req, res);
};
// Tela de entrada: para abrir a página inicial é preciso estar logado (visitante vai para o login/cadastro).
// Para voltar a deixar a página inicial pública, coloque REQUIRE_LOGIN_FOR_LANDING=false no arquivo .env
const LANDING_WALL = process.env.NODE_ENV !== 'test' && String(process.env.REQUIRE_LOGIN_FOR_LANDING ?? 'true').toLowerCase() !== 'false';
app.get(['/', '/index', '/index.html'], (req, res, next) => {
  if (LANDING_WALL && !req.user) return res.redirect(302, '/entrar?next=%2F&reason=wall');
  res.set('Cache-Control', 'no-cache');
  next();
});
app.get(['/entrar', '/cadastro', '/esqueci-senha', '/redefinir-senha'], page('auth.html'));
app.get(/^\/conta(\/.*)?$/, needLogin('conta.html'));
app.get(/^\/admin(\/.*)?$/, needAdmin('admin.html'));
app.get(['/carrinho', '/checkout'], needLogin('checkout.html'));
app.get('/pagamento/transferencia', needLogin('transfer.html'));
app.get('/pagamento/resultado', needLogin('resultado.html'));
app.get('/sandbox/pagar', (req, res, next) => (config.paymentProvider === 'sandbox' && !config.isProd) ? needLogin('sandbox.html')(req, res) : next());

app.use(express.static(PUB, { index: 'index.html', extensions: ['html'], maxAge: config.isProd ? '1h' : 0,
  setHeaders: (res, p) => { if (/\.(webp|woff2|svg)$/.test(p)) res.set('Cache-Control', 'public, max-age=86400'); } }));

app.use((req, res) => res.status(404).sendFile(path.join(PUB, 'pages', '404.html')));

// Penanganan error terpusat: mensagem jelas ao usuário, detalhe teknis só no log
app.use((err, req, res, _next) => {
  const status = err.status || (err.type === 'entity.too.large' ? 413 : err.type === 'entity.parse.failed' ? 400 : 500);
  if (status >= 500) console.error('[erro]', req.method, req.originalUrl, err);
  const msg = status >= 500 ? 'Erro interno. Tente novamente em instantes.' : err.message;
  if (req.originalUrl.startsWith('/api') || req.accepts(['json', 'html']) === 'json') return res.status(status).json({ error: msg });
  res.status(status).send(msg);
});

if (require.main === module) {
  fs.mkdirSync(path.join(config.storageDir, 'files'), { recursive: true });
  app.listen(config.port, () => {
    const admins = get("SELECT COUNT(*) c FROM users WHERE role='admin'").c;
    console.log(`\n✅ Line Collection rodando em ${config.baseUrl}`);
    console.log(`   Pagamento: ${config.paymentProvider === 'sandbox' ? 'SANDBOX (simulação, sem dinheiro real)' : config.paymentProvider === 'manual' ? 'MANUAL (PIX/transferência + comprovante aprovado pelo admin)' : 'Mercado Pago'}`);
    if (!admins) console.log('   ⚠  Nenhum admin criado ainda. Rode:  npm run criar-admin');
  });
}
module.exports = app;