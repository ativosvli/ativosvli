const jwt = require('jsonwebtoken');

function autenticar(req, res, next) {
  const token = req.session?.token || req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ erro: 'Não autenticado' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'jwt-gestao-key-2024');
    req.usuario = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ erro: 'Token inválido' });
  }
}

function adminApenas(req, res, next) {
  if (req.usuario?.perfil !== 'admin') {
    return res.status(403).json({ erro: 'Acesso restrito a administradores' });
  }
  next();
}

function leituraApenas(req, res, next) {
  if (req.usuario?.perfil !== 'leitura') {
    return res.status(403).json({ erro: 'Acesso restrito a leitura' });
  }
  next();
}

module.exports = { autenticar, adminApenas, leituraApenas };
