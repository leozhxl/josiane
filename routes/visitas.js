const router = require('express').Router();
const { authAdmin } = require('../middleware/auth');
const { read, write } = require('../middleware/db');
const { isoBR, somaDias } = require('../middleware/datas');

/* POST /api/visitas — público; a loja chama uma vez por sessão do visitante */
router.post('/', async (req, res) => {
  const dias = await read('visitas.json', {});
  const hoje = isoBR();
  dias[hoje] = (dias[hoje] || 0) + 1;
  /* mantém só os últimos ~400 dias */
  const limite = somaDias(hoje, -400);
  Object.keys(dias).forEach(d => { if (d < limite) delete dias[d]; });
  await write('visitas.json', dias);
  res.json({ ok: true });
});

/* GET /api/visitas — admin: hoje, ontem e série dos últimos 12 dias */
router.get('/', authAdmin, async (req, res) => {
  const dias  = await read('visitas.json', {});
  const hoje  = isoBR();
  const ontem = somaDias(hoje, -1);
  const serie = [];
  for (let i = 11; i >= 0; i--) serie.push(dias[somaDias(hoje, -i)] || 0);
  const h = dias[hoje] || 0, o = dias[ontem] || 0;
  res.json({ hoje: h, ontem: o, delta: o ? +(((h - o) / o) * 100).toFixed(1) : null, serie });
});

module.exports = router;
