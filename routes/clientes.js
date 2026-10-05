const router = require('express').Router();
const { read, write } = require('../middleware/db');
const { authAdmin } = require('../middleware/auth');

/* GET /api/clientes — admin */
router.get('/', authAdmin, async (req, res) => {
  let clientes = (await read('clientes.json')).map(({ senha, ...rest }) => rest); // nunca expõe hash
  const { q } = req.query;
  if (q) { const s = q.toLowerCase(); clientes = clientes.filter(c => ((c.nome || '') + (c.email || '') + (c.cpf || '') + (c.telefone || '')).toLowerCase().includes(s)); }
  res.json(clientes);
});

/* DELETE /api/clientes/:id — admin */
router.delete('/:id', authAdmin, async (req, res) => {
  const arr = await read('clientes.json');
  const novo = arr.filter(c => String(c.id) !== req.params.id);
  if (novo.length === arr.length) return res.status(404).json({ error: 'Cliente não encontrado.' });
  await write('clientes.json', novo);
  res.json({ ok: true });
});

module.exports = router;
