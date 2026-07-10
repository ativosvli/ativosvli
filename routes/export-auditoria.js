const express = require('express');
const XLSX = require('xlsx');
const { getDatabase } = require('../database');
const { autenticar } = require('../middleware/auth');

const router = express.Router();

router.get('/', async (req, res) => {
  const db = await getDatabase();

  let query = `SELECT a.*, COALESCE(ati.serie_equipamento, ati.serie_ux, 'N/A') as serie FROM auditoria a LEFT JOIN ativos ati ON a.ativo_id = ati.id`;
  let where = [];
  let params = [];

  if (req.query.data_inicio) { where.push('a.created_at >= ?'); params.push(req.query.data_inicio + ' 00:00:00'); }
  if (req.query.data_fim) { where.push('a.created_at <= ?'); params.push(req.query.data_fim + ' 23:59:59'); }
  if (req.query.acao) { where.push('a.acao = ?'); params.push(req.query.acao); }

  if (where.length > 0) query += ' WHERE ' + where.join(' AND ');
  query += ' ORDER BY a.created_at DESC';

  const registros = await db.prepare(query).all(...params);

  const camposExclusao = ['serie_equipamento','serie_ux','status_wxp','localidade_vli','setor','status_geral','status_servicenow','tipo_equipamento','modelo','item','nf','comentario','data_instalacao','data_entrega'];

  const dadosPlanilha = registros.map(r => {
    let serie = r.serie || 'N/A';
    const linha = {
      'ID': r.id,
      'Data/Hora': new Date(r.created_at).toLocaleString('pt-BR'),
      'Usuário': r.usuario_nome || '',
      'Ação': r.acao === 'CRIACAO' ? 'Criação' : r.acao === 'ALTERACAO' ? 'Alteração' : r.acao === 'EXCLUSAO' ? 'Exclusão' : r.acao,
      'Ativo': serie,
      'Justificativa': r.justificativa || '',
      'Ativo ID': r.ativo_id || ''
    };
    if (r.acao === 'EXCLUSAO' && r.dados_anteriores) {
      try {
        const ant = JSON.parse(r.dados_anteriores);
        if (ant.serie_equipamento || ant.serie_ux) {
          linha['Ativo'] = ant.serie_equipamento || ant.serie_ux || serie;
        }
        for (const campo of camposExclusao) {
          if (ant[campo] != null && ant[campo] !== '') {
            linha[`Excluído - ${campo}`] = ant[campo];
          }
        }
      } catch (e) {}
    }
    return linha;
  });

  const ws = XLSX.utils.json_to_sheet(dadosPlanilha);
  ws['!cols'] = [{ wch: 8 }, { wch: 22 }, { wch: 18 }, { wch: 12 }, { wch: 25 }, { wch: 35 }, { wch: 10 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Auditoria');

  const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  const nome = `auditoria_${new Date().toISOString().slice(0, 10)}.xlsx`;

  res.json({ base64, nome });
});

module.exports = router;
