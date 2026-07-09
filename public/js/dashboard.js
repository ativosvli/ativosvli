let statusChart = null;
let tipoChart = null;
let localidadeChart = null;
let especificacaoChart = null;
let tendenciasChart = null;
let dadosAtuais = null;
const PALETA = ['#1a237e', '#3f51b5', '#00bcd4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#f97316', '#14b8a6', '#6366f1', '#06b6d4'];

document.addEventListener('DOMContentLoaded', () => {
  verificarAuth();
  const user = verificarAuth();
  if (user && user.perfil !== 'admin') {
    const btn = document.querySelector('.header-bar .acoes .btn-primary');
    if (btn) btn.style.display = 'none';
  }
  const navUsers = document.getElementById('navUsuarios');
  if (navUsers) navUsers.style.display = user && user.id === 1 ? '' : 'none';
  carregarOpcoesFiltro();
  carregarDashboard();
  carregarAtividadesRecentes();
  conectarSSE();
  document.addEventListener('themechange', () => { carregarDashboard(); });
});

function getFiltrosQuery() {
  const params = [];
  getMSValues('msLocalidade').forEach(v => params.push(`localidade_vli=${encodeURIComponent(v)}`));
  getMSValues('msWxp').forEach(v => params.push(`status_wxp=${encodeURIComponent(v)}`));
  getMSValues('msServiceNow').forEach(v => params.push(`status_servicenow=${encodeURIComponent(v)}`));
  const stVals = getMSValues('msStatus');
  stVals.filter(v => v !== 'Divergências' && v !== 'UX Pendentes' && v !== 'WXP Pendentes').forEach(v => params.push(`status_geral=${encodeURIComponent(v)}`));
  getMSValues('msTipo').forEach(v => params.push(`tipo_equipamento=${encodeURIComponent(v)}`));
  return params.length ? '?' + params.join('&') : '';
}

function getSpecialStatus() {
  const stVals = getMSValues('msStatus');
  if (stVals.includes('Divergências')) return 'Divergências';
  if (stVals.includes('UX Pendentes')) return 'UX Pendentes';
  if (stVals.includes('WXP Pendentes')) return 'WXP Pendentes';
  return null;
}

function hasAnyFilter() {
  return getMSValues('msLocalidade').length || getMSValues('msWxp').length ||
    getMSValues('msServiceNow').length ||
    getMSValues('msStatus').filter(v => v !== 'Divergências' && v !== 'UX Pendentes' && v !== 'WXP Pendentes').length ||
    getMSValues('msTipo').length;
}

function conectarSSE() {
  const token = getToken();
  if (!token) return;

  const eventSource = new EventSource(`/api/eventos?token=${token}`);

  eventSource.addEventListener('message', (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.type === 'connected') return;
      if (data.type && (data.type.startsWith('ativo_') || data.type === 'importacao')) {
        carregarDashboard();
        adicionarFeedItem(data);
      }
    } catch (err) {}
  });

  eventSource.addEventListener('error', () => {
    setTimeout(conectarSSE, 3000);
  });
}

const CAMPOS_LABELS = {
  serie_equipamento: 'Série Equipamento', serie_ux: 'Status UX', status_wxp: 'Status WXP',
  localidade_vli: 'Localidade VLI', setor: 'Setor', status_geral: 'Status Geral Simpress',
  evidencias_instalacoes: 'Evidências Instalações', status_servicenow: 'Status ServiceNow',
  chamado_servicenow: 'Chamado ServiceNow', especificacao_servicenow: 'Especificação ServiceNow',
  tipo_equipamento: 'Tipo Equipamento', modelo: 'Modelo', item: 'Item', nf: 'NF', comentario: 'Comentário',
  data_instalacao: 'Data de Instalação', data_entrega: 'Data de Entrega'
};
function detalhesTooltip(data) {
  let info = '';
  if (data.justificativa) info += `📋 ${data.justificativa}`;
  if (data.dados?.campos_alterados?.length) {
    const campos = data.dados.campos_alterados.map(c => CAMPOS_LABELS[c] || c).join(', ');
    if (info) info += '\n';
    info += `✏️ Campos: ${campos}`;
  }
  return info || null;
}
function adicionarFeedItem(data) {
  const feed = document.getElementById('realtimeFeed');
  const empty = feed.querySelector('.empty-state');
  if (empty) empty.remove();

  const tipo = data.type;
  let icone = '', cssClass = '', titulo = '';

  if (tipo === 'ativo_criado') {
    icone = '+'; cssClass = 'feed-criacao';
    titulo = `<strong>${data.usuario}</strong> criou <strong>${data.dados?.serie || 'um ativo'}</strong>`;
  } else if (tipo === 'ativo_alterado') {
    icone = '~'; cssClass = 'feed-alteracao';
    const campos = data.dados?.campos_alterados?.length ? ` (${data.dados.campos_alterados.length} campos)` : '';
    titulo = `<strong>${data.usuario}</strong> alterou <strong>${data.dados?.serie || 'um ativo'}</strong>${campos}`;
  } else if (tipo === 'ativo_excluido') {
    icone = '×'; cssClass = 'feed-exclusao';
    titulo = `<strong>${data.usuario}</strong> excluiu <strong>${data.dados?.serie || 'um ativo'}</strong>`;
  } else if (tipo === 'importacao') {
    icone = '↑'; cssClass = 'feed-importacao';
    titulo = `<strong>${data.usuario}</strong> importou ${data.importados} registros`;
  }

  const detalhes = detalhesTooltip(data);
  const item = document.createElement('div');
  item.className = `feed-item ${cssClass}`;
  item.innerHTML = `
    <div class="feed-icon">${icone}</div>
    <div class="feed-content">
      <div class="feed-title">${titulo}</div>
      <div class="feed-time">${new Date(data.timestamp).toLocaleTimeString('pt-BR')}</div>
      ${detalhes ? `<div class="feed-detalhes">${detalhes}</div>` : ''}
    </div>`;
  feed.insertBefore(item, feed.firstChild);
  while (feed.children.length > 50) feed.removeChild(feed.lastChild);
}

async function carregarDashboard() {
  try {
    const url = `/api/ativos/dashboard/totais${getFiltrosQuery()}`;
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    if (res.status === 401) { window.location.href = '/'; return; }
    dadosAtuais = await res.json();

    atualizarCards(dadosAtuais);
    atualizarGraficos(dadosAtuais);

    const totalGeral = dadosAtuais.totalGeral;
    document.getElementById('totalAtivosBadge').textContent = hasAnyFilter()
      ? `${totalGeral} ativos (filtrado)`
      : `${totalGeral} ativos`;

    carregarTendencias();
    carregarAdvertencias();
  } catch (err) {
    console.error('Erro ao carregar dashboard:', err);
  }
}

function atualizarCards(data) {
  animateNumber('totalGeral', data.totalGeral);
  animateNumber('emOperacao', data.totalPorStatus.em_operacao || 0);
  animateNumber('emEstoque', data.totalPorStatus.em_estoque || 0);
  animateNumber('emManutencao', data.totalPorStatus.em_manutencao || 0);
  animateNumber('uxPendentes', data.uxPendentes || 0);
  animateNumber('wxpPendentes', data.wxpPendentes || 0);

  const uxVal = data.uxPendentes || 0;
  const wxpVal = data.wxpPendentes || 0;
  const corUX = uxVal > 0 ? '#e67e22' : '#2ecc71';
  const corWXP = wxpVal > 0 ? '#e67e22' : '#2ecc71';
  const uxNum = document.getElementById('uxPendentes');
  const wxpNum = document.getElementById('wxpPendentes');
  const uxCard = document.getElementById('cardUxPendentes');
  const wxpCard = document.getElementById('cardWxpPendentes');
  if (uxNum) uxNum.style.color = corUX;
  if (uxCard) uxCard.style.borderLeftColor = corUX;
  if (wxpNum) wxpNum.style.color = corWXP;
  if (wxpCard) wxpCard.style.borderLeftColor = corWXP;
}

function animateNumber(elementId, target) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const current = parseInt(el.textContent.replace(/\D/g, '')) || 0;
  if (current === target) return;
  const duration = 600;
  const start = performance.now();
  function update(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(current + (target - current) * eased);
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

function atualizarGraficos(data) {
  if (statusChart) { statusChart.destroy(); statusChart = null; }
  if (tipoChart) { tipoChart.destroy(); tipoChart = null; }
  if (localidadeChart) { localidadeChart.destroy(); localidadeChart = null; }
  if (especificacaoChart) { especificacaoChart.destroy(); especificacaoChart = null; }

  renderChartOuVazio('chartStatus', data.statusGeral, () => {
    statusChart = criarGraficoPizza('chartStatus', data.statusGeral, 'status_geral');
  });

  renderChartOuVazio('chartTipo', data.tipoEquipamento, () => {
    tipoChart = criarGraficoPizza('chartTipo', data.tipoEquipamento, 'tipo_equipamento');
  });

  renderChartOuVazio('chartLocalidade', data.localidadeVLI, () => {
    localidadeChart = criarGraficoBarras('chartLocalidade', data.localidadeVLI, 'localidade_vli');
  });

  renderChartOuVazio('chartEspecificacao', data.especificacaoSN, () => {
    especificacaoChart = criarGraficoBarras('chartEspecificacao', data.especificacaoSN, 'especificacao_servicenow');
  });
}

async function carregarAtividadesRecentes() {
  try {
    const res = await fetch('/api/ativos/dashboard/atividades-recentes', {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    if (!res.ok) return;
    const data = await res.json();
    const feed = document.getElementById('realtimeFeed');
    const empty = feed.querySelector('.empty-state');
    if (empty) empty.remove();
    for (const item of data) {
      let icone = '', cssClass = '', titulo = '';
      if (item.acao === 'CRIACAO') { icone = '+'; cssClass = 'feed-criacao'; titulo = `<strong>${item.usuario_nome}</strong> criou <strong>${item.serie || 'um ativo'}</strong>`; }
      else if (item.acao === 'ALTERACAO') { icone = '~'; cssClass = 'feed-alteracao'; titulo = `<strong>${item.usuario_nome}</strong> alterou <strong>${item.serie || 'um ativo'}</strong>`; }
      else if (item.acao === 'EXCLUSAO') { icone = '×'; cssClass = 'feed-exclusao'; titulo = `<strong>${item.usuario_nome}</strong> excluiu <strong>${item.serie || 'um ativo'}</strong>`; }
      const detalhes = item.justificativa ? `📋 ${item.justificativa}` : '';
      const el = document.createElement('div');
      el.className = `feed-item ${cssClass}`;
      el.innerHTML = `<div class="feed-icon">${icone}</div><div class="feed-content"><div class="feed-title">${titulo}</div><div class="feed-time">${new Date(item.created_at + 'Z').toLocaleString('pt-BR')}</div>${detalhes ? `<div class="feed-detalhes">${detalhes}</div>` : ''}</div>`;
      feed.appendChild(el);
    }
  } catch (err) { console.error('Erro atividades recentes:', err); }
}

async function carregarTendencias() {
  try {
    const res = await fetch('/api/ativos/dashboard/tendencias', {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    if (!res.ok) return;
    const data = await res.json();

    if (tendenciasChart) { tendenciasChart.destroy(); tendenciasChart = null; }

    const canvas = document.getElementById('chartTendencias');
    if (!canvas || !data || data.length === 0) return;
    const ctx = canvas.getContext('2d');

    const meses = data.map(d => {
      const [ano, mes] = d.mes.split('-');
      const mesesNome = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
      return `${mesesNome[parseInt(mes)-1]}/${ano}`;
    });

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
    const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || '#475569';

    const criarGradiente = (cor1, cor2) => {
      const g = ctx.createLinearGradient(0, 0, 0, 180);
      g.addColorStop(0, cor1);
      g.addColorStop(1, cor2);
      return g;
    };

    tendenciasChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: meses,
        datasets: [
          {
            label: 'Criações',
            data: data.map(d => d.criacoes),
            borderColor: '#10b981',
            backgroundColor: criarGradiente('rgba(16,185,129,0.25)', 'rgba(16,185,129,0.02)'),
            tension: 0.4, fill: true, pointRadius: 4, pointHoverRadius: 7,
            pointBackgroundColor: '#10b981', pointBorderColor: isDark ? '#12161e' : '#fff',
            pointBorderWidth: 2, pointHoverBorderWidth: 3,
            borderWidth: 2.5
          },
          {
            label: 'Alterações',
            data: data.map(d => d.alteracoes),
            borderColor: '#3b82f6',
            backgroundColor: criarGradiente('rgba(59,130,246,0.25)', 'rgba(59,130,246,0.02)'),
            tension: 0.4, fill: true, pointRadius: 4, pointHoverRadius: 7,
            pointBackgroundColor: '#3b82f6', pointBorderColor: isDark ? '#12161e' : '#fff',
            pointBorderWidth: 2, pointHoverBorderWidth: 3,
            borderWidth: 2.5
          },
          {
            label: 'Exclusões',
            data: data.map(d => d.exclusoes),
            borderColor: '#ef4444',
            backgroundColor: criarGradiente('rgba(239,68,68,0.25)', 'rgba(239,68,68,0.02)'),
            tension: 0.4, fill: true, pointRadius: 4, pointHoverRadius: 7,
            pointBackgroundColor: '#ef4444', pointBorderColor: isDark ? '#12161e' : '#fff',
            pointBorderWidth: 2, pointHoverBorderWidth: 3,
            borderWidth: 2.5
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: true,
        interaction: { mode: 'index', intersect: false },
        animation: { duration: 800, easing: 'easeOutQuart' },
        plugins: {
          legend: {
            position: 'top',
            labels: { usePointStyle: true, pointStyleWidth: 10, font: { size: 11, family: 'Inter' }, padding: 16, boxWidth: 10 }
          },
          tooltip: {
            backgroundColor: isDark ? 'rgba(15,23,42,0.95)' : 'rgba(15,23,42,0.9)',
            padding: 16, cornerRadius: 10, titleFont: { size: 13, weight: '600' },
            bodyFont: { size: 13 }, boxPadding: 4,
            callbacks: {
              title(items) { return `📅 ${items[0].label}`; },
              label(item) {
                const idx = item.dataIndex;
                const d = data[idx];
                const labels = { criacoes: '✅ Criações', alteracoes: '🔄 Alterações', exclusoes: '❌ Exclusões' };
                return ` ${labels[item.dataset.label] || item.dataset.label}: ${item.parsed.y}`;
              },
              afterBody(items) {
                const idx = items[0].dataIndex;
                const d = data[idx];
                return [`─────────────`, ` 📊 Total: ${d.total} movimentações`];
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { size: 10, family: 'Inter' }, color: textColor }
          },
          y: {
            beginAtZero: true,
            grid: { color: gridColor, drawBorder: false },
            ticks: { font: { size: 10, family: 'Inter' }, stepSize: 1, color: textColor }
          }
        }
      }
    });
  } catch (err) { console.error('Erro tendencias:', err); }
}

function renderChartOuVazio(canvasId, dados, fnRender) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const container = canvas.parentElement;
  let emptyMsg = container.querySelector('.chart-empty-msg');
  if (!emptyMsg) {
    emptyMsg = document.createElement('div');
    emptyMsg.className = 'chart-empty-msg';
    emptyMsg.style.cssText = 'display:none;padding:30px;text-align:center;color:var(--text-muted);font-size:14px;';
    container.appendChild(emptyMsg);
  }
  if (!dados || dados.length === 0) {
    canvas.style.display = 'none';
    emptyMsg.style.display = 'block';
    emptyMsg.innerHTML = '<p>Sem dados para este filtro</p>';
  } else {
    canvas.style.display = 'block';
    emptyMsg.style.display = 'none';
    fnRender();
  }
}

function criarGraficoPizza(canvasId, dados, labelKey) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  if (!dados || dados.length === 0) return null;

  const labels = dados.map(d => d[labelKey] || 'Sem nome');
  const values = dados.map(d => d.total);
  const total = values.reduce((a, b) => a + b, 0);
  const cores = dados.map((_, i) => PALETA[i % PALETA.length]);
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const borderC = isDark ? '#12161e' : '#ffffff';

  // Center text plugin
  const centerText = {
    id: 'centerText',
    afterDraw(chart) {
      const { width, height, ctx } = chart;
      ctx.save();
      const meta = chart.getDatasetMeta(0);
      if (!meta.data.length) return;
      const centerX = chart.getDatasetMeta(0).data[0].x;
      const centerY = chart.getDatasetMeta(0).data[0].y;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 26px Inter, sans-serif`;
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#0f172a';
      ctx.fillText(total, centerX, centerY - 6);
      ctx.font = `500 11px Inter, sans-serif`;
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || '#475569';
      ctx.fillText('Total', centerX, centerY + 18);
      ctx.restore();
    }
  };

  return new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: cores.map(c => c + (isDark ? 'CC' : '')),
        borderColor: cores,
        borderWidth: 2,
        borderColor: borderC,
        hoverOffset: 10,
        hoverBorderWidth: 3,
        hoverBorderColor: cores
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      animation: { animateRotate: true, duration: 800, easing: 'easeOutQuart' },
      plugins: {
        legend: {
          position: 'right',
          labels: { padding: 14, usePointStyle: true, pointStyleWidth: 10, font: { size: 11, family: 'Inter' }, boxWidth: 10 }
        },
        tooltip: {
          backgroundColor: isDark ? 'rgba(15,23,42,0.95)' : 'rgba(15,23,42,0.9)',
          titleFont: { size: 12, family: 'Inter', weight: '600' },
          bodyFont: { size: 13, family: 'Inter' },
          padding: 14,
          cornerRadius: 8,
          displayColors: true,
          boxPadding: 4,
          callbacks: {
            label: (ctx) => {
              const pct = ((ctx.parsed / total) * 100).toFixed(1);
              return ` ${ctx.label}: ${ctx.parsed} (${pct}%)`;
            }
          }
        }
      },
      cutout: '68%'
    },
    plugins: [centerText]
  });
}

function criarGraficoBarras(canvasId, dados, labelKey) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  if (!dados || dados.length === 0) return null;

  const labels = dados.map(d => {
    const val = d[labelKey] || 'Sem nome';
    return val.length > 18 ? val.slice(0, 16) + '...' : val;
  });
  const values = dados.map(d => d.total);
  const cores = dados.map((_, i) => PALETA[i % PALETA.length]);
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';

  return new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: cores.map(c => c + (isDark ? '80' : 'BB')),
        borderColor: cores,
        borderWidth: 1,
        borderRadius: 6,
        barPercentage: 0.55,
        hoverBackgroundColor: cores,
        hoverBorderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      indexAxis: 'y',
      animation: { duration: 700, easing: 'easeOutQuart' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: isDark ? 'rgba(15,23,42,0.95)' : 'rgba(15,23,42,0.9)',
          padding: 14,
          cornerRadius: 8,
          titleFont: { size: 12, family: 'Inter' },
          bodyFont: { size: 13, family: 'Inter', weight: '600' },
          callbacks: { label: (ctx) => ` ${ctx.parsed.x} equipamentos` }
        }
      },
      scales: {
        x: {
          grid: { color: gridColor, drawBorder: false },
          ticks: { font: { size: 11, family: 'Inter' }, stepSize: 1, color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || '#475569' }
        },
        y: {
          grid: { display: false },
          ticks: { font: { size: 11, family: 'Inter' }, color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || '#475569' }
        }
      }
    }
  });
}

async function carregarOpcoesFiltro() {
  try {
    const res = await fetch('/api/ativos/filtros/opcoes', {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    const data = await res.json();

    const localidades = data.localidades || [];
    const formLocal = document.getElementById('dEdit_localidade_vli');
    if (formLocal) {
      formLocal._opcoes = localidades;
      formLocal.addEventListener('focus', function() { mostrarSugestoes(this); });
      formLocal.addEventListener('input', function() { mostrarSugestoes(this); });
      formLocal.addEventListener('blur', function() {
        setTimeout(() => { const s = document.getElementById('sugestoesLocalidade'); if (s) s.remove(); }, 200);
      });
    }

    populateMS('msWxp', data.statusWxp || []);
    populateMS('msServiceNow', data.statusServiceNow || []);
    const statusOptions = [...(data.statusGerais || []), '---', 'Divergências', 'UX Pendentes', 'WXP Pendentes'];
    populateMS('msStatus', statusOptions);
    populateMS('msTipo', data.tipos || []);
    populateMS('msLocalidade', localidades);
  } catch (err) {}
}

function aplicarFiltros() {
  const special = getSpecialStatus();
  carregarDashboard();
  if (special === 'Divergências') {
    carregarAtivosAdvertencia();
  } else if (special === 'UX Pendentes') {
    carregarAtivosUXPendentes();
  } else if (special === 'WXP Pendentes') {
    carregarAtivosWXPPendentes();
  } else {
    carregarAtivosFiltrados();
  }
}

async function carregarAtivosFiltrados() {
  const section = document.getElementById('resultadosFiltro');

  if (!hasAnyFilter()) {
    section.style.display = 'none';
    return;
  }

  try {
    let url = '/api/ativos?limit=50';
    url += '&' + getFiltrosQuery().replace(/^\?/, '');

    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    if (!res.ok) return;
    const data = await res.json();

    section.style.display = 'block';
    document.getElementById('resultadosCount').textContent = `${data.total} ativos`;

    const tbody = document.getElementById('resultadosTabela');
    if (data.ativos.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10"><div class="empty-state"><p>Nenhum ativo encontrado</p></div></td></tr>`;
      return;
    }

    const user = getUsuario();
    const isAdmin = user && user.perfil === 'admin';

    tbody.innerHTML = data.ativos.map(a => {
      const sc = a.status_geral === 'Em Operação' ? 'status-operacao' :
        a.status_geral?.includes('Estoque') ? 'status-estoque' :
        a.status_geral === 'Em Manutenção' ? 'status-manutencao' :
        (a.status_geral === 'Backup' || a.status_geral === 'Backup em Utilização' || a.status_geral === 'Backup em Uso') ? 'status-backup' : 'status-outros';
      return `<tr>
        <td><strong>${a.serie_equipamento || '-'}</strong></td>
        <td>${a.serie_ux || '-'}</td>
        <td>${a.status_wxp || '-'}</td>
        <td>${a.status_servicenow || '-'}</td>
        <td><span class="status-badge ${sc}">${a.status_geral || '-'}</span></td>
        <td>${a.localidade_vli || '-'}</td>
        <td>${a.tipo_equipamento || '-'}</td>
        <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${a.modelo ? a.modelo.slice(0,25)+'...' : '-'}</td>
        <td>${a.created_at ? new Date(a.created_at).toLocaleDateString('pt-BR') : '-'}</td>
        <td class="acoes-cell">
          <button class="btn btn-info btn-sm" onclick="dashVisualizarAtivo(${a.id})">Detalhes</button>
          ${isAdmin ? `
            <button class="btn btn-warning btn-sm" onclick="dashEditarAtivo(${a.id})">Editar</button>
            <button class="btn btn-danger btn-sm" onclick="dashExcluirAtivo(${a.id})">Excluir</button>
          ` : ''}
        </td>
      </tr>`;
    }).join('');
  } catch (err) {
    console.error('Erro ao carregar ativos filtrados:', err);
  }
}

async function carregarAtivosAdvertencia() {
  try {
    const res = await fetch('/api/ativos/dashboard/advertencias', {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    if (!res.ok) return;
    const dados = await res.json();
    const section = document.getElementById('resultadosFiltro');
    section.style.display = 'block';
    document.getElementById('resultadosCount').textContent = `${dados.total} ativos com advertência`;

    const tbody = document.getElementById('resultadosTabela');
    if (dados.itens.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10"><div class="empty-state"><p>Nenhum ativo com advertência</p></div></td></tr>`;
      return;
    }

    const user = getUsuario();
    const isAdmin = user && user.perfil === 'admin';

    tbody.innerHTML = dados.itens.map(item => {
      const problemas = (item.problemas || []).map(p =>
        `<span style="display:block;font-size:12px;color:#e74c3c;"><strong>${p.campo}:</strong> "${p.atual}" → "${p.esperado}"</span>`
      ).join('');
      return `<tr>
        <td><strong>${item.serie}</strong></td>
        <td>-</td>
        <td>${item.status_wxp || '-'}</td>
        <td>${item.status_servicenow || '-'}</td>
        <td><span class="status-badge status-outros">${item.status_geral}</span></td>
        <td>${item.localidade}</td>
        <td>-</td>
        <td style="max-width:250px;">${problemas}</td>
        <td>-</td>
        <td class="acoes-cell">
          <button class="btn btn-info btn-sm" onclick="dashVisualizarAtivo(${item.id})">Detalhes</button>
          ${isAdmin ? `
            <button class="btn btn-warning btn-sm" onclick="dashEditarAtivo(${item.id})">Editar</button>
          ` : ''}
        </td>
      </tr>`;
    }).join('');
  } catch (err) {
    console.error('Erro ao carregar advertências:', err);
  }
}

async function carregarAtivosUXPendentes() {
  try {
    const res = await fetch('/api/ativos/dashboard/ux-pendentes', {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    if (!res.ok) return;
    const dados = await res.json();
    const section = document.getElementById('resultadosFiltro');
    section.style.display = 'block';
    document.getElementById('resultadosCount').textContent = `${dados.total} ativos com UX Pendente`;

    const tbody = document.getElementById('resultadosTabela');
    if (dados.itens.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10"><div class="empty-state"><p>Nenhum ativo com UX pendente</p></div></td></tr>`;
      return;
    }

    const user = getUsuario();
    const isAdmin = user && user.perfil === 'admin';

    tbody.innerHTML = dados.itens.map(item =>
      `<tr>
        <td><strong>${item.serie_equipamento || '-'}</strong></td>
        <td>${item.serie_ux || '-'}</td>
        <td>${item.status_wxp || '-'}</td>
        <td>${item.status_servicenow || '-'}</td>
        <td><span class="status-badge status-outros">${item.status_geral || '-'}</span></td>
        <td>${item.localidade_vli || '-'}</td>
        <td>${item.tipo_equipamento || '-'}</td>
        <td style="max-width:250px;"><span style="display:block;font-size:12px;color:#e67e22;"><strong>${item.motivo}</strong></span></td>
        <td>-</td>
        <td class="acoes-cell">
          <button class="btn btn-info btn-sm" onclick="dashVisualizarAtivo(${item.id})">Detalhes</button>
          ${isAdmin ? `<button class="btn btn-warning btn-sm" onclick="dashEditarAtivo(${item.id})">Editar</button>` : ''}
        </td>
      </tr>`
    ).join('');
  } catch (err) {
    console.error('Erro ao carregar UX pendentes:', err);
  }
}

async function carregarAtivosWXPPendentes() {
  try {
    const res = await fetch('/api/ativos/dashboard/wxp-pendentes', {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    if (!res.ok) return;
    const dados = await res.json();
    const section = document.getElementById('resultadosFiltro');
    section.style.display = 'block';
    document.getElementById('resultadosCount').textContent = `${dados.total} ativos com WXP Pendente`;

    const tbody = document.getElementById('resultadosTabela');
    if (dados.itens.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10"><div class="empty-state"><p>Nenhum ativo com WXP pendente</p></div></td></tr>`;
      return;
    }

    const user = getUsuario();
    const isAdmin = user && user.perfil === 'admin';

    tbody.innerHTML = dados.itens.map(item =>
      `<tr>
        <td><strong>${item.serie_equipamento || '-'}</strong></td>
        <td>${item.serie_ux || '-'}</td>
        <td>${item.status_wxp || '-'}</td>
        <td>${item.status_servicenow || '-'}</td>
        <td><span class="status-badge status-outros">${item.status_geral || '-'}</span></td>
        <td>${item.localidade_vli || '-'}</td>
        <td>${item.tipo_equipamento || '-'}</td>
        <td style="max-width:250px;"><span style="display:block;font-size:12px;color:#e67e22;"><strong>${item.motivo}</strong></span></td>
        <td>-</td>
        <td class="acoes-cell">
          <button class="btn btn-info btn-sm" onclick="dashVisualizarAtivo(${item.id})">Detalhes</button>
          ${isAdmin ? `<button class="btn btn-warning btn-sm" onclick="dashEditarAtivo(${item.id})">Editar</button>` : ''}
        </td>
      </tr>`
    ).join('');
  } catch (err) {
    console.error('Erro ao carregar WXP pendentes:', err);
  }
}

function limparFiltros() {
  clearMS('msLocalidade');
  clearMS('msWxp');
  clearMS('msServiceNow');
  clearMS('msStatus');
  clearMS('msTipo');
  document.getElementById('resultadosFiltro').style.display = 'none';
  carregarDashboard();
}



let dashAtivoAcaoId = null;

async function dashVisualizarAtivo(id) {
  try {
    const res = await fetch(`/api/ativos/${id}`, {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    const ativo = await res.json();

    document.getElementById('dashDetalheId').textContent = `#${ativo.id}`;

    const campos = [
      { label: 'Série Equipamento', val: ativo.serie_equipamento },
      { label: 'Status UX', val: ativo.serie_ux },
      { label: 'Status WXP', val: ativo.status_wxp },
      { label: 'Localidade VLI', val: ativo.localidade_vli },
      { label: 'Setor', val: ativo.setor },
      { label: 'Status Geral Simpress', val: ativo.status_geral, cls: true },
      { label: 'Evidências Instalações', val: ativo.evidencias_instalacoes },
      { label: 'Status ServiceNow', val: ativo.status_servicenow },
      { label: 'Chamado ServiceNOW', val: ativo.chamado_servicenow },
      { label: 'Especificação ServiceNow', val: ativo.especificacao_servicenow },
      { label: 'Tipo Equipamento', val: ativo.tipo_equipamento },
      { label: 'Modelo', val: ativo.modelo, full: true },
      { label: 'Item', val: ativo.item },
      { label: 'NF', val: ativo.nf },
      { label: 'Comentário', val: ativo.comentario, full: true },
      { label: 'Data de Instalação', val: ativo.data_instalacao },
      { label: 'Data de Entrega', val: ativo.data_entrega }
    ];

    document.getElementById('dashDetalheConteudo').innerHTML = campos.map(c => {
      const valor = c.val || '-';
      const badgeHtml = c.cls ? `<span class="status-badge ${getSC(c.val)}">${valor}</span>` : valor;
      return `<div class="dash-detail-item ${c.full ? 'full' : ''}">
        <label>${c.label}</label>
        <span>${badgeHtml}</span>
      </div>`;
    }).join('');

    const qrUrl = encodeURIComponent(`${window.location.origin}/ativos.html?id=${ativo.id}`);
    document.getElementById('dashQrImg').src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${qrUrl}`;

    abrirModal('modalDetalhesDash');
  } catch (err) {
    mostrarToast('Erro ao carregar detalhes', 'error');
  }
}

function getSC(status) {
  if (status === 'Em Operação') return 'status-operacao';
  if (status?.includes('Estoque')) return 'status-estoque';
  if (status === 'Em Manutenção') return 'status-manutencao';
  if (status === 'Backup' || status === 'Backup em Utilização' || status === 'Backup em Uso') return 'status-backup';
  return 'status-outros';
}

let dashEditandoId = null;
let dashNovoAtivo = false;

function abrirModalNovoDash() {
  dashNovoAtivo = true;
  dashEditandoId = null;
  const campos = ['dEdit_serie_equipamento','dEdit_serie_ux','dEdit_status_wxp','dEdit_localidade_vli','dEdit_setor',
    'dEdit_status_geral','dEdit_evidencias_instalacoes','dEdit_status_servicenow',
    'dEdit_chamado_servicenow','dEdit_especificacao_servicenow','dEdit_tipo_equipamento',
    'dEdit_modelo','dEdit_item','dEdit_nf','dEdit_comentario','dEdit_data_instalacao','dEdit_data_entrega'];
  campos.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.querySelector('#modalEditarDash h3 span').textContent = 'Novo Ativo';
  abrirModal('modalEditarDash');
}

async function dashEditarAtivo(id) {
  dashEditandoId = id;
  try {
    const res = await fetch(`/api/ativos/${id}`, {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    const ativo = await res.json();

    const map = {
      'dEdit_serie_equipamento': ativo.serie_equipamento,
      'dEdit_serie_ux': ativo.serie_ux,
      'dEdit_status_wxp': ativo.status_wxp,
      'dEdit_localidade_vli': ativo.localidade_vli,
      'dEdit_setor': ativo.setor,
      'dEdit_status_geral': ativo.status_geral,
      'dEdit_evidencias_instalacoes': ativo.evidencias_instalacoes,
      'dEdit_status_servicenow': ativo.status_servicenow,
      'dEdit_chamado_servicenow': ativo.chamado_servicenow,
      'dEdit_especificacao_servicenow': ativo.especificacao_servicenow,
      'dEdit_tipo_equipamento': ativo.tipo_equipamento,
      'dEdit_modelo': ativo.modelo,
      'dEdit_item': ativo.item,
      'dEdit_nf': ativo.nf,
      'dEdit_comentario': ativo.comentario,
      'dEdit_data_instalacao': ativo.data_instalacao,
      'dEdit_data_entrega': ativo.data_entrega
    };

    Object.entries(map).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el) el.value = val || '';
    });

    abrirModal('modalEditarDash');
  } catch (err) {
    mostrarToast('Erro ao carregar ativo', 'error');
  }
}

async function salvarEdicaoDash() {
  const dados = {};
  const campos = ['serie_equipamento','serie_ux','status_wxp','localidade_vli','setor','status_geral',
    'evidencias_instalacoes','status_servicenow','chamado_servicenow','especificacao_servicenow',
    'tipo_equipamento','modelo','item','nf','comentario','data_instalacao','data_entrega'];
  campos.forEach(c => { dados[c] = document.getElementById('dEdit_' + c).value; });

  fecharModal('modalEditarDash');

  if (dashNovoAtivo) {
    document.getElementById('justificativaInputDash').value = '';
    abrirModal('modalJustificativaDash');
    window.__callbackJustDash = async (justificativa) => {
      dados.justificativa = justificativa;
      try {
        const res = await fetch('/api/ativos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
          body: JSON.stringify(dados)
        });
        const result = await res.json();
        if (!res.ok) { mostrarToast(result.erro || 'Erro ao criar', 'error'); return; }
        mostrarToast('Ativo criado com sucesso!');
        dashNovoAtivo = false;
        fecharModal('modalDetalhesDash');
        document.querySelector('#modalEditarDash h3 span').textContent = 'Editar Ativo';
        carregarAtivosFiltrados();
        carregarDashboard();
      } catch (err) { mostrarToast('Erro ao criar ativo', 'error'); }
    };
    return;
  }

  document.getElementById('justificativaInputDash').value = '';
  dashAtivoAcaoId = dashEditandoId;
  window.__dadosEdicao = dados;
  abrirModal('modalJustificativaDash');
  window.__callbackJustDash = async (justificativa) => {
    dados.justificativa = justificativa;
    try {
      const res = await fetch(`/api/ativos/${dashEditandoId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify(dados)
      });
      const result = await res.json();
      if (!res.ok) { mostrarToast(result.erro || 'Erro ao editar', 'error'); return; }
      mostrarToast('Ativo atualizado com sucesso!');
      fecharModal('modalDetalhesDash');
      carregarAtivosFiltrados();
      carregarDashboard();
    } catch (err) { mostrarToast('Erro ao editar ativo', 'error'); }
  };
}

let dashExcluirPendenteSerie = null;

async function dashExcluirAtivo(id) {
  try {
    const res = await fetch(`/api/ativos/${id}`, {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    const ativo = await res.json();
    if (!res.ok) { mostrarToast('Erro ao carregar ativo', 'error'); return; }

    dashAtivoAcaoId = id;
    dashExcluirPendenteSerie = (ativo.serie_equipamento || ativo.serie_ux || '').toLowerCase();
    document.getElementById('inputSerieExclusaoDash').value = '';
    document.getElementById('erroSerieExclusaoDash').style.display = 'none';
    abrirModal('modalConfirmarExclusaoDash');
  } catch (err) {
    mostrarToast('Erro ao carregar ativo', 'error');
  }
}

function confirmarSerieExclusaoDash() {
  const digitado = document.getElementById('inputSerieExclusaoDash').value.trim().toLowerCase();
  if (digitado !== dashExcluirPendenteSerie) {
    document.getElementById('erroSerieExclusaoDash').style.display = 'block';
    return;
  }

  fecharModal('modalConfirmarExclusaoDash');
  document.getElementById('justificativaInputDash').value = '';
  abrirModal('modalJustificativaDash');
}

function confirmarJustificativaDash() {
  const justificativa = document.getElementById('justificativaInputDash').value.trim();
  if (!justificativa) { mostrarToast('Justificativa é obrigatória', 'error'); return; }

  fecharModal('modalJustificativaDash');

  if (window.__callbackJustDash) {
    window.__callbackJustDash(justificativa);
    window.__callbackJustDash = null;
    return;
  }

  executarExclusaoDash(dashAtivoAcaoId, justificativa);
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
      onmousedown="event.stopPropagation(); document.getElementById('${input.id}').value='${o.replace(/'/g, "\\'")}'; document.getElementById('sugestoesLocalidade').style.display='none'; selecionarLocalidade('${o.replace(/'/g, "\\'")}')">${o}</div>`
  ).join('');
}

function selecionarLocalidade(valor) {
  const container = document.getElementById('sugestoesLocalidade');
  const inputId = container ? container._inputId : 'dEdit_localidade_vli';
  const input = document.getElementById(inputId);
  if (!input) return;
  input.value = valor;
  if (container) container.style.display = 'none';
}

async function executarExclusaoDash(id, justificativa) {
  try {
    const res = await fetch(`/api/ativos/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
      body: JSON.stringify({ justificativa })
    });
    const result = await res.json();
    if (!res.ok) { mostrarToast(result.erro || 'Erro ao excluir', 'error'); return; }
    mostrarToast('Ativo excluído com sucesso!');
    fecharModal('modalDetalhesDash');
    carregarAtivosFiltrados();
    carregarDashboard();
  } catch (err) { mostrarToast('Erro ao excluir ativo', 'error'); }
}

async function carregarAdvertencias() {
  try {
    const res = await fetch('/api/ativos/dashboard/advertencias', {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    if (!res.ok) return;
    const dados = await res.json();
    const el = document.getElementById('totalAdvertencias');
    if (el) {
      el.textContent = dados.total;
      el.style.color = dados.total > 0 ? '#e74c3c' : '#2ecc71';
    }
    const card = document.getElementById('cardAdvertencia');
    if (card) {
      card.style.borderLeftColor = dados.total > 0 ? '#e74c3c' : '#2ecc71';
    }
    window._dadosAdvertencias = dados;
  } catch (err) { console.error('Erro ao carregar advertências:', err); }
}

function abrirModalAdvertencias() {
  const dados = window._dadosAdvertencias;
  if (!dados || dados.total === 0) {
    mostrarToast('Nenhuma advertência encontrada', 'info');
    return;
  }
  const tbody = document.getElementById('advertenciasTbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  for (const item of dados.itens) {
    for (const p of item.problemas) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${item.serie}</td><td>${item.localidade}</td><td>${item.status_wxp || '-'}</td><td>${item.status_servicenow || '-'}</td><td>${item.status_geral}</td><td><strong>${p.campo}:</strong> "${p.atual}" → "${p.esperado}"</td>`;
      tbody.appendChild(tr);
    }
  }
  abrirModal('modalAdvertencias');
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
