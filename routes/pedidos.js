const router = require('express').Router();
const { read, write } = require('../middleware/db');
const { authUser, authAdmin } = require('../middleware/auth');

/* GET /api/pedidos — admin vê todos; usuário vê os seus */
router.get('/', authUser, (req, res) => {
  let pedidos = read('pedidos.json');
  const { q, status } = req.query;

  if (req.user.role !== 'admin')
    pedidos = pedidos.filter(p => p.email === req.user.email);

  if (status) pedidos = pedidos.filter(p => p.status === status);
  if (q) { const s = q.toLowerCase(); pedidos = pedidos.filter(p => (p.id + p.cliente).toLowerCase().includes(s)); }

  res.json(pedidos);
});

/* POST /api/pedidos — usuário autenticado */
router.post('/', authUser, (req, res) => {
  const arr = read('pedidos.json');
  const num = 'PED-' + String(arr.length + 1).padStart(3, '0');
  const novo = {
    id: num,
    cliente: req.user.nome,
    email: req.user.email,
    produtos: req.body.produtos,
    total: req.body.total,
    data: new Date().toISOString().slice(0, 10),
    status: 'Aguardando'
  };
  arr.push(novo);
  write('pedidos.json', arr);
  res.status(201).json(novo);
});

/* PUT /api/pedidos/:id/status — admin */
router.put('/:id/status', authAdmin, (req, res) => {
  const arr = read('pedidos.json');
  const item = arr.find(p => p.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Pedido não encontrado.' });
  item.status = req.body.status;
  write('pedidos.json', arr);
  res.json(item);
});

/* DELETE /api/pedidos/:id — admin */
router.delete('/:id', authAdmin, (req, res) => {
  const arr = read('pedidos.json');
  const novo = arr.filter(p => p.id !== req.params.id);
  if (novo.length === arr.length) return res.status(404).json({ error: 'Pedido não encontrado.' });
  write('pedidos.json', novo);
  res.json({ ok: true });
});

/* GET /api/pedidos/analytics?periodo=hoje|semana|mes|ano|custom&de=YYYY-MM-DD&ate=YYYY-MM-DD */
router.get('/analytics', authAdmin, (req, res) => {
  const todos = read('pedidos.json');
  const { periodo = 'mes', de, ate } = req.query;

  const hoje = new Date();
  const iso  = d => d.toISOString().slice(0, 10);

  let inicio, fim;
  if (periodo === 'hoje') {
    inicio = iso(hoje); fim = iso(hoje);
  } else if (periodo === 'semana') {
    const d = new Date(hoje); d.setDate(hoje.getDate() - 6);
    inicio = iso(d); fim = iso(hoje);
  } else if (periodo === 'mes') {
    inicio = iso(hoje).slice(0, 7) + '-01';
    fim    = iso(hoje);
  } else if (periodo === 'ano') {
    inicio = iso(hoje).slice(0, 4) + '-01-01';
    fim    = iso(hoje);
  } else if (periodo === 'custom' && de && ate) {
    inicio = de; fim = ate;
  } else {
    inicio = iso(hoje).slice(0, 7) + '-01'; fim = iso(hoje);
  }

  const filtrados = todos.filter(p => p.data >= inicio && p.data <= fim);

  // Agrupar por data
  const porData = {};
  filtrados.forEach(p => {
    const d = p.data || iso(hoje);
    if (!porData[d]) porData[d] = { total: 0, qtd: 0 };
    porData[d].total += Number(p.total) || 0;
    porData[d].qtd   += 1;
  });

  // Gerar sequência de datas
  const labels = [], totais = [], qtds = [];
  const cur = new Date(inicio + 'T00:00:00');
  const end = new Date(fim    + 'T00:00:00');
  while (cur <= end) {
    const d = iso(cur);
    labels.push(d);
    totais.push(+(porData[d]?.total || 0).toFixed(2));
    qtds.push(porData[d]?.qtd || 0);
    cur.setDate(cur.getDate() + 1);
  }

  // Totais resumo
  const totalReceita  = filtrados.reduce((s, p) => s + (Number(p.total) || 0), 0);
  const totalPedidos  = filtrados.length;
  const receitaHoje   = todos.filter(p => p.data === iso(hoje)).reduce((s, p) => s + (Number(p.total)||0), 0);
  const pedidosHoje   = todos.filter(p => p.data === iso(hoje)).length;
  const receitaOntem  = (() => { const d = new Date(hoje); d.setDate(d.getDate()-1); const dd = iso(d); return todos.filter(p=>p.data===dd).reduce((s,p)=>s+(Number(p.total)||0),0); })();
  const pedidosOntem  = (() => { const d = new Date(hoje); d.setDate(d.getDate()-1); const dd = iso(d); return todos.filter(p=>p.data===dd).length; })();

  const deltaReceita = receitaOntem ? (((receitaHoje - receitaOntem)/receitaOntem)*100).toFixed(1) : null;
  const deltaPedidos = pedidosOntem ? (((pedidosHoje - pedidosOntem)/pedidosOntem)*100).toFixed(1) : null;

  // Status counts (total geral)
  const statusCounts = {};
  todos.forEach(p => { statusCounts[p.status] = (statusCounts[p.status]||0)+1; });

  res.json({ labels, totais, qtds, totalReceita: +totalReceita.toFixed(2), totalPedidos, receitaHoje: +receitaHoje.toFixed(2), pedidosHoje, deltaReceita, deltaPedidos, statusCounts, inicio, fim });
});

module.exports = router;
