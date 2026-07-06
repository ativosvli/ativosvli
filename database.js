const path = require('path');
const bcrypt = require('bcryptjs');
const { execFileSync } = require('child_process');

let db;

function parseTursoResult(result) {
  if (!result) return { rows: [], columns: [], affectedRowCount: 0, lastInsertRowid: null };
  return {
    columns: (result.cols || []).map(c => c.name),
    rows: (result.rows || []).map(row =>
      row.map(val => val && val.type === 'integer' ? Number(val.value) : (val ? val.value : val))
    ),
    affectedRowCount: Number(result.affected_row_count || 0),
    lastInsertRowid: Number(result.last_insert_rowid || 0)
  };
}

function createTursoClient(url, authToken) {
  const dbName = url.replace('libsql://', '').replace('.turso.io', '');

  function rowToObj(row, columns) {
    const obj = {};
    for (let i = 0; i < columns.length; i++) {
      obj[columns[i]] = row ? row[i] : undefined;
    }
    return obj;
  }

  function execRequest(sql, params) {
    const body = JSON.stringify({
      requests: [{ type: "execute", stmt: { sql, args: params.filter(p => p !== undefined) } }]
    });
    const b64Body = Buffer.from(body).toString('base64');
    const code = `p=JSON.parse(Buffer.from(process.argv[1],'base64').toString());require('https').request({hostname:'${dbName}.turso.io',path:'/v2/pipeline',method:'POST',headers:{'Authorization':'Bearer ${authToken}','Content-Type':'application/json'}},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>process.stdout.write(d))}).on('error',e=>{process.stderr.write(e.message);process.exit(1)}).end(JSON.stringify(p))`;
    const stdout = execFileSync(process.execPath, ['-e', code, b64Body], { timeout: 20000, stdio: 'pipe' });
    const json = JSON.parse(stdout.toString('utf-8'));
    const result = json.results?.[0]?.response?.result;
    if (!result) {
      const errMsg = json.results?.[0]?.error?.message || JSON.stringify(json.results?.[0]?.error) || 'Erro Turso';
      throw new Error(errMsg);
    }
    return parseTursoResult(result);
  }

  return {
    prepare(sql) {
      return {
        run(...params) {
          const r = execRequest(sql, params.filter(p => p !== undefined));
          return { changes: r.affectedRowCount, lastInsertRowid: r.lastInsertRowid };
        },
        get(...params) {
          const r = execRequest(sql, params.filter(p => p !== undefined));
          return r.rows[0] ? rowToObj(r.rows[0], r.columns) : undefined;
        },
        all(...params) {
          const r = execRequest(sql, params.filter(p => p !== undefined));
          return r.rows.map(row => rowToObj(row, r.columns));
        }
      };
    },
    exec(sql) { execRequest(sql, []); },
    pragma() {},
    close() {}
  };
}

function getDatabase() {
  if (db) return db;

  if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
    console.log('Conectado ao Turso Database (execSync)');
    db = createTursoClient(process.env.TURSO_DATABASE_URL, process.env.TURSO_AUTH_TOKEN);
  } else {
    const Database = require('better-sqlite3');
    db = new Database(path.join(__dirname, 'database.sqlite'));
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    console.log('Conectado ao SQLite local');
  }

  initializeDatabase();
  migrateDatabase();
  return db;
}

function initializeDatabase() {
  db.exec(`CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, nome TEXT NOT NULL, perfil TEXT NOT NULL CHECK(perfil IN ('admin')), ativo INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.exec(`CREATE TABLE IF NOT EXISTS ativos (id INTEGER PRIMARY KEY AUTOINCREMENT, serie_equipamento TEXT, serie_ux TEXT, status_wxp TEXT, localidade_vli TEXT, setor TEXT, status_geral TEXT, evidencias_instalacoes TEXT, status_servicenow TEXT, chamado_servicenow TEXT, especificacao_servicenow TEXT, tipo_equipamento TEXT, modelo TEXT, item TEXT, nf TEXT, comentario TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.exec(`CREATE TABLE IF NOT EXISTS auditoria (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER, usuario_nome TEXT, acao TEXT NOT NULL, justificativa TEXT, ativo_id INTEGER, dados_anteriores TEXT, dados_novos TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (usuario_id) REFERENCES usuarios(id))`);
  db.exec(`CREATE TABLE IF NOT EXISTS uploads (id INTEGER PRIMARY KEY AUTOINCREMENT, ativo_id INTEGER, url TEXT NOT NULL, public_id TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (ativo_id) REFERENCES ativos(id) ON DELETE CASCADE)`);

  const userCount = db.prepare('SELECT COUNT(*) as count FROM usuarios').get();
  if (!userCount || userCount.count === 0) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare('INSERT INTO usuarios (username, password, nome, perfil) VALUES (?, ?, ?, ?)').run('admin', hash, 'Administrador', 'admin');
    console.log('Usuário admin criado: admin/admin123');
  }
}

function migrateDatabase() {
  try { db.exec("ALTER TABLE ativos ADD COLUMN setor TEXT"); } catch (e) {}
}

module.exports = { getDatabase };