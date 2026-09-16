const router = require('express').Router();
const { authAdmin } = require('../middleware/auth');
const { read, write } = require('../middleware/db');

function getLeads() {
  return read('leads.json') || [];
}

/* ── LISTAR ──────────────────────────────────────────────── */
router.get('/', authAdmin, (req, res) => {
  res.json(getLeads());
});

/* ── CRIAR ───────────────────────────────────────────────── */
router.post('/', authAdmin, (req, res) => {
  const leads = getLeads();
  const novo = {
    id:       Date.now(),
    nome:     req.body.nome    || '',
    email:    req.body.email   || '',
    tel:      req.body.tel     || '',
    produto:  req.body.produto || '',
    valor:    req.body.valor   || '',
    obs:      req.body.obs     || '',
    stage:    req.body.stage   || 'contato',
    origem:   req.body.origem  || 'manual',
    data:     req.body.data    || new Date().toLocaleDateString('pt-BR')
  };
  leads.push(novo);
  write('leads.json', leads);
  res.status(201).json(novo);
});

/* ── ATUALIZAR ───────────────────────────────────────────── */
router.put('/:id', authAdmin, (req, res) => {
  const leads = getLeads();
  const idx = leads.findIndex(l => String(l.id) === String(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Lead não encontrado.' });
  leads[idx] = { ...leads[idx], ...req.body, id: leads[idx].id };
  write('leads.json', leads);
  res.json(leads[idx]);
});

/* ── EXCLUIR ─────────────────────────────────────────────── */
router.delete('/:id', authAdmin, (req, res) => {
  const leads = getLeads().filter(l => String(l.id) !== String(req.params.id));
  write('leads.json', leads);
  res.json({ ok: true });
});

module.exports = router;
