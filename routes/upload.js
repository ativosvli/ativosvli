const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const path = require('path');
const { getDatabase } = require('../database');
const { autenticar, adminApenas } = require('../middleware/auth');

const router = express.Router();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'seu-cloud-name',
  api_key: process.env.CLOUDINARY_API_KEY || 'seu-api-key',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'seu-api-secret'
});

const tempDir = process.env.TEMP_DIR || (process.env.LAMBDA_TASK_ROOT ? '/tmp/temp_uploads' : path.join(__dirname, '..', 'temp_uploads'));

const upload = multer({
  dest: tempDir,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Formato inválido. Use PNG, JPG, JPEG, GIF ou WEBP'));
    }
  }
});

router.post('/:ativoId', autenticar, adminApenas, upload.single('imagem'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ erro: 'Imagem não enviada' });
    }

    const db = await getDatabase();
    const ativo = await db.prepare('SELECT id FROM ativos WHERE id = ?').get(req.params.ativoId);
    if (!ativo) {
      return res.status(404).json({ erro: 'Ativo não encontrado' });
    }

    try {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: 'gestao-ativos',
        public_id: `ativo_${req.params.ativoId}_${Date.now()}`
      });

      await db.prepare('INSERT INTO uploads (ativo_id, url, public_id) VALUES (?, ?, ?)').run(
        req.params.ativoId, result.secure_url, result.public_id
      );

      res.json({ url: result.secure_url, public_id: result.public_id });
    } catch (cloudErr) {
      res.status(500).json({ erro: 'Erro ao enviar para nuvem: ' + cloudErr.message });
    }
  } catch (err) {
    res.status(500).json({ erro: 'Erro no upload: ' + err.message });
  }
});

router.delete('/:uploadId', autenticar, adminApenas, async (req, res) => {
  try {
    const db = await getDatabase();
    const uploadReg = await db.prepare('SELECT * FROM uploads WHERE id = ?').get(req.params.uploadId);
    if (!uploadReg) {
      return res.status(404).json({ erro: 'Upload não encontrado' });
    }

    try {
      if (uploadReg.public_id) {
        await cloudinary.uploader.destroy(uploadReg.public_id);
      }
    } catch (e) {

    }

    await db.prepare('DELETE FROM uploads WHERE id = ?').run(req.params.uploadId);
    res.json({ mensagem: 'Imagem removida' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao remover: ' + err.message });
  }
});

module.exports = router;
