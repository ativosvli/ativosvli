const express = require('express');
const { getDatabase } = require('../database');
const { autenticar } = require('../middleware/auth');

const router = express.Router();

router.get('/', (req, res) => {
  const db = getDatabase();
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 100;
  const offset = (page - 1) * limit;

  const total = db.prepare('SELECT COUNT(*) as count FROM auditoria').get();
  const registros = db.prepare(`
    SELECT * FROM auditoria ORDER BY created_at DESC LIMIT ? OFFSET ?
  `).all(limit, offset);

  res.json({ registros, total: total.count, page, limit });
});

router.get('/ativo/:ativoId', (req, res) => {
  const db = getDatabase();
  const registros = db.prepare(`
    SELECT * FROM auditoria WHERE ativo_id = ? ORDER BY created_at DESC
  `).all(req.params.ativoId);

  res.json(registros);
});

module.exports = router;
