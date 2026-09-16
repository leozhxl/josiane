const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'allecom_secret_2025';

function authUser(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Não autenticado.' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido.' });
  }
}

function authAdmin(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Não autenticado.' });
  try {
    const payload = jwt.verify(token, SECRET);
    if (payload.role !== 'admin') return res.status(403).json({ error: 'Acesso negado.' });
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido.' });
  }
}

module.exports = { authUser, authAdmin, SECRET };
