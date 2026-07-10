const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDatabase } = require('../database');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ erro: 'Usuário e senha obrigatórios' });
  }

  const db = await getDatabase();
  const usuario = await db.prepare('SELECT * FROM usuarios WHERE username = ? AND ativo = 1').get(username);

  if (!usuario || !bcrypt.compareSync(password, usuario.password)) {
    return res.status(401).json({ erro: 'Usuário ou senha inválidos' });
  }

  const token = jwt.sign(
    { id: usuario.id, username: usuario.username, nome: usuario.nome, perfil: usuario.perfil },
    process.env.JWT_SECRET || 'jwt-gestao-key-2024',
    { expiresIn: '8h' }
  );

  req.session.token = token;
  req.session.usuario = { id: usuario.id, username: usuario.username, nome: usuario.nome, perfil: usuario.perfil };

  res.json({
    token,
    usuario: {
      id: usuario.id,
      nome: usuario.nome,
      username: usuario.username,
      perfil: usuario.perfil
    }
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ mensagem: 'Logout realizado' });
});

router.get('/me', (req, res) => {
  if (!req.session?.usuario) {
    return res.status(401).json({ erro: 'Não autenticado' });
  }
  res.json(req.session.usuario);
});

router.get('/usuarios', async (req, res) => {
  if (!req.session?.usuario || req.session.usuario.id !== 1) {
    return res.status(403).json({ erro: 'Acesso restrito ao administrador principal' });
  }
  const db = await getDatabase();
  const usuarios = await db.prepare('SELECT id, username, nome, perfil, ativo, created_at FROM usuarios ORDER BY id').all();
  res.json(usuarios);
});

router.post('/register', async (req, res) => {
  if (!req.session?.usuario || req.session.usuario.id !== 1) {
    return res.status(403).json({ erro: 'Acesso restrito ao administrador principal' });
  }

  const { username, password, nome } = req.body;
  if (!username || !password || !nome) {
    return res.status(400).json({ erro: 'username, password e nome são obrigatórios' });
  }

  const db = await getDatabase();
  const existente = await db.prepare('SELECT id FROM usuarios WHERE username = ?').get(username);
  if (existente) {
    return res.status(400).json({ erro: 'Usuário já existe' });
  }

  const hash = bcrypt.hashSync(password, 10);
  await db.prepare('INSERT INTO usuarios (username, password, nome, perfil) VALUES (?, ?, ?, ?)').run(username, hash, nome, 'admin');
  res.json({ mensagem: `Usuário ${username} criado com sucesso` });
});

router.put('/reset-password', async (req, res) => {
  if (!req.session?.usuario || req.session.usuario.id !== 1) {
    return res.status(403).json({ erro: 'Acesso restrito ao administrador principal' });
  }

  const { userId, newPassword } = req.body;
  if (!userId || !newPassword) {
    return res.status(400).json({ erro: 'userId e newPassword são obrigatórios' });
  }

  const db = await getDatabase();
  const usuario = await db.prepare('SELECT id FROM usuarios WHERE id = ?').get(userId);
  if (!usuario) {
    return res.status(404).json({ erro: 'Usuário não encontrado' });
  }

  const hash = bcrypt.hashSync(newPassword, 10);
  await db.prepare('UPDATE usuarios SET password = ? WHERE id = ?').run(hash, userId);
  res.json({ mensagem: 'Senha redefinida com sucesso' });
});

module.exports = router;
