const path = require('path');
const bcrypt = require('bcryptjs');

let db;

function createLibSqlWrapper(client) {
  return {
    prepare(sql) {
      return {
        run(...params) {
          const stmt = { sql, args: params.filter(p => p !== undefined) };
          const result = client.execute(stmt);
          return { changes: Number(result.rowsAffected), lastInsertRowid: Number(result.lastInsertRowid) };
        },
        get(...params) {
          const stmt = { sql, args: params.filter(p => p !== undefined) };
          const result = client.execute(stmt);
          return result.rows[0] || undefined;
        },
        all(...params) {
          const stmt = { sql, args: params.filter(p => p !== undefined) };
          const result = client.execute(stmt);
          return result.rows;
        }
      };
    },
    exec(sql) {
      client.execute({ sql });
    },
    pragma() {}
  };
}

function getDatabase() {
  if (db) return db;

  if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
    const { createClient } = require('@libsql/client');
    const client = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN
    });
    db = createLibSqlWrapper(client);
    console.log('Conectado ao Turso Database');
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
  db.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      nome TEXT NOT NULL,
      perfil TEXT NOT NULL CHECK(perfil IN ('admin')),
      ativo INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS ativos (
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS auditoria (
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
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS uploads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ativo_id INTEGER,
      url TEXT NOT NULL,
      public_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ativo_id) REFERENCES ativos(id) ON DELETE CASCADE
    )
  `);

  const userCount = db.prepare('SELECT COUNT(*) as count FROM usuarios').get();
  if (!userCount || userCount.count === 0) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare('INSERT INTO usuarios (username, password, nome, perfil) VALUES (?, ?, ?, ?)').run('admin', hash, 'Administrador', 'admin');
    console.log('Usuário admin criado: admin/admin123');
  }
}

function migrateDatabase() {
  try {
    db.exec("ALTER TABLE ativos ADD COLUMN setor TEXT");
  } catch (e) {}
}

module.exports = { getDatabase };