function verificarAuth() {
  const usuario = localStorage.getItem('usuario');
  const token = localStorage.getItem('token');
  if (!token || !usuario) return null;
  try {
    return JSON.parse(usuario);
  } catch { return null; }
}

function getToken() { return localStorage.getItem('token'); }
function getUsuario() {
  try { return JSON.parse(localStorage.getItem('usuario')); } catch { return null; }
}

function atualizarUI() {
  const user = getUsuario();
  const nameEl = document.getElementById('userName');
  const badge = document.getElementById('perfilBadge');
  const loginBtn = document.getElementById('loginBtn');
  const logoutBtn = document.getElementById('logoutBtn');

  if (user) {
    if (nameEl) nameEl.textContent = user.nome;
    if (badge) { badge.textContent = 'Administrador'; badge.className = 'perfil-badge admin'; }
    if (loginBtn) loginBtn.style.display = 'none';
    if (logoutBtn) logoutBtn.style.display = 'flex';
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = '');
  } else {
    if (nameEl) nameEl.textContent = 'Visitante';
    if (badge) { badge.textContent = 'Visitante'; badge.className = 'perfil-badge visitante'; }
    if (loginBtn) loginBtn.style.display = 'flex';
    if (logoutBtn) logoutBtn.style.display = 'none';
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
  }
}

function exigirLogin(callback) {
  const user = getUsuario();
  if (user && user.perfil === 'admin') { callback(); return; }
  document.getElementById('loginModalCallback').value = callback ? '1' : '0';
  window.loginCallback = callback || null;
  document.getElementById('loginModalUser').value = '';
  document.getElementById('loginModalPass').value = '';
  document.getElementById('loginModalError').style.display = 'none';
  abrirModal('modalLogin');
}

async function login(username, password) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.erro || 'Erro ao fazer login');
  }
  const data = await res.json();
  localStorage.setItem('token', data.token);
  localStorage.setItem('usuario', JSON.stringify(data.usuario));
  atualizarUI();
  return data;
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('usuario');
  atualizarUI();
  mostrarToast('Sessão encerrada');
  window.location.reload();
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initAI();
  atualizarUI();

  document.getElementById('themeBtn')?.addEventListener('click', (e) => { e.preventDefault(); toggleTheme(); });
  document.getElementById('logoutBtn')?.addEventListener('click', (e) => { e.preventDefault(); logout(); });
  document.getElementById('loginBtn')?.addEventListener('click', (e) => { e.preventDefault(); window.location.href = '/login.html'; });

  document.getElementById('loginModalForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    const erroEl = document.getElementById('loginModalError');
    btn.disabled = true; btn.textContent = 'Entrando...';
    try {
      await login(
        document.getElementById('loginModalUser').value,
        document.getElementById('loginModalPass').value
      );
      fecharModal('modalLogin');
      const cb = window.loginCallback;
      window.loginCallback = null;
      if (cb) cb();
      else window.location.reload();
    } catch (err) {
      erroEl.textContent = err.message;
      erroEl.style.display = 'flex';
    }
    btn.disabled = false; btn.textContent = 'Entrar';
  });
});

function mostrarToast(mensagem, tipo = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${tipo}`;
  toast.textContent = mensagem;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function abrirModal(id) { document.getElementById(id)?.classList.add('ativo'); }
function fecharModal(id) { document.getElementById(id)?.classList.remove('ativo'); }

let acaoPendenteJustificativa = null;
function solicitarJustificativa(acao, callback) {
  acaoPendenteJustificativa = { acao, callback };
  document.getElementById('justificativaInput').value = '';
  abrirModal('modalJustificativa');
}
function confirmarJustificativa() {
  const justificativa = document.getElementById('justificativaInput').value.trim();
  if (!justificativa) { mostrarToast('Justificativa é obrigatória', 'error'); return; }
  fecharModal('modalJustificativa');
  if (acaoPendenteJustificativa && acaoPendenteJustificativa.callback) {
    acaoPendenteJustificativa.callback(justificativa);
  }
  acaoPendenteJustificativa = null;
}

const RESPOSTAS = {
  ola: 'Olá! Eu sou o assistente virtual do **Gestão de Ativos**. Como posso ajudá-lo hoje?',
  bem: 'Que bom! Fico feliz em ajudar. Pergunte-me sobre qualquer funcionalidade do sistema.',
  criar: 'Para **criar um novo ativo**:\n1. Vá para a página **Ativos**\n2. Clique em **Novo Ativo**\n3. Preencha os campos obrigatórios\n4. Clique em **Salvar**\n\n📌 Justificativa é obrigatória para todas as operações!',
  editar: 'Para **editar um ativo**:\n1. Localize o ativo na tabela\n2. Clique no ícone ✏️ (Editar)\n3. Altere os campos desejados\n4. Informe a **justificativa**\n5. Clique em **Salvar**',
  excluir: 'Para **excluir um ativo**:\n1. Localize o ativo na tabela\n2. Clique no ícone 🗑️ (Excluir)\n3. Informe a **justificativa**\n4. Confirme a exclusão\n\n⚠️ A exclusão é permanente!',
  importar: '📥 **Importar planilha**:\n1. Vá para **Ativos**\n2. Clique em **Importar**\n3. Selecione um arquivo **.xlsx**\n4. O sistema processa automaticamente\n\nO formato deve seguir o modelo da planilha de teste.',
  exportar: '📤 **Exportar dados**:\n1. Vá para **Ativos** ou **Auditoria**\n2. Aplique os filtros desejados (opcional)\n3. Clique em **Exportar** / **Exportar Excel**\n4. O download será iniciado automaticamente.',
  dashboard: '📊 **Dashboard** - Visão geral do sistema:\n• **Cards**: totais por status\n• **Gráficos**: pizza (Status/Tipo), barras (Localidade)\n• **Tendências**: movimentações nos últimos 12 meses\n• **Mapa**: ativos geolocalizados por cidade\n• **Feed ao vivo**: ações em tempo real\n• **Filtros**: refine por localidade, status ou tipo',
  ativos: '📋 **Página de Ativos**:\n• **Tabela** completa com busca e filtros\n• **Novo Ativo**: cadastro com justificativa\n• **Detalhes**: informações + QR Code + histórico\n• **Editar**: alteração com justificativa\n• **Excluir**: remove com justificativa\n• **Importar/Exportar**: planilhas Excel',
  auditoria: '📜 **Auditoria**:\n• **Histórico** completo de ações\n• **Filtros** por data, ação ou usuário\n• **Detalhes**: valores anteriores e novos\n• **Exportar** log em Excel',
    perfil: '👤 **Acesso**:\n• **Administrador**: login necessário para criar, editar ou excluir ativos\n• **Visitante**: visualização livre, sem login',
  justificativa: '📝 **Justificativa**:\nToda criação, alteração ou exclusão exige uma justificativa.\nIsso garante a **rastreabilidade** e fica registrado na **Auditoria** para conformidade.',
  mapa: '🗺️ **Mapa no Dashboard**:\n• Mostra ativos por cidade\n• Círculos **coloridos** por status geral\n• **Tamanho** proporcional à quantidade\n• **Clique** para ver detalhes da localidade\n• Tema escuro/claro adaptável',
  tema: '🎨 **Tema**:\nClique no botão de tema na sidebar para alternar entre **modo escuro** e **modo claro**.\nA preferência fica salva automaticamente.',
  qrcode: '📱 **QR Code**:\nDisponível nos **Detalhes** de cada ativo.\nEscaneie com o celular para acessar rapidamente as informações do equipamento.',
  atalho: '⌨️ **Atalhos**:\n• **Ctrl+H**: Abrir/Fechar assistente\n• **Esc**: Fechar modais\n• **Ctrl+N**: Novo ativo\n• **Ctrl+F**: Buscar\n• **Ctrl+S**: Salvar',
  menu: '🏠 **Menu Principal**\n\nEscolha um assunto:\n\n📋 **Ativos** - Gerenciar equipamentos\n📊 **Dashboard** - Visão geral do sistema\n📜 **Auditoria** - Histórico de ações\n\n📥 **Importar** planilha\n📤 **Exportar** dados\n🗺️ **Mapa** de localização\n👤 **Perfis** de acesso\n📝 **Justificativa**\n⌨️ **Atalhos** do teclado\n\n💡 Basta digitar o assunto ou clicar nos botões abaixo!',
  obrigado: 'De nada! 😊 Estou aqui para ajudar. Se tiver mais dúvidas, é só perguntar!',
  voltar: 'OK! Vamos voltar ao início. 😊\n\n' + '🏠 **Menu Principal**\n\nEscolha um assunto:\n\n📋 **Ativos** - Gerenciar equipamentos\n📊 **Dashboard** - Visão geral do sistema\n📜 **Auditoria** - Histórico de ações\n\n📥 **Importar** planilha\n📤 **Exportar** dados\n🗺️ **Mapa** de localização\n👤 **Perfis** de acesso\n📝 **Justificativa**\n⌨️ **Atalhos** do teclado\n\n💡 Basta digitar o assunto ou clicar nos botões abaixo!',
  fallback: 'Hmm, não entendi muito bem. Digite **"menu"** para ver todas as opções ou pergunte:\n\n• Como **criar** um ativo?\n• Como **importar** planilha?\n• O que é **auditoria**?\n• Como funciona o **mapa**?\n• **Atalhos** do teclado\n\n💬 Ou clique nos botões abaixo!'
};

function detectarIntencao(msg) {
  const m = msg.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/ola|oi|hey|bom dia|boa tarde|boa noite/.test(m)) return 'ola';
  if (/criar|novo|cadastrar|adicionar/.test(m)) return 'criar';
  if (/edit|alter|modific|atualiz/.test(m)) return 'editar';
  if (/excluir|delet|remover|apagar|lixeira/.test(m)) return 'excluir';
  if (/import|planilha|planilha|xlsx|excel/.test(m)) return 'importar';
  if (/export|download|baixar/.test(m)) return 'exportar';
  if (/dash|painel|grafico|grafico|card|tendencia/.test(m)) return 'dashboard';
  if (/ativo|equipamento|inventario/.test(m)) return 'ativos';
  if (/audit|historico|log|registro/.test(m)) return 'auditoria';
  if (/perfil|acesso|admin|adm|leitura|usuario/.test(m)) return 'perfil';
  if (/justificativa|motivo|porque|por que/.test(m)) return 'justificativa';
  if (/mapa|localizacao|cidade|geolocaliz/.test(m)) return 'mapa';
  if (/tema|escuro|claro|dark|light|modo/.test(m)) return 'tema';
  if (/qrcode|qr.code|codigo/.test(m)) return 'qrcode';
  if (/atalho|tecla|keyboard|ctrl/.test(m)) return 'atalho';
  if (/obrigad|valeu|brigado|thanks/.test(m)) return 'obrigado';
  if (/bem|otimo|legal|show|maravilha/.test(m)) return 'bem';
  if (/menu|inicio|principal|home|voltar|opcao/.test(m)) return 'voltar';
  return 'fallback';
}

function AIAssistant() {
  if (document.getElementById('aiAssistantWidget')) return;
  const btn = document.createElement('button');
  btn.id = 'aiToggleBtn'; btn.className = 'ai-toggle-btn';
  btn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>';
  btn.title = 'Assistente IA';
  document.body.appendChild(btn);

  const panel = document.createElement('div');
  panel.id = 'aiPanel'; panel.className = 'ai-panel';
  panel.innerHTML = `
    <div class="ai-header"><div class="ai-avatar"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg></div><div class="ai-info"><strong class="ai-name">Assistente IA</strong><span class="ai-status">Online</span></div><button id="aiStyleToggle" class="ai-style-toggle" title="Alternar estilo">🎨</button><button id="aiCloseBtn" class="ai-close">&times;</button></div>
    <div class="ai-messages" id="aiMessages"></div>
    <div class="ai-acoes-rapidas" id="aiAcoesRapidas"></div>
    <div class="ai-input-area"><input type="text" id="aiInput" placeholder="Digite sua pergunta..." /><button id="aiSendBtn" class="ai-send-btn"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button></div>`;
  document.body.appendChild(panel);

  const overlay = document.createElement('div');
  overlay.id = 'aiOverlay'; overlay.className = 'ai-overlay';
  document.body.appendChild(overlay);

  btn.addEventListener('click', toggleAI);
  overlay.addEventListener('click', closeAI);
  document.getElementById('aiCloseBtn').addEventListener('click', closeAI);
  document.getElementById('aiStyleToggle').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('aiPanel').classList.toggle('ai-style-alt');
    document.getElementById('aiStyleToggle').textContent =
      document.getElementById('aiPanel').classList.contains('ai-style-alt') ? '✨' : '🎨';
  });

  const input = document.getElementById('aiInput');
  const sendBtn = document.getElementById('aiSendBtn');
  function enviar() { const msg = input.value.trim(); if (!msg) return; input.value = ''; addMensagemUsuario(msg); processarMensagem(msg); }
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') enviar(); });
  sendBtn.addEventListener('click', enviar);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('aiPanel').classList.contains('aberto')) closeAI();
    if ((e.ctrlKey || e.metaKey) && e.key === 'h') { e.preventDefault(); toggleAI(); }
  });
}

function toggleAI() {
  const panel = document.getElementById('aiPanel');
  if (panel.classList.contains('aberto')) closeAI(); else openAI();
}
function openAI() {
  document.getElementById('aiPanel').classList.add('aberto');
  document.getElementById('aiOverlay').classList.add('aberto');
  document.getElementById('aiToggleBtn').classList.add('oculto');
  const msgDiv = document.getElementById('aiMessages');
  if (msgDiv.children.length === 0) {
    addMensagemBot('assistente', RESPOSTAS.ola);
    addMensagemBot('assistente', RESPOSTAS.menu);
    addAcoesRapidas('inicio');
  }
  setTimeout(() => document.getElementById('aiInput').focus(), 300);
}
function closeAI() {
  document.getElementById('aiPanel').classList.remove('aberto');
  document.getElementById('aiOverlay').classList.remove('aberto');
  document.getElementById('aiToggleBtn').classList.remove('oculto');
}
function addMensagemUsuario(texto) {
  const div = document.createElement('div');
  div.className = 'ai-msg ai-msg-user';
  div.textContent = texto;
  document.getElementById('aiMessages').appendChild(div);
  scrollAI();
}
function addMensagemBot(tipo, texto) {
  const div = document.createElement('div');
  div.className = 'ai-msg ai-msg-bot';
  const icone = tipo === 'assistente'
    ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>' : '';
  div.innerHTML = `${icone ? `<span class="ai-msg-icon">${icone}</span>` : ''}<span>${texto.replace(/\n/g, '<br>')}</span>`;
  document.getElementById('aiMessages').appendChild(div);
  scrollAI();
}
function scrollAI() { document.getElementById('aiMessages').scrollTop = document.getElementById('aiMessages').scrollHeight; }
function addAcoesRapidas(tipo = 'inicio') {
  const container = document.getElementById('aiAcoesRapidas');
  container.innerHTML = '';
  const botoes = tipo === 'inicio'
    ? [{ label: '📋 Ativos', intent: 'ativos' }, { label: '📊 Dashboard', intent: 'dashboard' }, { label: '📜 Auditoria', intent: 'auditoria' }, { label: '📥 Importar', intent: 'importar' }, { label: '📤 Exportar', intent: 'exportar' }, { label: '🗺️ Mapa', intent: 'mapa' }, { label: '👤 Perfis', intent: 'perfil' }, { label: '⌨️ Atalhos', intent: 'atalho' }]
    : [{ label: '🏠 Menu Principal', intent: 'voltar' }, { label: '💬 Outra dúvida', intent: '' }];
  botoes.forEach(a => {
    const btn = document.createElement('button');
    btn.className = 'ai-acao-btn';
    btn.textContent = a.label;
    btn.addEventListener('click', () => {
      if (a.intent === '') { document.getElementById('aiInput').focus(); return; }
      addMensagemUsuario(a.label);
      processarMensagem(a.label, true);
      container.innerHTML = '';
    });
    container.appendChild(btn);
  });
}
function processarMensagem(msg, deBotao = false) {
  const intencao = detectarIntencao(msg);
  setTimeout(() => {
    addMensagemBot('assistente', RESPOSTAS[intencao]);
    if (intencao === 'voltar' || intencao === 'menu' || intencao === 'ola') addAcoesRapidas('inicio');
    else addAcoesRapidas('padrao');
  }, deBotao ? 200 : 400);
}
function initAI() { AIAssistant(); }

function initTheme() {
  const saved = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
  atualizarLabelTema(theme);
}
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const novo = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', novo);
  localStorage.setItem('theme', novo);
  atualizarLabelTema(novo);
  document.dispatchEvent(new CustomEvent('themechange', { detail: { theme: novo } }));
}
function atualizarLabelTema(tema) {
  const label = document.getElementById('themeLabel');
  if (label) label.textContent = tema === 'dark' ? 'Tema Claro' : 'Tema Escuro';
}
