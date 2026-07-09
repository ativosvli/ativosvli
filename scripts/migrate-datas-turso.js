require('dotenv').config();
const XLSX = require('xlsx');
const { execFileSync } = require('child_process');

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  console.error('ERRO: Defina TURSO_DATABASE_URL e TURSO_AUTH_TOKEN no .env');
  process.exit(1);
}

const dbName = url.replace('libsql://', '').replace('.turso.io', '');

function toTursoValue(val) {
  if (val === null || val === undefined) return { type: 'null' };
  if (typeof val === 'number') return { type: 'integer', value: String(val) };
  if (typeof val === 'string') return { type: 'text', value: val };
  return { type: 'text', value: String(val) };
}

function sendPipeline(requests) {
  const body = JSON.stringify({ requests });
  const b64Body = Buffer.from(body).toString('base64');
  const code = `p=JSON.parse(Buffer.from(process.argv[1],'base64').toString());require('https').request({hostname:'${dbName}.turso.io',path:'/v2/pipeline',method:'POST',headers:{'Authorization':'Bearer ${authToken}','Content-Type':'application/json'}},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>process.stdout.write(d))}).on('error',e=>{process.stderr.write(e.message);process.exit(1)}).end(JSON.stringify(p))`;
  const stdout = execFileSync(process.execPath, ['-e', code, b64Body], { timeout: 120000, stdio: 'pipe' });
  return JSON.parse(stdout.toString('utf-8'));
}

// 1. Migration: add coluna data_entrega se não existir
console.log('Adicionando coluna data_entrega...');
const migrateResult = sendPipeline([{ type: "execute", stmt: { sql: "ALTER TABLE ativos ADD COLUMN data_entrega TEXT", args: [] } }]);
if (migrateResult.results?.[0]?.error?.message) {
  console.log('Coluna já existe ou erro:', migrateResult.results[0].error.message);
} else {
  console.log('Coluna criada com sucesso');
}

// 2. Ler planilha
console.log('Lendo planilha...');
const wb = XLSX.readFile('C:\\Users\\Rodrigo\\Documents\\data de entrega\\Série com data de Entrega.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const dados = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true });

let atualizados = 0;
let naoEncontrados = [];

// 3. Atualizar em batch de 50
const batchSize = 50;
for (let i = 0; i < dados.length; i += batchSize) {
  const batch = dados.slice(i, i + batchSize);
  const requests = [];

  for (const d of batch) {
    const serie = (d['Série Equipamento'] || '').trim();
    const entregaSerial = d['Entrega'];
    if (!serie || !entregaSerial) continue;

    const data = new Date((entregaSerial - 25569) * 86400 * 1000);
    const ano = data.getFullYear();
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const dia = String(data.getDate()).padStart(2, '0');
    const dataISO = `${ano}-${mes}-${dia}`;

    requests.push({
      type: "execute",
      stmt: {
        sql: "UPDATE ativos SET data_entrega = ? WHERE serie_equipamento = ?",
        args: [toTursoValue(dataISO), toTursoValue(serie)]
      }
    });
  }

  if (requests.length === 0) continue;

  const results = sendPipeline(requests);
  for (let j = 0; j < requests.length; j++) {
    const res = results.results?.[j]?.response?.result;
    if (res) {
      if (Number(res.affected_row_count || 0) > 0) atualizados++;
    }
  }

  console.log(`Processados ${Math.min(i + batchSize, dados.length)}/${dados.length} - Atualizados: ${atualizados}`);
}

console.log('\n=== RESULTADO FINAL ===');
console.log(`Total na planilha: ${dados.length}`);
console.log(`Atualizados no Turso: ${atualizados}`);
console.log('Concluído!');