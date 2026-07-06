const https = require('https');
const fs = require('fs');
const path = require('path');

const inputFile = process.argv[2];
if (!inputFile) { process.stderr.write('Usage: turso-exec.js <input-file>'); process.exit(1); }

let req;
try {
  req = JSON.parse(fs.readFileSync(inputFile, 'utf-8'));
} catch (e) {
  process.stderr.write('Erro ao ler arquivo: ' + e.message);
  process.exit(1);
}

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

const dbName = url.replace('libsql://', '').replace('.turso.io', '');
const body = JSON.stringify({
  requests: [{ type: "execute", stmt: { sql: req.sql, args: req.args || [] } }]
});

const opts = {
  hostname: `${dbName}.turso.io`,
  path: '/v2/pipeline',
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${authToken}`,
    'Content-Type': 'application/json'
  }
};

const r = https.request(opts, (res) => {
  let d = ''; res.on('data', c => d += c); res.on('end', () => process.stdout.write(d));
});
r.on('error', e => { process.stderr.write(e.message); process.exit(1); });
r.write(body);
r.end();
