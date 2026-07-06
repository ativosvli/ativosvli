exports.handler = async () => {
  const path = require('path');
  const errors = [];
  try {
    // Teste 1: path do script
    const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'turso-exec.cjs');
    errors.push('scriptPath: ' + scriptPath);

    // Teste 2: arquivo existe
    const fs = require('fs');
    errors.push('script exists: ' + fs.existsSync(scriptPath));

    // Teste 3: env vars
    errors.push('TURSO_DATABASE_URL: ' + (process.env.TURSO_DATABASE_URL ? 'definida' : 'INDEFINIDA'));
    errors.push('TURSO_AUTH_TOKEN: ' + (process.env.TURSO_AUTH_TOKEN ? 'definida' : 'INDEFINIDA'));

    // Teste 4: carregar app
    const app = require('../../app');
    errors.push('app carregado OK');

    return { statusCode: 200, body: JSON.stringify({ ok: true, debug: errors }) };
  } catch (err) {
    errors.push('ERRO: ' + err.message);
    errors.push('STACK: ' + (err.stack || '').split('\n').slice(0,4).join(' | '));
    return { statusCode: 500, body: JSON.stringify({ ok: false, debug: errors }) };
  }
};
