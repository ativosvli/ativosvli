const express = require('express');
const XLSX = require('xlsx');
const { getDatabase } = require('../database');
const { autenticar } = require('../middleware/auth');

const router = express.Router();

router.get('/', autenticar, (req, res) => {
  const db = getDatabase();
  const usuario = req.usuario;
  const dataStr = new Date().toLocaleDateString('pt-BR');
  const horaStr = new Date().toLocaleTimeString('pt-BR');

  let query = 'SELECT * FROM ativos';
  let params = [];
  let where = [];

  if (req.query.status_geral) {
    where.push('status_geral = ?');
    params.push(req.query.status_geral);
  }
  if (req.query.localidade_vli) {
    where.push('localidade_vli = ?');
    params.push(req.query.localidade_vli);
  }
  if (req.query.setor) {
    where.push('setor = ?');
    params.push(req.query.setor);
  }
  if (req.query.tipo_equipamento) {
    where.push('tipo_equipamento = ?');
    params.push(req.query.tipo_equipamento);
  }

  if (where.length > 0) {
    query += ' WHERE ' + where.join(' AND ');
  }

  query += ' ORDER BY id DESC';

  const ativos = db.prepare(query).all(...params);

  const totalAtivos = ativos.length;

  const infoHeader = [
    { '': `Exportado por: ${usuario.nome}` },
    { '': `Data: ${dataStr} às ${horaStr}` },
    { '': `Total de registros: ${totalAtivos}` },
  ];

  const dadosPlanilha = ativos.map(a => ({
    'Série MAPA': a.serie_equipamento || '',
    'Status UX': a.serie_ux || '',
    'Status WXP': a.status_wxp || '',
    'Localidade VLI': a.localidade_vli || '',
    'Status Geral': a.status_geral || '',
    'Evidências Instalações': a.evidencias_instalacoes || '',
    'Status ServiceNow': a.status_servicenow || '',
    'Chamado ServiceNOW': a.chamado_servicenow || '',
    'Especificação ServiceNow': a.especificacao_servicenow || '',
    'Tipo Equipamento': a.tipo_equipamento || '',
    'Modelo': a.modelo || '',
    'NF': a.nf || '',
    'Observações': a.comentario || ''
  }));

  const ws = XLSX.utils.json_to_sheet(dadosPlanilha);

  XLSX.utils.sheet_add_aoa(ws, infoHeader, { origin: 'A1' });

  const headerRowIndex = infoHeader.length;
  const colWidths = [
    { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 25 },
    { wch: 20 }, { wch: 15 }, { wch: 20 }, { wch: 25 }, { wch: 25 },
    { wch: 40 }, { wch: 15 }, { wch: 30 }
  ];
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Ativos');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  db.prepare(`
    INSERT INTO auditoria (usuario_id, usuario_nome, acao, justificativa, dados_novos)
    VALUES (?, ?, 'EXPORTACAO', ?, ?)
  `).run(usuario.id, usuario.nome, `Exportação de ${totalAtivos} registros`, JSON.stringify({
    total_registros: totalAtivos,
    filtros: req.query
  }));

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=ativos_${new Date().toISOString().slice(0, 10)}.xlsx`);
  res.send(buffer);
});

module.exports = router;
