require('dotenv').config();
const XLSX = require('xlsx');
const { execFileSync } = require('child_process');

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
const dbName = url.replace('libsql://', '').replace('.turso.io', '');

function sendPipeline(requests) {
  const body = JSON.stringify({ requests });
  const b64Body = Buffer.from(body).toString('base64');
  const code = `p=JSON.parse(Buffer.from(process.argv[1],'base64').toString());require('https').request({hostname:'${dbName}.turso.io',path:'/v2/pipeline',method:'POST',headers:{'Authorization':'Bearer ${authToken}','Content-Type':'application/json'}},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>process.stdout.write(d))}).on('error',e=>{process.stderr.write(e.message);process.exit(1)}).end(JSON.stringify(p))`;
  const stdout = execFileSync(process.execPath, ['-e', code, b64Body], { timeout: 120000, stdio: 'pipe' });
  return JSON.parse(stdout.toString('utf-8'));
}

const wb = XLSX.readFile('C:\\Users\\Rodrigo\\Documents\\data de entrega\\Série com data de Entrega.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const dados = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true });

let atualizados = 0;
const batchSize = 50;

for (let i = 0; i < dados.length; i += batchSize) {
  const batch = dados.slice(i, i + batchSize);
  const requests = [];

  for (const d of batch) {
    const serie = (d['Série Equipamento'] || '').trim();
    const serial = d['Entrega'];
    if (!serie || !serial) continue;

    // Usar UTC para nao ter erro de fuso
    const data = new Date((serial - 25569) * 86400 * 1000);
    const ano = data.getUTCFullYear();
    const mes = String(data.getUTCMonth() + 1).padStart(2, '0');
    const dia = String(data.getUTCDate()).padStart(2, '0');
    const dataISO = `${ano}-${mes}-${dia}`;

    requests.push({
      type: "execute",
      stmt: {
        sql: "UPDATE ativos SET data_entrega = ? WHERE serie_equipamento = ?",
        args: [{ type: 'text', value: dataISO }, { type: 'text', value: serie }]
      }
    });
  }

  if (requests.length === 0) continue;

  const results = sendPipeline(requests);
  for (let j = 0; j < requests.length; j++) {
    const res = results.results?.[j]?.response?.result;
    if (res && Number(res.affected_row_count || 0) > 0) atualizados++;
  }

  console.log(`Processados ${Math.min(i + batchSize, dados.length)}/${dados.length} - Atualizados: ${atualizados}`);
}

console.log(`\nFinalizado! ${atualizados} registros corrigidos.`);
