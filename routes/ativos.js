const express = require('express');
const { getDatabase } = require('../database');
const { autenticar, adminApenas } = require('../middleware/auth');
const { broadcast } = require('../events');

const router = express.Router();

async function registrarAuditoria(usuario, acao, justificativa, ativoId, dadosAnteriores, dadosNovos) {
  const db = await getDatabase();
  await db.prepare(`
    INSERT INTO auditoria (usuario_id, usuario_nome, acao, justificativa, ativo_id, dados_anteriores, dados_novos)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    usuario.id,
    usuario.nome,
    acao,
    justificativa || null,
    ativoId || null,
    dadosAnteriores ? JSON.stringify(dadosAnteriores) : null,
    dadosNovos ? JSON.stringify(dadosNovos) : null
  );
}

function broadcastEvent(tipo, usuario, ativoId, dados, justificativa) {
  broadcast(tipo, {
    usuario: usuario.nome,
    perfil: usuario.perfil,
    ativo_id: ativoId,
    justificativa: justificativa || '',
    dados
  });
}

router.get('/', async (req, res) => {
  const db = await getDatabase();
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = (page - 1) * limit;

  let where = [];
  let params = [];

  function addInFilter(key, col) {
    const v = req.query[key];
    if (v) {
      const vals = Array.isArray(v) ? v : [v];
      where.push(`${col} IN (${vals.map(() => '?').join(',')})`);
      params.push(...vals);
    }
  }

  addInFilter('status_geral', 'status_geral');
  addInFilter('status_wxp', 'status_wxp');
  addInFilter('status_servicenow', 'status_servicenow');
  addInFilter('localidade_vli', 'localidade_vli');
  addInFilter('setor', 'setor');
  addInFilter('tipo_equipamento', 'tipo_equipamento');
  if (req.query.search) {
    where.push('(serie_equipamento LIKE ? OR serie_ux LIKE ? OR modelo LIKE ? OR nf LIKE ?)');
    const s = `%${req.query.search}%`; params.push(s, s, s, s);
  }
  if (req.query.data_inicio) { where.push('created_at >= ?'); params.push(req.query.data_inicio + ' 00:00:00'); }
  if (req.query.data_fim) { where.push('created_at <= ?'); params.push(req.query.data_fim + ' 23:59:59'); }

  const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
  const total = await db.prepare(`SELECT COUNT(*) as count FROM ativos ${whereClause}`).get(...params);
  const ativos = await db.prepare(`SELECT * FROM ativos ${whereClause} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);

  res.json({ ativos, total: total.count, page, limit });
});

router.get('/:id', async (req, res) => {
  const db = await getDatabase();
  const ativo = await db.prepare('SELECT * FROM ativos WHERE id = ?').get(req.params.id);
  if (!ativo) return res.status(404).json({ erro: 'Ativo não encontrado' });

  const fotos = await db.prepare('SELECT * FROM uploads WHERE ativo_id = ?').all(req.params.id);
  res.json({ ...ativo, fotos });
});

router.post('/', autenticar, adminApenas, async (req, res) => {
  const { justificativa, ...dados } = req.body;

  if (!justificativa || justificativa.trim() === '') {
    return res.status(400).json({ erro: 'Justificativa é obrigatória para criar registros' });
  }

  const db = await getDatabase();
  const result = await db.prepare(`
    INSERT INTO ativos (serie_equipamento, serie_ux, status_wxp, localidade_vli, setor, status_geral,
      evidencias_instalacoes, status_servicenow, chamado_servicenow, especificacao_servicenow,
      tipo_equipamento, modelo, item, nf, comentario, data_instalacao, data_entrega)
    VALUES (@serie_equipamento, @serie_ux, @status_wxp, @localidade_vli, @setor, @status_geral,
      @evidencias_instalacoes, @status_servicenow, @chamado_servicenow, @especificacao_servicenow,
      @tipo_equipamento, @modelo, @item, @nf, @comentario, @data_instalacao, @data_entrega)
  `).run(dados);

  await registrarAuditoria(req.usuario, 'CRIACAO', justificativa, result.lastInsertRowid, null, dados);
  broadcastEvent('ativo_criado', req.usuario, result.lastInsertRowid, { serie: dados.serie_equipamento || dados.serie_ux }, justificativa);

  res.json({ id: result.lastInsertRowid, mensagem: 'Ativo criado com sucesso' });
});

router.put('/:id', autenticar, adminApenas, async (req, res) => {
  const { justificativa, ...dados } = req.body;

  if (!justificativa || justificativa.trim() === '') {
    return res.status(400).json({ erro: 'Justificativa é obrigatória para alterações' });
  }

  const db = await getDatabase();
  const ativoExistente = await db.prepare('SELECT * FROM ativos WHERE id = ?').get(req.params.id);
  if (!ativoExistente) return res.status(404).json({ erro: 'Ativo não encontrado' });

  await db.prepare(`
    UPDATE ativos SET
      serie_equipamento = @serie_equipamento, serie_ux = @serie_ux,
      status_wxp = @status_wxp, localidade_vli = @localidade_vli, setor = @setor,
      status_geral = @status_geral, evidencias_instalacoes = @evidencias_instalacoes,
      status_servicenow = @status_servicenow, chamado_servicenow = @chamado_servicenow,
      especificacao_servicenow = @especificacao_servicenow, tipo_equipamento = @tipo_equipamento,
      modelo = @modelo, item = @item, nf = @nf, comentario = @comentario,
      data_instalacao = @data_instalacao, data_entrega = @data_entrega,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `).run({ ...dados, id: req.params.id });

  await registrarAuditoria(req.usuario, 'ALTERACAO', justificativa, parseInt(req.params.id), ativoExistente, dados);
  const camposAlterados = Object.entries(dados).filter(([k, v]) => ativoExistente[k] != v).map(([k]) => k);
  broadcastEvent('ativo_alterado', req.usuario, parseInt(req.params.id), {
    serie: dados.serie_equipamento || dados.serie_ux || ativoExistente.serie_equipamento,
    campos_alterados: camposAlterados
  }, justificativa);

  res.json({ mensagem: 'Ativo atualizado com sucesso' });
});

router.delete('/:id', autenticar, adminApenas, async (req, res) => {
  const { justificativa } = req.body;

  if (!justificativa || justificativa.trim() === '') {
    return res.status(400).json({ erro: 'Justificativa é obrigatória para exclusão' });
  }

  const db = await getDatabase();
  const ativoExistente = await db.prepare('SELECT * FROM ativos WHERE id = ?').get(req.params.id);
  if (!ativoExistente) return res.status(404).json({ erro: 'Ativo não encontrado' });

  await db.prepare('DELETE FROM uploads WHERE ativo_id = ?').run(req.params.id);
  await db.prepare('DELETE FROM ativos WHERE id = ?').run(req.params.id);

  await registrarAuditoria(req.usuario, 'EXCLUSAO', justificativa, parseInt(req.params.id), ativoExistente, null);
  broadcastEvent('ativo_excluido', req.usuario, parseInt(req.params.id), {
    serie: ativoExistente.serie_equipamento || ativoExistente.serie_ux
  }, justificativa);

  res.json({ mensagem: 'Ativo excluído com sucesso' });
});

router.get('/dashboard/totais', async (req, res) => {
  const db = await getDatabase();

  let where = [];
  let params = [];

  function addInFilter(key, col) {
    const v = req.query[key];
    if (v) {
      const vals = Array.isArray(v) ? v : [v];
      where.push(`${col} IN (${vals.map(() => '?').join(',')})`);
      params.push(...vals);
    }
  }

  addInFilter('localidade_vli', 'localidade_vli');
  addInFilter('status_wxp', 'status_wxp');
  addInFilter('status_servicenow', 'status_servicenow');
  addInFilter('status_geral', 'status_geral');
  addInFilter('tipo_equipamento', 'tipo_equipamento');
  addInFilter('setor', 'setor');

  const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
  const paramsForCount = [...params];

  const statusGeral = await db.prepare(`
    SELECT status_geral, COUNT(*) as total FROM ativos ${whereClause}
    GROUP BY status_geral ORDER BY total DESC
  `).all(...params);

  const tipoEquipamento = await db.prepare(`
    SELECT tipo_equipamento, COUNT(*) as total FROM ativos ${whereClause}
    GROUP BY tipo_equipamento ORDER BY total DESC
  `).all(...params);

  const localidadeVLI = await db.prepare(`
    SELECT localidade_vli, COUNT(*) as total FROM ativos ${whereClause}
    GROUP BY localidade_vli ORDER BY total DESC
  `).all(...params);

  const modelosWhere = whereClause
    ? whereClause + ' AND modelo IS NOT NULL AND modelo != \'\''
    : 'WHERE modelo IS NOT NULL AND modelo != \'\'';
  const modelos = await db.prepare(`
    SELECT modelo, COUNT(*) as total FROM ativos ${modelosWhere}
    GROUP BY modelo ORDER BY total DESC LIMIT 5
  `).all(...params);

  const totalGeral = await db.prepare(`SELECT COUNT(*) as total FROM ativos ${whereClause}`).get(...params);
  const totalPorStatus = await db.prepare(`
    SELECT 
      SUM(CASE WHEN status_geral = 'Em Operação' THEN 1 ELSE 0 END) as em_operacao,
      SUM(CASE WHEN status_geral LIKE '%Estoque%' THEN 1 ELSE 0 END) as em_estoque,
      SUM(CASE WHEN status_geral = 'Em Manutenção' THEN 1 ELSE 0 END) as em_manutencao,
      SUM(CASE WHEN status_geral = 'Backup' OR status_geral = 'Backup em Utilização' THEN 1 ELSE 0 END) as backup,
      SUM(CASE WHEN status_geral NOT IN ('Em Operação','Em Estoque(-60Dias)','Em Estoque(+60Dias)','Em Manutenção','Backup','Backup em Utilização') THEN 1 ELSE 0 END) as outros,
      COUNT(*) as total
    FROM ativos ${whereClause}
  `).get(...params);

  const uxPendentes = await db.prepare(`SELECT COUNT(*) as total FROM ativos ${whereClause ? whereClause + ' AND' : 'WHERE'} (serie_ux IS NULL OR serie_ux = '' OR serie_ux = 'Pendente')`).get(...params);
  const wxpPendentes = await db.prepare(`SELECT COUNT(*) as total FROM ativos ${whereClause ? whereClause + ' AND' : 'WHERE'} (status_wxp IS NULL OR status_wxp = '' OR status_wxp = 'Pendente')`).get(...params);

  const especificacaoSN = await db.prepare(`
    SELECT especificacao_servicenow, COUNT(*) as total FROM ativos ${whereClause}
    GROUP BY especificacao_servicenow ORDER BY total DESC
  `).all(...params);

  res.json({ totalGeral: totalGeral.total, totalPorStatus, statusGeral, tipoEquipamento, localidadeVLI, modelos, uxPendentes: uxPendentes.total, wxpPendentes: wxpPendentes.total, especificacaoSN });
});

router.get('/dashboard/tendencias', async (req, res) => {
  const db = await getDatabase();
  const dataLimite = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  const tendencias = await db.prepare(`
    SELECT
      SUBSTR(created_at, 1, 7) as mes,
      SUM(CASE WHEN acao = 'CRIACAO' THEN 1 ELSE 0 END) as criacoes,
      SUM(CASE WHEN acao = 'ALTERACAO' THEN 1 ELSE 0 END) as alteracoes,
      SUM(CASE WHEN acao = 'EXCLUSAO' THEN 1 ELSE 0 END) as exclusoes,
      COUNT(*) as total
    FROM auditoria
    WHERE created_at >= ?
    GROUP BY SUBSTR(created_at, 1, 7)
    ORDER BY mes ASC
  `).all(dataLimite);

  res.json(tendencias);
});

router.get('/dashboard/advertencias', async (req, res) => {
  const db = await getDatabase();
  const ativos = await db.prepare(`
    SELECT id, serie_equipamento, serie_ux, status_wxp, status_servicenow, status_geral, localidade_vli
    FROM ativos ORDER BY id
  `).all();

  const inconsistencias = [];

  for (const a of ativos) {
    const problemas = [];

    const sg = (a.status_geral || '').trim();
    const ssn = (a.status_servicenow || '').trim();
    const swxp = (a.status_wxp || '').trim();

    if (sg === 'Em Operação' && ssn !== 'Em uso' && ssn !== '') {
      problemas.push({ campo: 'Status ServiceNow', atual: ssn || 'vazio', esperado: 'Em uso' });
    }
    if (sg === 'Em Operação' && swxp === '') {
      problemas.push({ campo: 'Status WXP', atual: 'vazio', esperado: 'preenchido' });
    }
    if ((sg.includes('Estoque') || sg === 'Estoque Simpress' || sg === 'Estoque TI VLI') && ssn !== 'Em estoque' && ssn !== 'Depósito' && ssn !== '') {
      problemas.push({ campo: 'Status ServiceNow', atual: ssn || 'vazio', esperado: 'Em estoque ou Depósito' });
    }
    if (sg === 'Em Manutenção' && ssn !== 'Em trânsito' && ssn !== 'Depósito' && ssn !== '') {
      problemas.push({ campo: 'Status ServiceNow', atual: ssn || 'vazio', esperado: 'Em trânsito ou Depósito' });
    }
    if ((sg === 'Backup' || sg === 'Reservado') && ssn !== 'Em uso' && ssn !== '') {
      problemas.push({ campo: 'Status ServiceNow', atual: ssn || 'vazio', esperado: 'Em uso' });
    }

    if (problemas.length > 0) {
      inconsistencias.push({
        id: a.id,
        serie: a.serie_equipamento || a.serie_ux || '-',
        localidade: a.localidade_vli || '-',
        status_geral: sg,
        status_wxp: a.status_wxp || '',
        status_servicenow: a.status_servicenow || '',
        problemas
      });
    }
  }

  res.json({ total: inconsistencias.length, itens: inconsistencias });
});

router.get('/dashboard/ux-pendentes', async (req, res) => {
  const db = await getDatabase();
  const ativos = await db.prepare(`
    SELECT id, serie_equipamento, serie_ux, status_wxp, status_servicenow, status_geral, localidade_vli, tipo_equipamento, modelo
    FROM ativos WHERE serie_ux IS NULL OR serie_ux = '' OR serie_ux = 'Pendente' ORDER BY id
  `).all();
  const itens = ativos.map(a => ({
    ...a,
    motivo: `Status UX: "${a.serie_ux || 'vazio'}" → Pendente`
  }));
  res.json({ total: itens.length, itens });
});

router.get('/dashboard/wxp-pendentes', async (req, res) => {
  const db = await getDatabase();
  const ativos = await db.prepare(`
    SELECT id, serie_equipamento, serie_ux, status_wxp, status_servicenow, status_geral, localidade_vli, tipo_equipamento, modelo
    FROM ativos WHERE status_wxp IS NULL OR status_wxp = '' OR status_wxp = 'Pendente' ORDER BY id
  `).all();
  const itens = ativos.map(a => ({
    ...a,
    motivo: `Status WXP: "${a.status_wxp || 'vazio'}" → Pendente`
  }));
  res.json({ total: itens.length, itens });
});

router.get('/dashboard/atividades-recentes', async (req, res) => {
  const db = await getDatabase();
  const atividades = await db.prepare(`
    SELECT a.*, COALESCE(ati.serie_equipamento, ati.serie_ux, 'N/A') as serie
    FROM auditoria a
    LEFT JOIN ativos ati ON a.ativo_id = ati.id
    ORDER BY a.created_at DESC LIMIT 20
  `).all();

  res.json(atividades);
});

router.get('/filtros/opcoes', async (req, res) => {
  const db = await getDatabase();

  const localidades = await db.prepare("SELECT DISTINCT localidade_vli FROM ativos WHERE localidade_vli IS NOT NULL AND localidade_vli != '' ORDER BY localidade_vli").all();
  const setores = await db.prepare("SELECT DISTINCT setor FROM ativos WHERE setor IS NOT NULL AND setor != '' ORDER BY setor").all();
  const statusGeraisDB = await db.prepare("SELECT DISTINCT status_geral FROM ativos WHERE status_geral IS NOT NULL AND status_geral != '' ORDER BY status_geral").all();
  const statusFixos = ['Em Operação', 'Em Estoque(-60Dias)', 'Em Estoque(+60Dias)', 'Reservado', 'Backup', 'Backup em Uso', 'Estoque TI VLI', 'Homologação', 'Processo de Entrega', 'Estoque Não Localizado', 'Em Manutenção', 'SAP Configurado'];
  const statusGeraisSet = new Set(statusGeraisDB.map(s => s.status_geral));
  statusFixos.forEach(s => statusGeraisSet.add(s));
  const statusGerais = [...statusGeraisSet].sort((a, b) => a.localeCompare(b));
  const statusWxp = await db.prepare("SELECT DISTINCT status_wxp FROM ativos WHERE status_wxp IS NOT NULL AND status_wxp != '' ORDER BY status_wxp").all();
  const statusServiceNow = await db.prepare("SELECT DISTINCT status_servicenow FROM ativos WHERE status_servicenow IS NOT NULL AND status_servicenow != '' ORDER BY status_servicenow").all();
  const tipos = await db.prepare("SELECT DISTINCT tipo_equipamento FROM ativos WHERE tipo_equipamento IS NOT NULL AND tipo_equipamento != '' ORDER BY tipo_equipamento").all();

  res.json({
    localidades: localidades.map(l => l.localidade_vli),
    setores: setores.map(s => s.setor),
    statusGerais,
    statusWxp: statusWxp.map(s => s.status_wxp),
    statusServiceNow: statusServiceNow.map(s => s.status_servicenow),
    tipos: tipos.map(t => t.tipo_equipamento)
  });
});

module.exports = router;
