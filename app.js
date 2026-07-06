const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const { sseHandler } = require('./events');

const app = express();

const tempDir = process.env.TEMP_DIR || (process.env.LAMBDA_TASK_ROOT ? '/tmp/temp_uploads' : path.join(__dirname, 'temp_uploads'));
if (!fs.existsSync(tempDir)) {
  try { fs.mkdirSync(tempDir, { recursive: true }); } catch (e) {}
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'sess-gestao-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 8 * 60 * 60 * 1000 }
}));

app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/ativos', require('./routes/ativos'));
app.use('/api/auditoria', require('./routes/auditoria'));
app.use('/api/importar', require('./routes/import'));
app.use('/api/exportar', require('./routes/export'));
app.use('/api/exportar/auditoria', require('./routes/export-auditoria'));
app.use('/api/upload', require('./routes/upload'));

app.get('/api/eventos', sseHandler);

app.get('/api/status', (req, res) => {
  res.json({ status: 'online', versao: '1.0.0' });
});

app.get('/api/debug', (req, res) => {
  const result = {};
  try {
    result.execPath = process.execPath;
    result.lambdaTaskRoot = process.env.LAMBDA_TASK_ROOT;
    result.nodeVersion = process.version;
    result.platform = process.platform;
    result.envKeys = Object.keys(process.env).filter(k => !k.includes('TOKEN') && !k.includes('SECRET') && !k.includes('KEY'));
    try {
      const { execFileSync } = require('child_process');
      const out = execFileSync(process.execPath, ['-e', 'console.log("hello from child")'], { timeout: 5000 });
      result.childWorks = out.toString().trim();
    } catch (e) {
      result.childError = e.message;
    }
    try {
      const { getDatabase } = require('./database');
      const db = getDatabase();
      const r = db.prepare('SELECT COUNT(*) FROM ativos').get();
      result.tursoOk = true;
      result.ativosCount = r ? r[0] : null;
    } catch (e) {
      result.tursoError = e.message;
      result.tursoStack = (e.stack || '').split('\n').slice(0,3).join(' | ');
    }
  } catch (e) {
    result.error = e.message;
  }
  res.json(result);
});

app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ erro: 'Rota não encontrada' });
  }
  const filePath = path.join(__dirname, 'public', req.path === '/' ? 'dashboard.html' : req.path.slice(1));
  if (fs.existsSync(filePath)) {
    return res.sendFile(filePath);
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('Erro:', err.message);
  res.status(500).json({ erro: 'Erro interno do servidor' });
});

module.exports = app;
