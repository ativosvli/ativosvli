const express = require('express');
const XLSX = require('xlsx');
const { getDatabase } = require('../database');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    // Auth manual para debug
    const token = req.session?.token || req.headers.authorization?.replace('Bearer ', '');
    console.log('Export - session token:', !!req.session?.token, 'auth header:', !!req.headers.authorization);
    if (!token) {
      return res.status(401).json({ erro: 'Não autenticado - nenhum token encontrado' });
    }
    let usuario;
    try {
      usuario = require('jsonwebtoken').verify(token, process.env.JWT_SECRET || 'jwt-gestao-key-2024');
    } catch (e) {
      return res.status(401).json({ erro: 'Token inválido: ' + e.message });
    }
  const dataStr = new Date().toLocaleDateString('pt-BR');
  const horaStr = new Date().toLocaleTimeString('pt-BR');
  const db = getDatabase();

  const colunas = 'serie_equipamento, serie_ux, status_wxp, localidade_vli, status_geral, evidencias_instalacoes, status_servicenow, chamado_servicenow, especificacao_servicenow, tipo_equipamento, modelo, nf, comentario';
  let where = [];
  let params = [];

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

  const whereClause = where.length > 0 ? ' WHERE ' + where.join(' AND ') : '';
  const totalCount = db.prepare(`SELECT COUNT(*) as total FROM ativos${whereClause}`).get(...params).total;

  let ativos = [];
  const pageSize = 500;
  for (let page = 0; page * pageSize < totalCount; page++) {
    const batch = db.prepare(`SELECT ${colunas} FROM ativos${whereClause} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, pageSize, page * pageSize);
    ativos = ativos.concat(batch);
  }

  const totalAtivos = ativos.length;

  const infoHeader = [
    [`Exportado por: ${usuario.nome}`],
    [`Data: ${dataStr} às ${horaStr}`],
    [`Total de registros: ${totalAtivos}`],
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

  const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  const nomeArquivo = `ativos_${new Date().toISOString().slice(0, 10)}.xlsx`;

  db.prepare(`
    INSERT INTO auditoria (usuario_id, usuario_nome, acao, justificativa, dados_novos)
    VALUES (?, ?, 'EXPORTACAO', ?, ?)
  `).run(usuario.id, usuario.nome, `Exportação de ${totalAtivos} registros`, JSON.stringify({
    total_registros: totalAtivos,
    filtros: req.query
  }));

  res.json({ base64, nome: nomeArquivo });
  } catch (err) {
    console.error('ERRO EXPORT:', err.message, err.stack);
    res.status(500).json({ erro: 'Erro ao exportar', detalhe: err.message });
  }
});

module.exports = router;
