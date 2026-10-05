const router = require('express').Router();
const { read, write } = require('../middleware/db');
const { authUser, authAdmin } = require('../middleware/auth');
const { isoBR, somaDias } = require('../middleware/datas');

const STATUS = ['Aguardando', 'Confirmado', 'Enviado', 'Entregue', 'Cancelado'];

/* GET /api/pedidos — admin vê todos; usuário vê os seus */
router.get('/', authUser, async (req, res) => {
  let pedidos = await read('pedidos.json');
  const { q, status } = req.query;

  if (req.user.role !== 'admin')
    pedidos = pedidos.filter(p => p.email === req.user.email);

  if (status) pedidos = pedidos.filter(p => p.status === status);
  if (q) { const s = q.toLowerCase(); pedidos = pedidos.filter(p => ((p.id || '') + (p.cliente || '') + (p.email || '') + (p.produtos || '')).toLowerCase().includes(s)); }

  res.json(pedidos);
});

/* POST /api/pedidos — usuário autenticado */
router.post('/', authUser, async (req, res) => {
  const total = Number(req.body.total);
  if (!req.body.produtos || !isFinite(total) || total < 0)
    return res.status(400).json({ error: 'Pedido inválido.' });

  const arr = await read('pedidos.json');
  /* numeração sequencial que não repete mesmo após exclusões */
  const ultimo = arr.reduce((m, p) => Math.max(m, parseInt(String(p.id).replace(/\D/g, ''), 10) || 0), 0);
  const novo = {
    id: 'PED-' + String(ultimo + 1).padStart(3, '0'),
    cliente: req.user.nome,
    email: req.user.email,
    produtos: req.body.produtos,
    total: +total.toFixed(2),
    obs: req.body.obs || '',
    data: isoBR(),
    criadoEm: new Date().toISOString(),
    status: 'Aguardando'
  };
  arr.push(novo);
  await write('pedidos.json', arr);
  res.status(201).json(novo);
});

/* GET /api/pedidos/analytics?periodo=hoje|semana|mes|ano|custom&de=YYYY-MM-DD&ate=YYYY-MM-DD */
router.get('/analytics', authAdmin, async (req, res) => {
  const todos = await read('pedidos.json');
  const { periodo = 'mes', de, ate } = req.query;
  const hoje  = isoBR();
  const ontem = somaDias(hoje, -1);
  const dataOk = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

  let inicio, fim = hoje;
  if (periodo === 'hoje')        inicio = hoje;
  else if (periodo === 'semana') inicio = somaDias(hoje, -6);
  else if (periodo === 'ano')    inicio = hoje.slice(0, 4) + '-01-01';
  else if (periodo === 'custom' && dataOk(de) && dataOk(ate) && de <= ate) { inicio = de; fim = ate; }
  else                           inicio = hoje.slice(0, 7) + '-01';

  /* pedidos cancelados não contam como receita */
  const validos   = todos.filter(p => p.status !== 'Cancelado');
  const filtrados = validos.filter(p => p.data >= inicio && p.data <= fim);

  const porData = {};
  filtrados.forEach(p => {
    if (!porData[p.data]) porData[p.data] = { total: 0, qtd: 0 };
    porData[p.data].total += Number(p.total) || 0;
    porData[p.data].qtd   += 1;
  });

  /* sequência de datas (limitada a ~2 anos para não travar) */
  const labels = [], totais = [], qtds = [];
  for (let d = inicio, n = 0; d <= fim && n < 800; d = somaDias(d, 1), n++) {
    labels.push(d);
    totais.push(+(porData[d]?.total || 0).toFixed(2));
    qtds.push(porData[d]?.qtd || 0);
  }

  const soma  = arr => arr.reduce((s, p) => s + (Number(p.total) || 0), 0);
  const doDia = d => validos.filter(p => p.data === d);
  const delta = (a, b) => b ? +(((a - b) / b) * 100).toFixed(1) : null;

  const receitaHoje  = soma(doDia(hoje)),  pedidosHoje  = doDia(hoje).length;
  const receitaOntem = soma(doDia(ontem)), pedidosOntem = doDia(ontem).length;

  const statusCounts = {};
  todos.forEach(p => { statusCounts[p.status] = (statusCounts[p.status] || 0) + 1; });

  res.json({
    labels, totais, qtds,
    totalReceita: +soma(filtrados).toFixed(2), totalPedidos: filtrados.length,
    receitaHoje: +receitaHoje.toFixed(2), pedidosHoje,
    deltaReceita: delta(receitaHoje, receitaOntem), deltaPedidos: delta(pedidosHoje, pedidosOntem),
    statusCounts, inicio, fim
  });
});

/* PUT /api/pedidos/:id/status — admin */
router.put('/:id/status', authAdmin, async (req, res) => {
  if (!STATUS.includes(req.body.status)) return res.status(400).json({ error: 'Status inválido.' });
  const arr  = await read('pedidos.json');
  const item = arr.find(p => p.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Pedido não encontrado.' });
  item.status = req.body.status;
  await write('pedidos.json', arr);
  res.json(item);
});

/* DELETE /api/pedidos/:id — admin */
router.delete('/:id', authAdmin, async (req, res) => {
  const arr  = await read('pedidos.json');
  const novo = arr.filter(p => p.id !== req.params.id);
  if (novo.length === arr.length) return res.status(404).json({ error: 'Pedido não encontrado.' });
  await write('pedidos.json', novo);
  res.json({ ok: true });
});

module.exports = router;
