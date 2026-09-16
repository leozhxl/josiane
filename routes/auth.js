const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { read, write } = require('../middleware/db');
const { SECRET } = require('../middleware/auth');

/* ── LOGIN USUÁRIO ─────────────────────────────────────── */
router.post('/login', async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) return res.status(400).json({ error: 'E-mail e senha obrigatórios.' });

  const clientes = read('clientes.json');
  const user = clientes.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) return res.status(401).json({ error: 'E-mail não cadastrado.' });

  const ok = await bcrypt.compare(senha, user.senha);
  if (!ok) return res.status(401).json({ error: 'Senha incorreta.' });

  const token = jwt.sign({ id: user.id, email: user.email, nome: user.nome, role: 'user' }, SECRET, { expiresIn: '7d' });
  res.json({ token, nome: user.nome, email: user.email });
});

/* ── CADASTRO USUÁRIO ──────────────────────────────────── */
router.post('/cadastro', async (req, res) => {
  const { nome, sobrenome, email, cpf, telefone, senha, newsletter } = req.body;
  if (!nome || !email || !senha) return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });

  const clientes = read('clientes.json');
  if (clientes.find(u => u.email.toLowerCase() === email.toLowerCase()))
    return res.status(409).json({ error: 'E-mail já cadastrado.' });

  const hash = await bcrypt.hash(senha, 10);
  const novo = {
    id: Date.now(),
    nome: nome + (sobrenome ? ' ' + sobrenome : ''),
    email, cpf: cpf || '', telefone: telefone || '',
    senha: hash, newsletter: !!newsletter,
    criadoEm: new Date().toISOString()
  };
  clientes.push(novo);
  write('clientes.json', clientes);

  const token = jwt.sign({ id: novo.id, email: novo.email, nome: novo.nome, role: 'user' }, SECRET, { expiresIn: '7d' });
  res.status(201).json({ token, nome: novo.nome, email: novo.email });
});

/* ── LOGIN ADMIN ───────────────────────────────────────── */
router.post('/admin/login', async (req, res) => {
  const { user, pass } = req.body;
  if (!user || !pass) return res.status(400).json({ error: 'Usuário e senha obrigatórios.' });

  const creds = read('admin.json');
  if (user !== creds.user) return res.status(401).json({ error: 'Usuário ou senha incorretos.' });

  const ok = await bcrypt.compare(pass, creds.pass);
  if (!ok) return res.status(401).json({ error: 'Usuário ou senha incorretos.' });

  const token = jwt.sign({ user: creds.user, role: 'admin' }, SECRET, { expiresIn: '12h' });
  res.json({ token });
});

/* ── ALTERAR CREDENCIAIS ADMIN ─────────────────────────── */
router.put('/admin/credenciais', require('../middleware/auth').authAdmin, async (req, res) => {
  const { senhaAtual, novoUser, novaSenha } = req.body;
  const creds = read('admin.json');

  const ok = await bcrypt.compare(senhaAtual, creds.pass);
  if (!ok) return res.status(401).json({ error: 'Senha atual incorreta.' });

  if (novaSenha && novaSenha.length < 6)
    return res.status(400).json({ error: 'Nova senha: mínimo 6 caracteres.' });

  if (novoUser) creds.user = novoUser.trim();
  if (novaSenha) creds.pass = await bcrypt.hash(novaSenha, 10);
  write('admin.json', creds);
  res.json({ ok: true });
});

module.exports = router;
