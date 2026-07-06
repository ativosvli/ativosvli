const https = require('https');

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) { process.stderr.write('TURSO_DATABASE_URL e TURSO_AUTH_TOKEN obrigatorios'); process.exit(1); }

let input = '';
process.stdin.on('data', c => input += c);
process.stdin.on('end', () => {
  let req;
  try {
    req = JSON.parse(input);
  } catch (e) {
    process.stderr.write('JSON invalido no stdin'); process.exit(1);
  }

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
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => process.stdout.write(data));
  });
  r.on('error', e => { process.stderr.write(e.message); process.exit(1); });
  r.write(body);
  r.end();
});
