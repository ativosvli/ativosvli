const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const { getDatabase } = require('../database');
const { autenticar, adminApenas } = require('../middleware/auth');
const { broadcast } = require('../events');

const router = express.Router();

const tempDir = process.env.TEMP_DIR || (process.env.LAMBDA_TASK_ROOT ? '/tmp/temp_uploads' : path.join(__dirname, '..', 'temp_uploads'));
const upload = multer({
  dest: tempDir,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.xlsx' || ext === '.xls' || ext === '.csv') {
      cb(null, true);
    } else {
      cb(new Error('Formato inválido. Use .xlsx, .xls ou .csv'));
    }
  }
});

const mapearCampos = {
  'Série MAPA': 'serie_equipamento',
  'Série UX': 'serie_ux',
  'Status WXP\r\n(30/06/26)': 'status_wxp',
  'Localidade VLI': 'localidade_vli',
  'Status Geral': 'status_geral',
  'Evidências  Instalações\r\n(Fotos e cjehck list)': 'evidencias_instalacoes',
  'Status \r\nServiceNow  (30/06/26)': 'status_servicenow',
  'Chamado\r\nServiceNOW': 'chamado_servicenow',
  'Especificação\r\nServiceNow': 'especificacao_servicenow',
  'Tipo\r\nEquipamento': 'tipo_equipamento',
  'Modelo': 'modelo',
  'NF': 'nf',
  'Observações': 'comentario'
};

router.post('/', autenticar, adminApenas, upload.single('arquivo'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ erro: 'Arquivo não enviado' });
    }

    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const dados = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    if (dados.length === 0) {
      return res.status(400).json({ erro: 'Planilha vazia' });
    }

    const db = getDatabase();
    const insertStmt = db.prepare(`
      INSERT INTO ativos (serie_equipamento, serie_ux, status_wxp, localidade_vli, setor, status_geral,
        evidencias_instalacoes, status_servicenow, chamado_servicenow, especificacao_servicenow,
        tipo_equipamento, modelo, item, nf, comentario)
      VALUES (@serie_equipamento, @serie_ux, @status_wxp, @localidade_vli, @setor, @status_geral,
        @evidencias_instalacoes, @status_servicenow, @chamado_servicenow, @especificacao_servicenow,
        @tipo_equipamento, @modelo, @item, @nf, @comentario)
    `);

    let importados = 0;
    let erros = 0;

    const transacao = db.transaction(() => {
      for (const linha of dados) {
        const ativo = {};
        for (const [nomeColuna, campo] of Object.entries(mapearCampos)) {
          ativo[campo] = linha[nomeColuna] !== undefined ? String(linha[nomeColuna]) : '';
        }
        try {
          insertStmt.run(ativo);
          importados++;
        } catch (e) {
          erros++;
        }
      }
    });

    transacao();

    broadcast('importacao', {
      usuario: req.usuario.nome,
      importados,
      erros,
      justificativa: `Importação de ${importados} registros`
    });

    res.json({
      mensagem: `Importação concluída. ${importados} registros importados, ${erros} erros.`,
      importados,
      erros
    });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao importar: ' + err.message });
  }
});

module.exports = router;
