require('dotenv').config();
const { execFileSync } = require('child_process');

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
const dbName = url.replace('libsql://', '').replace('.turso.io', '');

function sendPipeline(requests) {
  const body = JSON.stringify({ requests });
  const b64Body = Buffer.from(body).toString('base64');
  const code = `p=JSON.parse(Buffer.from(process.argv[1],'base64').toString());require('https').request({hostname:'${dbName}.turso.io',path:'/v2/pipeline',method:'POST',headers:{'Authorization':'Bearer ${authToken}','Content-Type':'application/json'}},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>process.stdout.write(d))}).on('error',e=>{process.stderr.write(e.message);process.exit(1)}).end(JSON.stringify(p))`;
  const stdout = execFileSync(process.execPath, ['-e', code, b64Body], { timeout: 30000, stdio: 'pipe' });
  return JSON.parse(stdout.toString('utf-8'));
}

const result = sendPipeline([{ type: "execute", stmt: { sql: "SELECT serie_equipamento, data_entrega FROM ativos WHERE data_entrega IS NOT NULL AND data_entrega != '' LIMIT 15", args: [] } }]);
const rows = result.results?.[0]?.response?.result?.rows || [];
console.log('Exemplos de datas no Turso:');
for (const row of rows) {
  const serie = row[0]?.value || '';
  const data = row[1]?.value || '';
  console.log(serie, '->', data);
}
