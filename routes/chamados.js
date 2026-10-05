const router = require('express').Router();
const { authAdmin } = require('../middleware/auth');
const { read, write } = require('../middleware/db');

const STATUS = ['aberto', 'andamento', 'resolvido'];

function limpar(body) {
  const out = {};
  ['cliente', 'assunto', 'desc', 'status'].forEach(k => {
    if (body[k] !== undefined) out[k] = String(body[k] == null ? '' : body[k]).trim();
  });
  if (out.status !== undefined && !STATUS.includes(out.status)) out.status = 'aberto';
  return out;
}

/* GET /api/chamados */
router.get('/', authAdmin, async (req, res) => {
  res.json(await read('chamados.json'));
});

/* POST /api/chamados */
router.post('/', authAdmin, async (req, res) => {
  const d = limpar(req.body);
  if (!d.cliente || !d.assunto) return res.status(400).json({ error: 'Preencha cliente e assunto.' });
  const lista = await read('chamados.json');
  const novo = {
    id: Date.now(),
    cliente: d.cliente,
    assunto: d.assunto,
    desc: d.desc || '',
    status: d.status || 'aberto',
    data: new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
    criadoEm: new Date().toISOString()
  };
  lista.unshift(novo);
  await write('chamados.json', lista);
  res.status(201).json(novo);
});

/* PUT /api/chamados/:id */
router.put('/:id', authAdmin, async (req, res) => {
  const lista = await read('chamados.json');
  const idx = lista.findIndex(c => String(c.id) === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Chamado não encontrado.' });
  const d = limpar(req.body);
  if ((d.cliente !== undefined && !d.cliente) || (d.assunto !== undefined && !d.assunto))
    return res.status(400).json({ error: 'Preencha cliente e assunto.' });
  lista[idx] = { ...lista[idx], ...d, atualizadoEm: new Date().toISOString() };
  await write('chamados.json', lista);
  res.json(lista[idx]);
});

/* DELETE /api/chamados/:id */
router.delete('/:id', authAdmin, async (req, res) => {
  const lista = await read('chamados.json');
  const novo  = lista.filter(c => String(c.id) !== req.params.id);
  if (novo.length === lista.length) return res.status(404).json({ error: 'Chamado não encontrado.' });
  await write('chamados.json', novo);
  res.json({ ok: true });
});

module.exports = router;
