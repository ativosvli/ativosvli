const path = require('path');
const Database = require('better-sqlite3');
const { createClient } = require('@libsql/client');

const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;

if (!TURSO_URL || !TURSO_TOKEN) {
  console.error('Defina TURSO_DATABASE_URL e TURSO_AUTH_TOKEN no .env');
  process.exit(1);
}

const local = new Database(path.join(__dirname, '..', 'database.sqlite'));
const turso = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

async function migrate() {
  console.log('Migrando dados para Turso...\n');

  const tables = ['usuarios', 'ativos', 'auditoria', 'uploads'];

  for (const table of tables) {
    const rows = local.prepare(`SELECT * FROM ${table}`).all();
    if (rows.length === 0) { console.log(`${table}: 0 registros (vazio)`); continue; }

    const columns = Object.keys(rows[0]).filter(c => c !== 'id');
    const placeholders = columns.map(() => '?').join(',');
    const colNames = columns.join(',');
    const insert = local.prepare(`SELECT sql FROM sqlite_master WHERE name = ? AND type = 'table'`).get(table);

    for (const row of rows) {
      try {
        const values = columns.map(c => row[c]);
        const sql = `INSERT OR IGNORE INTO ${table} (${colNames}) VALUES (${placeholders})`;
        await turso.execute({ sql, args: values });
      } catch (err) {
        console.error(`Erro ao inserir em ${table} (id ${row.id}): ${err.message}`);
      }
    }

    const count = await turso.execute(`SELECT COUNT(*) as count FROM ${table}`);
    console.log(`${table}: ${count.rows[0].count} registros migrados`);
  }

  console.log('\nMigração concluída!');
  process.exit(0);
}

migrate().catch(err => { console.error(err); process.exit(1); });