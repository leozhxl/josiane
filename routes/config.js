const router = require('express').Router();
const { read, write } = require('../middleware/db');
const { authAdmin } = require('../middleware/auth');

const CAMPOS = ['nomeLoja', 'cnpj', 'emailContato', 'telefone', 'whatsapp', 'endereco', 'freteGratis'];

/* GET /api/config — público (frontend usa freteGratis, whatsapp etc.) */
router.get('/', async (req, res) => {
  res.json(await read('config.json', {}));
});

/* PUT /api/config — admin */
router.put('/', authAdmin, async (req, res) => {
  const atual = await read('config.json', {});
  const novo  = { ...atual };
  CAMPOS.forEach(k => { if (req.body[k] !== undefined) novo[k] = String(req.body[k]).trim(); });
  await write('config.json', novo);
  res.json(novo);
});

module.exports = router;
