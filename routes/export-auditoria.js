const express = require('express');
const XLSX = require('xlsx');
const { getDatabase } = require('../database');
const { autenticar } = require('../middleware/auth');

const router = express.Router();

router.get('/', (req, res) => {
  const db = getDatabase();

  let query = `SELECT a.*, COALESCE(ati.serie_equipamento, ati.serie_ux, 'N/A') as serie FROM auditoria a LEFT JOIN ativos ati ON a.ativo_id = ati.id`;
  let where = [];
  let params = [];

  if (req.query.data_inicio) { where.push('a.created_at >= ?'); params.push(req.query.data_inicio + ' 00:00:00'); }
  if (req.query.data_fim) { where.push('a.created_at <= ?'); params.push(req.query.data_fim + ' 23:59:59'); }
  if (req.query.acao) { where.push('a.acao = ?'); params.push(req.query.acao); }

  if (where.length > 0) query += ' WHERE ' + where.join(' AND ');
  query += ' ORDER BY a.created_at DESC';

  const registros = db.prepare(query).all(...params);

  const dadosPlanilha = registros.map(r => {
    let serie = r.serie || 'N/A';
    let detalhes = '';
    if (r.acao === 'EXCLUSAO' && r.dados_anteriores) {
      try {
        const ant = JSON.parse(r.dados_anteriores);
        serie = ant.serie_equipamento || ant.serie_ux || serie;
        const campos = ['serie_equipamento','serie_ux','status_wxp','localidade_vli','setor','status_geral','status_servicenow','tipo_equipamento','modelo','item','nf','comentario'];
        detalhes = campos.filter(k => ant[k]).map(k => `${k}: ${ant[k]}`).join('; ');
      } catch (e) {}
    }
    return {
      'ID': r.id,
      'Data/Hora': new Date(r.created_at).toLocaleString('pt-BR'),
      'Usuário': r.usuario_nome || '',
      'Ação': r.acao === 'CRIACAO' ? 'Criação' : r.acao === 'ALTERACAO' ? 'Alteração' : r.acao === 'EXCLUSAO' ? 'Exclusão' : r.acao,
      'Ativo': serie,
      'Justificativa': r.justificativa || '',
      'Ativo ID': r.ativo_id || '',
      'Detalhes Exclusão': detalhes
    };
  });

  const ws = XLSX.utils.json_to_sheet(dadosPlanilha);
  ws['!cols'] = [{ wch: 8 }, { wch: 22 }, { wch: 18 }, { wch: 12 }, { wch: 25 }, { wch: 35 }, { wch: 10 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Auditoria');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=auditoria_${new Date().toISOString().slice(0, 10)}.xlsx`);
  res.send(buffer);
});

module.exports = router;
