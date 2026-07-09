let paginaAtual = 1;
let totalAtivos = 0;
let ativoEditandoId = null;
let ultimoAtivoVisualizado = null;

const STATUS_GERAIS = ['Em Operação', 'Em Estoque(-60Dias)', 'Em Estoque(+60Dias)', 'Reservado', 'Backup', 'Backup em Uso', 'Estoque TI VLI', 'Homologação', 'Processo de Entrega', 'Estoque Não Localizado', 'Em Manutenção', 'Backup em Utilização', 'SAP Configurado'];

document.addEventListener('DOMContentLoaded', () => {
  carregarFiltrosDrop();
  carregarAtivos();
  const user = getUsuario();
  const navUsers = document.getElementById('navUsuarios');
  if (navUsers) navUsers.style.display = user && user.id === 1 ? '' : 'none';
});

function carregarFiltrosDrop() {
  populateMS('msStatus', STATUS_GERAIS);

  fetch('/api/ativos/filtros/opcoes', {
    headers: { 'Authorization': `Bearer ${getToken()}` }
  })
  .then(r => r.json())
  .then(data => {
    populateMS('msTipo', data.tipos || []);
    populateMS('msLocalidade', data.localidades || []);

    const localidades = data.localidades || [];
    ['localidade_vli', 'dEdit_localidade_vli'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el._opcoes = localidades;
        el.addEventListener('focus', function() { mostrarSugestoes(this); });
        el.addEventListener('input', function() { mostrarSugestoes(this); });
        el.addEventListener('blur', function() {
          setTimeout(() => { const s = document.getElementById('sugestoesLocalidade'); if (s) s.style.display = 'none'; }, 200);
        });
      }
    });
  })
  .catch(() => {});
}

  function buildMSQuery(url, id, paramName) {
    const vals = getMSValues(id);
    if (vals.length) {
      url += (url.includes('?') ? '&' : '?') + vals.map(v => `${paramName}=${encodeURIComponent(v)}`).join('&');
    }
    return url;
  }

  async function carregarAtivos() {
    try {
      const busca = document.getElementById('filtroBusca').value.trim();

      let url = `/api/ativos?page=${paginaAtual}&limit=100`;
      url = buildMSQuery(url, 'msLocalidade', 'localidade_vli');
      url = buildMSQuery(url, 'msStatus', 'status_geral');
      url = buildMSQuery(url, 'msTipo', 'tipo_equipamento');
      if (busca) url += `&search=${encodeURIComponent(busca)}`;

    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    if (res.status === 401) { window.location.href = '/'; return; }
    const data = await res.json();
    totalAtivos = data.total;
    document.getElementById('totalBadge').textContent = `${data.total} registros`;
    renderTabela(data.ativos);
    renderPaginacao(data.total);
  } catch (err) {
    console.error('Erro ao carregar ativos:', err);
  }
}

function getStatusClass(status) {
  if (status === 'Em Operação') return 'status-operacao';
  if (status?.includes('Estoque')) return 'status-estoque';
  if (status === 'Em Manutenção') return 'status-manutencao';
  if (status === 'Backup' || status === 'Backup em Utilização' || status === 'Backup em Uso') return 'status-backup';
  return 'status-outros';
}

function renderTabela(ativos) {
  const tbody = document.getElementById('tabelaAtivos');
  const user = getUsuario();
  const isAdmin = user && user.perfil === 'admin';

  if (ativos.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11"><div class="empty-state"><div class="empty-icon">📦</div><h4>Nenhum ativo encontrado</h4><p>Tente ajustar os filtros ou importar uma planilha</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = ativos.map(a => {
    const sc = getStatusClass(a.status_geral);

    return `<tr>
      <td>${a.localidade_vli || '-'}</td>
      <td>${a.serie_ux || '-'}</td>
      <td>${a.status_wxp || '-'}</td>
      <td><span class="status-badge ${sc}">${a.status_geral || '-'}</span></td>
      <td>${a.status_servicenow || '-'}</td>
      <td>${a.especificacao_servicenow || '-'}</td>
      <td><strong>${a.serie_equipamento || '-'}</strong></td>
      <td>${a.tipo_equipamento || '-'}</td>
      <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${a.modelo || ''}">${a.modelo ? a.modelo.slice(0, 30) + '...' : '-'}</td>
      <td style="white-space:nowrap;">${a.created_at ? new Date(a.created_at).toLocaleDateString('pt-BR') : '-'}</td>
      <td class="acoes-cell" style="min-width:200px;">
        <button class="btn btn-info btn-sm" onclick="visualizarAtivo(${a.id})">Detalhes</button>
        ${isAdmin ? `
          <button class="btn btn-warning btn-sm" onclick="editarAtivo(${a.id})">Editar</button>
          <button class="btn btn-danger btn-sm" onclick="excluirAtivo(${a.id})">Excluir</button>
        ` : ''}
      </td>
    </tr>`;
  }).join('');
}

function limparFiltrosAtivos() {
  clearMS('msLocalidade');
  clearMS('msStatus');
  clearMS('msTipo');
  document.getElementById('filtroBusca').value = '';
  paginaAtual = 1;
  carregarAtivos();
}

function renderPaginacao(total) {
  const totalPaginas = Math.ceil(total / 100);
  document.getElementById('infoPagina').textContent = `Página ${paginaAtual} de ${totalPaginas || 1} (${total} registros)`;
  document.getElementById('btnAnterior').disabled = paginaAtual <= 1;
  document.getElementById('btnProximo').disabled = paginaAtual >= totalPaginas;
}

function mudarPagina(direcao) {
  paginaAtual += direcao;
  carregarAtivos();
}

async function editarAtivo(id) {
  try {
    const res = await fetch(`/api/ativos/${id}`, {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    const ativo = await res.json();

    ativoEditandoId = id;
    document.getElementById('modalAtivoTitulo').querySelector('span').textContent = 'Editar Ativo';
    document.getElementById('btnSalvarAtivo').textContent = 'Salvar Alterações';
    preencherFormulario(ativo);
    document.getElementById('fotosAtivo').style.display = 'block';
    renderFotos('previewFotos', ativo.fotos || []);
    abrirModal('modalAtivo');
  } catch (err) {
    mostrarToast('Erro ao carregar ativo', 'error');
  }
}

async function visualizarAtivo(id) {
  try {
    const res = await fetch(`/api/ativos/${id}`, {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    const ativo = await res.json();
    ultimoAtivoVisualizado = id;

    document.getElementById('detalheId').textContent = `#${ativo.id}`;
    preencherDetalhe('det_serie_equipamento', ativo.serie_equipamento);
    preencherDetalhe('det_serie_ux', ativo.serie_ux);
    preencherDetalhe('det_status_wxp', ativo.status_wxp);
    preencherDetalhe('det_localidade_vli', ativo.localidade_vli);
    preencherDetalhe('det_setor', ativo.setor);
    preencherDetalheStatus(ativo.status_geral);
    preencherDetalhe('det_data_instalacao', ativo.data_instalacao);
    preencherDetalhe('det_data_entrega', ativo.data_entrega);
    preencherDetalhe('det_evidencias_instalacoes', ativo.evidencias_instalacoes, ativo.evidencias_instalacoes === 'Enviado' ? '📸 ' : ativo.evidencias_instalacoes === 'Pendente' ? '⏳ ' : '');
    preencherDetalhe('det_status_servicenow', ativo.status_servicenow);
    preencherDetalhe('det_chamado_servicenow', ativo.chamado_servicenow);
    preencherDetalhe('det_especificacao_servicenow', ativo.especificacao_servicenow);
    preencherDetalhe('det_tipo_equipamento', ativo.tipo_equipamento);
    preencherDetalhe('det_modelo', ativo.modelo);
    preencherDetalhe('det_item', ativo.item);
    preencherDetalhe('det_nf', ativo.nf);
    preencherDetalhe('det_comentario', ativo.comentario);

    const fotosContainer = document.getElementById('det_preview_fotos');
    if (ativo.fotos && ativo.fotos.length > 0) {
      document.getElementById('det_fotos').style.display = 'block';
      fotosContainer.innerHTML = ativo.fotos.map(f => `<img src="${f.url}" alt="Foto" loading="lazy">`).join('');
    } else {
      document.getElementById('det_fotos').style.display = 'none';
    }

    const qrUrl = encodeURIComponent(`${window.location.origin}/ativos.html?id=${ativo.id}`);
    document.getElementById('detQrImg').src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${qrUrl}`;

    const user = getUsuario();
    document.getElementById('btnEditarDetalhe').style.display = user?.perfil === 'admin' ? '' : 'none';

    carregarHistorico(id);

    abrirModal('modalDetalhes');
  } catch (err) {
    mostrarToast('Erro ao carregar detalhes', 'error');
  }
}

function preencherDetalhe(elementId, valor, prefixo = '') {
  const el = document.getElementById(elementId);
  if (el) el.textContent = valor ? prefixo + valor : '-';
}

function preencherDetalheStatus(status) {
  const el = document.getElementById('det_status_geral');
  if (!el) return;
  const sc = getStatusClass(status);
  el.innerHTML = status ? `<span class="status-badge ${sc}">${status}</span>` : '-';
}

async function carregarHistorico(ativoId) {
  try {
    const res = await fetch(`/api/auditoria/ativo/${ativoId}`, {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    const registros = await res.json();
    const container = document.getElementById('det_historico');

    if (!registros || registros.length === 0) {
      container.innerHTML = '<p style="color:var(--text-muted);font-size:13px;">Nenhuma alteração registrada</p>';
      return;
    }

    container.innerHTML = registros.map(r => `
      <div style="padding:8px 10px;border-left:2px solid ${
        r.acao === 'CRIACAO' ? 'var(--success)' : r.acao === 'ALTERACAO' ? 'var(--accent)' : 'var(--danger)'
      };margin-bottom:6px;background:var(--table-stripe);border-radius:0 6px 6px 0;font-size:12px;">
        <strong style="color:${
          r.acao === 'CRIACAO' ? 'var(--success)' : r.acao === 'ALTERACAO' ? 'var(--accent)' : 'var(--danger)'
        };">${r.acao === 'CRIACAO' ? 'Criação' : r.acao === 'ALTERACAO' ? 'Alteração' : 'Exclusão'}</strong>
        <span style="color:var(--text-secondary);">por ${r.usuario_nome}</span>
        ${r.justificativa ? `<span style="display:block;color:var(--text-muted);font-style:italic;margin-top:2px;">"${r.justificativa}"</span>` : ''}
        <span style="display:block;color:var(--text-muted);font-size:11px;margin-top:2px;">${new Date(r.created_at).toLocaleString('pt-BR')}</span>
      </div>
    `).join('');
  } catch (err) {
    document.getElementById('det_historico').innerHTML = '<p style="color:var(--text-muted);font-size:13px;">Erro ao carregar histórico</p>';
  }
}

function editarDoDetalhe() {
  fecharModal('modalDetalhes');
  if (ultimoAtivoVisualizado) {
    setTimeout(() => editarAtivo(ultimoAtivoVisualizado), 300);
  }
}

function renderFotos(containerId, fotos) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!fotos || fotos.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted);font-size:13px;">Nenhuma foto anexada</p>';
    return;
  }
  container.innerHTML = fotos.map(f => `<img src="${f.url}" alt="Foto" loading="lazy">`).join('');
}

function limparFormulario() {
  const campos = ['serie_equipamento','serie_ux','status_wxp','localidade_vli','setor','status_geral',
    'evidencias_instalacoes','status_servicenow','chamado_servicenow','especificacao_servicenow',
    'tipo_equipamento','modelo','item','nf','comentario','data_instalacao','data_entrega'];
  campos.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
}

function preencherFormulario(ativo) {
  const campos = ['serie_equipamento','serie_ux','status_wxp','localidade_vli','setor','status_geral',
    'evidencias_instalacoes','status_servicenow','chamado_servicenow','especificacao_servicenow',
    'tipo_equipamento','modelo','item','nf','comentario','data_instalacao','data_entrega'];
  campos.forEach(campo => { const el = document.getElementById(campo); if (el) el.value = ativo[campo] || ''; });
}

function habilitarCampos() {
  document.querySelectorAll('#modalAtivo input, #modalAtivo select, #modalAtivo textarea').forEach(el => el.disabled = false);
  document.getElementById('btnSalvarAtivo').style.display = '';
  const botoes = document.querySelector('#modalAtivo .form-buttons');
  botoes.innerHTML = `
    <button class="btn btn-outline" onclick="fecharModal('modalAtivo')">Cancelar</button>
    <button class="btn btn-primary" id="btnSalvarAtivo" onclick="salvarAtivo()">Salvar</button>`;
}

function salvarAtivo() {
  const dados = {};
  const campos = ['serie_equipamento','serie_ux','status_wxp','localidade_vli','setor','status_geral',
    'evidencias_instalacoes','status_servicenow','chamado_servicenow','especificacao_servicenow',
    'tipo_equipamento','modelo','item','nf','comentario','data_instalacao','data_entrega'];
  campos.forEach(campo => { dados[campo] = document.getElementById(campo).value; });

  fecharModal('modalAtivo');

  document.getElementById('justificativaInput').value = '';
  abrirModal('modalJustificativa');
  acaoPendenteJustificativa = {
    acao: 'salvar',
    callback: async (justificativa) => {
      dados.justificativa = justificativa;
      try {
        const url = ativoEditandoId ? `/api/ativos/${ativoEditandoId}` : '/api/ativos';
        const method = ativoEditandoId ? 'PUT' : 'POST';
        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
          body: JSON.stringify(dados)
        });
        const result = await res.json();
        if (!res.ok) { mostrarToast(result.erro || 'Erro ao salvar', 'error'); return; }
        if (ultimoAtivoVisualizado) fecharModal('modalDetalhes');
        mostrarToast(ativoEditandoId ? 'Ativo atualizado com sucesso!' : 'Ativo criado com sucesso!');
        carregarAtivos();
      } catch (err) { mostrarToast('Erro ao salvar ativo', 'error'); }
    }
  };
}

let excluirPendenteId = null;
let excluirPendenteSerie = null;

async function excluirAtivo(id) {
  try {
    const res = await fetch(`/api/ativos/${id}`, {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    const ativo = await res.json();
    if (!res.ok) { mostrarToast('Erro ao carregar ativo', 'error'); return; }

    excluirPendenteId = id;
    excluirPendenteSerie = (ativo.serie_equipamento || ativo.serie_ux || '').toLowerCase();
    document.getElementById('inputSerieExclusao').value = '';
    document.getElementById('erroSerieExclusao').style.display = 'none';
    abrirModal('modalConfirmarExclusao');
  } catch (err) {
    mostrarToast('Erro ao carregar ativo', 'error');
  }
}

function confirmarSerieExclusao() {
  const digitado = document.getElementById('inputSerieExclusao').value.trim().toLowerCase();
  if (digitado !== excluirPendenteSerie) {
    document.getElementById('erroSerieExclusao').style.display = 'block';
    return;
  }

  fecharModal('modalConfirmarExclusao');
  solicitarJustificativa('excluir', async (justificativa) => {
    try {
      const res = await fetch(`/api/ativos/${excluirPendenteId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify({ justificativa })
      });
      const result = await res.json();
      if (!res.ok) { mostrarToast(result.erro || 'Erro ao excluir', 'error'); return; }
      fecharModal('modalDetalhes');
      mostrarToast('Ativo excluído com sucesso!');
      carregarAtivos();
    } catch (err) { mostrarToast('Erro ao excluir ativo', 'error'); }
  });
}

function abrirModalNovo() {
  ativoEditandoId = null;
  document.getElementById('modalAtivoTitulo').querySelector('span').textContent = 'Novo Ativo';
  document.getElementById('btnSalvarAtivo').textContent = 'Criar Ativo';
  limparFormulario();
  document.getElementById('fotosAtivo').style.display = 'block';
  document.getElementById('previewFotos').innerHTML = '';
  abrirModal('modalAtivo');
}

async function uploadFotos() {
  const input = document.getElementById('uploadFotosInput');
  if (!input.files || input.files.length === 0) { mostrarToast('Selecione uma ou mais fotos', 'error'); return; }
  const id = ativoEditandoId;
  if (!id) { mostrarToast('Salve o ativo primeiro', 'error'); return; }

  for (const file of input.files) {
    const formData = new FormData();
    formData.append('imagem', file);
    try {
      await fetch(`/api/upload/${id}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}` },
        body: formData
      });
    } catch (err) {}
  }

  input.value = '';
  const res = await fetch(`/api/ativos/${id}`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
  const ativo = await res.json();
  renderFotos('previewFotos', ativo.fotos || []);
  mostrarToast('Fotos enviadas!');
}

function abrirModalImportar() {
  document.getElementById('fileInput').value = '';
  document.getElementById('resultadoImportacao').style.display = 'none';
  abrirModal('modalImportar');
}

function mostrarSugestoes(input) {
  let container = document.getElementById('sugestoesLocalidade');
  if (!container) {
    container = document.createElement('div');
    container.id = 'sugestoesLocalidade';
    container.style.cssText = 'position:fixed;max-height:200px;overflow-y:auto;background:var(--bg);border:1px solid var(--border);border-radius:6px;z-index:99999;box-shadow:0 8px 24px rgba(0,0,0,0.15);';
    document.body.appendChild(container);
  }
  container._inputId = input.id;

  const valor = input.value.toLowerCase().trim();
  const opcoes = input._opcoes || [];
  const filtradas = valor ? opcoes.filter(o => o.toLowerCase().includes(valor)) : opcoes;

  if (filtradas.length === 0) {
    container.style.display = 'none';
    return;
  }

  const rect = input.getBoundingClientRect();
  container.style.left = rect.left + 'px';
  container.style.top = (rect.bottom + 4) + 'px';
  container.style.width = rect.width + 'px';
  container.style.display = 'block';
  container.innerHTML = filtradas.map(o =>
    `<div style="padding:8px 12px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--border);transition:background 0.1s;"
      onmouseover="this.style.background='var(--accent-light)'" onmouseout="this.style.background=''"
      onmousedown="event.stopPropagation(); selecionarLocalidade('${o.replace(/'/g, "\\'")}')">${o}</div>`
  ).join('');
}

function selecionarLocalidade(valor) {
  const container = document.getElementById('sugestoesLocalidade');
  const input = container ? document.getElementById(container._inputId) : null;
  if (!input) return;
  input.value = valor;
  container.style.display = 'none';
}

async function importarExcel() {
  const fileInput = document.getElementById('fileInput');
  if (!fileInput.files || !fileInput.files[0]) { mostrarToast('Selecione um arquivo', 'error'); return; }

  const formData = new FormData();
  formData.append('arquivo', fileInput.files[0]);

  try {
    const res = await fetch('/api/importar', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${getToken()}` },
      body: formData
    });
    const result = await res.json();
    const div = document.getElementById('resultadoImportacao');

    if (!res.ok) {
      div.style.display = 'block'; div.style.background = '#fef2f2'; div.style.color = '#991b1b';
      div.textContent = result.erro || 'Erro ao importar'; return;
    }

    div.style.display = 'block'; div.style.background = '#dcfce7'; div.style.color = '#166534';
    div.textContent = result.mensagem;
    mostrarToast(`${result.importados} registros importados com sucesso!`);
    carregarAtivos();
  } catch (err) { mostrarToast('Erro ao importar arquivo', 'error'); }
}

async function exportarExcel() {
  try {
    let url = '/api/exportar';
    const q = [];
    const locVals = getMSValues('msLocalidade');
    const stVals = getMSValues('msStatus');
    const tpVals = getMSValues('msTipo');
    locVals.forEach(v => q.push(`localidade_vli=${encodeURIComponent(v)}`));
    stVals.forEach(v => q.push(`status_geral=${encodeURIComponent(v)}`));
    tpVals.forEach(v => q.push(`tipo_equipamento=${encodeURIComponent(v)}`));
    if (q.length) url += '?' + q.join('&');

    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${getToken()}` } });
    if (!res.ok) { mostrarToast('Erro ao exportar', 'error'); return; }

    const json = await res.json();
    const byteArray = Uint8Array.from(atob(json.base64), c => c.charCodeAt(0));
    const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = json.nome || `ativos_${new Date().toISOString().slice(0,10)}.xlsx`;
    link.click();
    URL.revokeObjectURL(link.href);
    mostrarToast('Relatório exportado com sucesso!');
  } catch (err) { mostrarToast('Erro ao exportar', 'error'); }
}

async function abrirModalUsuarios() {
  const user = getUsuario();
  if (!user || user.id !== 1) { mostrarToast('Acesso restrito', 'error'); return; }
  abrirModal('modalUsuarios');
  await carregarUsuarios();
}

async function carregarUsuarios() {
  try {
    const res = await fetch('/api/auth/usuarios', {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    if (!res.ok) return;
    const usuarios = await res.json();
    const tbody = document.getElementById('tabelaUsuarios');
    tbody.innerHTML = usuarios.map(u =>
      `<tr id="userRow${u.id}"><td>${u.id}</td><td>${u.username}</td><td>${u.nome}</td><td>${new Date(u.created_at).toLocaleDateString('pt-BR')}</td><td><button class="btn btn-sm btn-outline" onclick="resetarSenha(${u.id})">Resetar Senha</button></td></tr>`
    ).join('');
  } catch (err) { console.error(err); }
}

async function resetarSenha(userId) {
  const row = document.getElementById(`userRow${userId}`);
  if (!row) return;
  const cell = row.cells[4];
  cell.innerHTML = '<input type="password" id="novaSenhaInput" placeholder="Nova senha" style="padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:13px;background:var(--bg);color:var(--text);width:140px;"> <button class="btn btn-sm btn-primary" onclick="confirmarResetSenha(' + userId + ')">Confirmar</button> <button class="btn btn-sm btn-outline" onclick="carregarUsuarios()">Cancelar</button>';
  document.getElementById('novaSenhaInput').focus();
}

async function confirmarResetSenha(userId) {
  const input = document.getElementById('novaSenhaInput');
  const newPassword = input.value.trim();
  if (!newPassword || newPassword.length < 4) { mostrarToast('Senha deve ter no mínimo 4 caracteres', 'error'); return; }
  try {
    const res = await fetch('/api/auth/reset-password', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
      body: JSON.stringify({ userId, newPassword })
    });
    const data = await res.json();
    if (!res.ok) { mostrarToast(data.erro, 'error'); return; }
    mostrarToast('Senha redefinida com sucesso!');
    await carregarUsuarios();
  } catch (err) { mostrarToast('Erro ao resetar senha', 'error'); }
}

async function criarUsuario() {
  const username = document.getElementById('inputNovoUser').value.trim();
  const nome = document.getElementById('inputNovoNome').value.trim();
  const password = document.getElementById('inputNovoPass').value.trim();
  const msg = document.getElementById('msgUsuario');

  if (!username || !nome || !password) { msg.innerHTML = '<span style="color:#e74c3c;">Preencha todos os campos</span>'; return; }

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
      body: JSON.stringify({ username, password, nome })
    });
    const data = await res.json();
    if (!res.ok) { msg.innerHTML = `<span style="color:#e74c3c;">${data.erro}</span>`; return; }
    msg.innerHTML = `<span style="color:#2ecc71;">${data.mensagem}</span>`;
    document.getElementById('inputNovoUser').value = '';
    document.getElementById('inputNovoNome').value = '';
    document.getElementById('inputNovoPass').value = '';
    await carregarUsuarios();
  } catch (err) { msg.innerHTML = '<span style="color:#e74c3c;">Erro ao criar usuário</span>'; }
}
