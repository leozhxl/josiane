const router = require('express').Router();
const { read, write } = require('../middleware/db');
const { authAdmin } = require('../middleware/auth');

/* GET /api/produtos — público */
router.get('/', async (req, res) => {
  let produtos = await read('produtos.json');
  const { categoria, q, status } = req.query;
  if (categoria) produtos = produtos.filter(p => p.categoria === categoria);
  if (status)    produtos = produtos.filter(p => p.status === status);
  if (q)         { const s = q.toLowerCase(); produtos = produtos.filter(p => ((p.nome || '') + (p.categoria || '') + (p.marca || '')).toLowerCase().includes(s)); }
  res.json(produtos);
});

/* GET /api/produtos/:id — público */
router.get('/:id', async (req, res) => {
  const p = (await read('produtos.json')).find(x => String(x.id) === req.params.id);
  if (!p) return res.status(404).json({ error: 'Produto não encontrado.' });
  res.json(p);
});

/* POST /api/produtos — admin */
router.post('/', authAdmin, async (req, res) => {
  if (!req.body.nome) return res.status(400).json({ error: 'Nome obrigatório.' });
  const arr = await read('produtos.json');
  const novo = { id: Date.now(), criadoEm: new Date().toISOString(), ...req.body };
  arr.push(novo);
  await write('produtos.json', arr);
  res.status(201).json(novo);
});

/* PUT /api/produtos/:id — admin */
router.put('/:id', authAdmin, async (req, res) => {
  const arr = await read('produtos.json');
  const idx = arr.findIndex(x => String(x.id) === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Produto não encontrado.' });
  arr[idx] = { ...arr[idx], ...req.body, id: arr[idx].id };
  await write('produtos.json', arr);
  res.json(arr[idx]);
});

/* DELETE /api/produtos/:id — admin */
router.delete('/:id', authAdmin, async (req, res) => {
  const arr = await read('produtos.json');
  const novo = arr.filter(x => String(x.id) !== req.params.id);
  if (novo.length === arr.length) return res.status(404).json({ error: 'Produto não encontrado.' });
  await write('produtos.json', novo);
  res.json({ ok: true });
});

module.exports = router;
