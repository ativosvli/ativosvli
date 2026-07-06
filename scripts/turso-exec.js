const https = require('https');
const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
const sql = process.env.TURSO_QUERY_SQL;
if (!url || !authToken || !sql) { process.stderr.write('Missing env'); process.exit(1); }
const dbName = url.replace('libsql://', '').replace('.turso.io', '');
const body = JSON.stringify({ requests: [{ type: "execute", stmt: { sql, args: [] } }] });
const opts = {
  hostname: `${dbName}.turso.io`,
  path: '/v2/pipeline',
  method: 'POST',
  headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' }
};
const req = https.request(opts, (res) => {
  let d = ''; res.on('data', c => d += c); res.on('end', () => process.stdout.write(d));
});
req.on('error', e => { process.stderr.write(e.message); process.exit(1); });
req.write(body);
req.end();
