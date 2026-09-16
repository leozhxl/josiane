const router = require('express').Router();
const { read, write } = require('../middleware/db');
const { authAdmin } = require('../middleware/auth');

/* GET /api/clientes — admin */
router.get('/', authAdmin, (req, res) => {
  let clientes = read('clientes.json').map(({ senha, ...rest }) => rest); // nunca expõe hash
  const { q } = req.query;
  if (q) { const s = q.toLowerCase(); clientes = clientes.filter(c => (c.nome + c.email + (c.cpf || '')).toLowerCase().includes(s)); }
  res.json(clientes);
});

/* DELETE /api/clientes/:id — admin */
router.delete('/:id', authAdmin, (req, res) => {
  const arr = read('clientes.json');
  const novo = arr.filter(c => String(c.id) !== req.params.id);
  if (novo.length === arr.length) return res.status(404).json({ error: 'Cliente não encontrado.' });
  write('clientes.json', novo);
  res.json({ ok: true });
});

module.exports = router;
