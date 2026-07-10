const path = require('path');
const bcrypt = require('bcryptjs');
const { execFileSync } = require('child_process');

let dbPromise;

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

function prepareParams(params, namedParams) {
  let flat = params.filter(p => p !== undefined);
  if (flat.length === 1 && typeof flat[0] === 'object' && !Array.isArray(flat[0]) && flat[0] !== null) {
    flat = namedParams.map(k => flat[0][k]);
  }
  return flat;
}

function createTursoClient(url, authToken) {
  const dbName = url.replace('libsql://', '').replace('.turso.io', '');

  function toTursoValue(val) {
    if (val === null || val === undefined) return { type: 'null' };
    if (typeof val === 'number') return { type: 'integer', value: String(val) };
    if (typeof val === 'string') return { type: 'text', value: val };
    return { type: 'text', value: String(val) };
  }

  function rowToObj(row, columns) {
    const obj = {};
    for (let i = 0; i < columns.length; i++) {
      obj[columns[i]] = row ? row[i] : undefined;
    }
    return obj;
  }

  function sendPipeline(requests) {
    const body = JSON.stringify({ requests });
    const b64Body = Buffer.from(body).toString('base64');
    const code = `p=JSON.parse(Buffer.from(process.argv[1],'base64').toString());require('https').request({hostname:'${dbName}.turso.io',path:'/v2/pipeline',method:'POST',headers:{'Authorization':'Bearer ${authToken}','Content-Type':'application/json'}},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>process.stdout.write(d))}).on('error',e=>{process.stderr.write(e.message);process.exit(1)}).end(JSON.stringify(p))`;
    const stdout = execFileSync(process.execPath, ['-e', code, b64Body], { timeout: 120000, stdio: 'pipe' });
    return JSON.parse(stdout.toString('utf-8'));
  }

  function execRequest(sql, params) {
    const results = sendPipeline([{ type: "execute", stmt: { sql, args: params.map(p => toTursoValue(p ?? null)) } }]);
    const result = results.results?.[0]?.response?.result;
    if (!result) {
      const errMsg = results.results?.[0]?.error?.message || 'Erro Turso';
      throw new Error(errMsg);
    }
    return parseTursoResult(result);
  }

  function execBatch(statements) {
    const requests = statements.map(s => ({
      type: "execute",
      stmt: { sql: s.sql, args: (s.params || []).map(p => toTursoValue(p ?? null)) }
    }));
    const results = sendPipeline(requests);
    const out = [];
    for (let i = 0; i < requests.length; i++) {
      const res = results.results?.[i]?.response?.result;
      if (res) {
        out.push({ ok: true, changes: Number(res.affected_row_count || 0) });
      } else {
        out.push({ ok: false, error: results.results?.[i]?.error?.message || 'Erro' });
      }
    }
    return out;
  }

  return {
    prepare(sql) {
      const namedParams = [...sql.matchAll(/@(\w+)/g)].map(m => m[1]);
      return {
        run: (...params) => {
          const flat = prepareParams(params, namedParams);
          const r = execRequest(sql, flat);
          return Promise.resolve({ changes: r.affectedRowCount, lastInsertRowid: r.lastInsertRowid });
        },
        get: (...params) => {
          const flat = prepareParams(params, namedParams);
          const r = execRequest(sql, flat);
          return Promise.resolve(r.rows[0] ? rowToObj(r.rows[0], r.columns) : undefined);
        },
        all: (...params) => {
          const flat = prepareParams(params, namedParams);
          const r = execRequest(sql, flat);
          return Promise.resolve(r.rows.map(row => rowToObj(row, r.columns)));
        }
      };
    },
    exec: (sql) => { execRequest(sql, []); return Promise.resolve(); },
    batch: (statements) => Promise.resolve(execBatch(statements)),
    pragma: () => {},
    close: () => {}
  };
}

function createSQLiteClient() {
  const Database = require('better-sqlite3');
  const db = new Database(path.join(__dirname, 'database.sqlite'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const origPrepare = db.prepare.bind(db);
  const origExec = db.exec.bind(db);
  const origTransaction = db.transaction.bind(db);

  return {
    prepare(sql) {
      const stmt = origPrepare(sql);
      const namedParams = [...sql.matchAll(/@(\w+)/g)].map(m => m[1]);
      return {
        run: (...params) => {
          const flat = prepareParams(params, namedParams);
          const r = stmt.run(...flat);
          return Promise.resolve({ changes: r.changes, lastInsertRowid: Number(r.lastInsertRowid) });
        },
        get: (...params) => {
          const flat = prepareParams(params, namedParams);
          return Promise.resolve(stmt.get(...flat));
        },
        all: (...params) => {
          const flat = prepareParams(params, namedParams);
          return Promise.resolve(stmt.all(...flat));
        }
      };
    },
    exec: (sql) => { origExec(sql); return Promise.resolve(); },
    batch: (statements) => {
      const fn = origTransaction(() => {
        return statements.map(s => {
          try {
            const stmt = origPrepare(s.sql);
            const r = stmt.run(...(s.params || []));
            return { ok: true, changes: r.changes };
          } catch (e) {
            return { ok: false, error: e.message };
          }
        });
      });
      return Promise.resolve(fn());
    },
    pragma: (s) => db.pragma(s),
    close: () => db.close()
  };
}

function createMySQLClient(config) {
  const mysql = require('mysql2/promise');

  let conn;

  async function getConn() {
    if (!conn) {
      conn = await mysql.createConnection({
        host: config.host,
        port: config.port || 3306,
        user: config.user,
        password: config.password,
        database: config.database,
        multipleStatements: true
      });
    }
    return conn;
  }

  function rowToObj(row, columns) {
    if (!row) return undefined;
    if (typeof row === 'object' && !Array.isArray(row)) return row;
    const obj = {};
    for (let i = 0; i < columns.length; i++) {
      obj[columns[i]] = row[i];
    }
    return obj;
  }

  function convertSql(sql) {
    let idx = 0;
    return sql.replace(/@(\w+)/g, () => '?');
  }

  return {
    prepare(sql) {
      const mysqlSql = convertSql(sql);
      const namedParams = [...sql.matchAll(/@(\w+)/g)].map(m => m[1]);
      return {
        run: async (...params) => {
          const c = await getConn();
          const flat = prepareParams(params, namedParams);
          const [result] = await c.execute(mysqlSql, flat);
          return { changes: result.affectedRows, lastInsertRowid: result.insertId };
        },
        get: async (...params) => {
          const c = await getConn();
          const flat = prepareParams(params, namedParams);
          const [rows, cols] = await c.execute(mysqlSql, flat);
          const columns = cols.map(c => c.name);
          return rows[0] ? rowToObj(rows[0], columns) : undefined;
        },
        all: async (...params) => {
          const c = await getConn();
          const flat = prepareParams(params, namedParams);
          const [rows, cols] = await c.execute(mysqlSql, flat);
          const columns = cols.map(c => c.name);
          return rows.map(row => rowToObj(row, columns));
        }
      };
    },
    exec: async (sql) => {
      const c = await getConn();
      await c.query(sql);
    },
    batch: async (statements) => {
      const c = await getConn();
      const out = [];
      for (const s of statements) {
        try {
          const [result] = await c.execute(convertSql(s.sql), s.params || []);
          out.push({ ok: true, changes: result.affectedRows });
        } catch (e) {
          out.push({ ok: false, error: e.message });
        }
      }
      return out;
    },
    pragma: () => {},
    close: async () => { if (conn) { await conn.end(); conn = null; } }
  };
}

async function getDatabase() {
  if (dbPromise) return dbPromise;

  if (process.env.MYSQL_HOST) {
    console.log('Conectado ao MySQL');
    dbPromise = createMySQLClient({
      host: process.env.MYSQL_HOST,
      port: parseInt(process.env.MYSQL_PORT || '3306'),
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE
    });
  } else if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
    console.log('Conectado ao Turso Database');
    dbPromise = createTursoClient(process.env.TURSO_DATABASE_URL, process.env.TURSO_AUTH_TOKEN);
  } else {
    console.log('Conectado ao SQLite local');
    dbPromise = createSQLiteClient();
  }

  const db = await dbPromise;
  await initializeDatabase(db);
  await migrateDatabase(db);
  return db;
}

async function initializeDatabase(db) {
  const createTables = [
    `CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      nome TEXT NOT NULL,
      perfil TEXT NOT NULL CHECK(perfil IN ('admin')),
      ativo INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS ativos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      serie_equipamento TEXT,
      serie_ux TEXT,
      status_wxp TEXT,
      localidade_vli TEXT,
      setor TEXT,
      status_geral TEXT,
      evidencias_instalacoes TEXT,
      status_servicenow TEXT,
      chamado_servicenow TEXT,
      especificacao_servicenow TEXT,
      tipo_equipamento TEXT,
      modelo TEXT,
      item TEXT,
      nf TEXT,
      comentario TEXT,
      data_instalacao TEXT,
      data_entrega TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS auditoria (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER,
      usuario_nome TEXT,
      acao TEXT NOT NULL,
      justificativa TEXT,
      ativo_id INTEGER,
      dados_anteriores TEXT,
      dados_novos TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    )`,
    `CREATE TABLE IF NOT EXISTS uploads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ativo_id INTEGER,
      url TEXT NOT NULL,
      public_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ativo_id) REFERENCES ativos(id) ON DELETE CASCADE
    )`
  ];
  for (const sql of createTables) {
    try { await db.exec(sql); } catch (e) {}
  }

  try {
    const userCount = await db.prepare('SELECT COUNT(*) as count FROM usuarios').get();
    if (!userCount || userCount.count === 0) {
      const hash = bcrypt.hashSync('admin123', 10);
      await db.prepare('INSERT INTO usuarios (username, password, nome, perfil) VALUES (?, ?, ?, ?)').run('admin', hash, 'Administrador', 'admin');
      console.log('Usuário admin criado: admin/admin123');
    }
  } catch (e) {
    console.log('Erro ao verificar usuário:', e.message);
  }
}

async function migrateDatabase(db) {
  const migrations = [
    "ALTER TABLE ativos ADD COLUMN setor TEXT",
    "ALTER TABLE ativos ADD COLUMN data_instalacao TEXT",
    "ALTER TABLE ativos ADD COLUMN data_entrega TEXT"
  ];
  for (const sql of migrations) {
    try { await db.exec(sql); } catch (e) {}
  }

  const indexes = [
    "CREATE INDEX IF NOT EXISTS idx_ativos_status_geral ON ativos(status_geral)",
    "CREATE INDEX IF NOT EXISTS idx_ativos_localidade ON ativos(localidade_vli)",
    "CREATE INDEX IF NOT EXISTS idx_ativos_tipo ON ativos(tipo_equipamento)",
    "CREATE INDEX IF NOT EXISTS idx_ativos_setor ON ativos(setor)",
    "CREATE INDEX IF NOT EXISTS idx_ativos_status_wxp ON ativos(status_wxp)",
    "CREATE INDEX IF NOT EXISTS idx_ativos_status_servicenow ON ativos(status_servicenow)",
    "CREATE INDEX IF NOT EXISTS idx_auditoria_created_at ON auditoria(created_at)"
  ];
  for (const sql of indexes) {
    try { await db.exec(sql); } catch (e) {}
  }
}

module.exports = { getDatabase };