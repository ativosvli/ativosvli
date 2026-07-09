const XLSX = require('xlsx');
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'database.sqlite'));

const wb = XLSX.readFile('C:\\Users\\Rodrigo\\Documents\\data de entrega\\Série com data de Entrega.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const dados = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true });

let atualizados = 0;
let ignorados = 0;
let naoEncontrados = [];

for (const d of dados) {
  const serie = (d['Série Equipamento'] || '').trim();
  const entregaSerial = d['Entrega'];
  if (!serie || !entregaSerial) continue;

  const data = new Date((entregaSerial - 25569) * 86400 * 1000);
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  const dataISO = `${ano}-${mes}-${dia}`;

  const result = db.prepare(
    `UPDATE ativos SET data_entrega = ? WHERE serie_equipamento = ?`
  ).run(dataISO, serie);

  if (result.changes > 0) {
    atualizados++;
  } else {
    naoEncontrados.push(serie);
  }
}

db.close();

console.log(`Total na planilha: ${dados.length}`);
console.log(`Atualizados: ${atualizados}`);
console.log(`Ignorados (sem série ou data): ${ignorados}`);
console.log(`Não encontrados no banco: ${naoEncontrados.length}`);
if (naoEncontrados.length > 0) {
  console.log('Primeiros 10 não encontrados:', naoEncontrados.slice(0, 10));
}
