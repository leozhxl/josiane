const router = require('express').Router();
const { authAdmin } = require('../middleware/auth');
const { read, write } = require('../middleware/db');

const STAGES = ['contato', 'proposta', 'negociacao', 'fechado', 'perdido'];
const CAMPOS = ['nome', 'email', 'tel', 'produto', 'valor', 'obs', 'stage', 'origem', 'data'];

function limpar(body) {
  const out = {};
  CAMPOS.forEach(k => { if (body[k] !== undefined) out[k] = body[k] == null ? '' : String(body[k]); });
  if (out.stage !== undefined && !STAGES.includes(out.stage)) out.stage = 'contato';
  return out;
}

/* ── LISTAR ──────────────────────────────────────────────── */
router.get('/', authAdmin, async (req, res) => {
  res.json(await read('leads.json'));
});

/* ── CRIAR ───────────────────────────────────────────────── */
router.post('/', authAdmin, async (req, res) => {
  const dados = limpar(req.body);
  if (!dados.nome || !dados.nome.trim()) return res.status(400).json({ error: 'Nome obrigatório.' });
  const leads = await read('leads.json');
  const novo = {
    id:       Date.now(),
    nome:     dados.nome.trim(),
    email:    dados.email   || '',
    tel:      dados.tel     || '',
    produto:  dados.produto || '',
    valor:    dados.valor   || '',
    obs:      dados.obs     || '',
    stage:    dados.stage   || 'contato',
    origem:   dados.origem  || 'manual',
    data:     dados.data    || new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
    atualizadoEm: new Date().toISOString()
  };
  leads.push(novo);
  await write('leads.json', leads);
  res.status(201).json(novo);
});

/* ── ATUALIZAR ───────────────────────────────────────────── */
router.put('/:id', authAdmin, async (req, res) => {
  const leads = await read('leads.json');
  const idx = leads.findIndex(l => String(l.id) === String(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Lead não encontrado.' });
  const dados = limpar(req.body);
  if (dados.nome !== undefined && !dados.nome.trim()) return res.status(400).json({ error: 'Nome obrigatório.' });
  leads[idx] = { ...leads[idx], ...dados, id: leads[idx].id, atualizadoEm: new Date().toISOString() };
  await write('leads.json', leads);
  res.json(leads[idx]);
});

/* ── EXCLUIR ─────────────────────────────────────────────── */
router.delete('/:id', authAdmin, async (req, res) => {
  const leads = await read('leads.json');
  const novo  = leads.filter(l => String(l.id) !== String(req.params.id));
  if (novo.length === leads.length) return res.status(404).json({ error: 'Lead não encontrado.' });
  await write('leads.json', novo);
  res.json({ ok: true });
});

module.exports = router;
