const router = require('express').Router();
const { read, write } = require('../middleware/db');
const { authAdmin } = require('../middleware/auth');

/* GET /api/config — público (frontend usa freteGratis, whatsapp etc.) */
router.get('/', (req, res) => {
  res.json(read('config.json'));
});

/* PUT /api/config — admin */
router.put('/', authAdmin, (req, res) => {
  const atual = read('config.json');
  const novo  = { ...atual, ...req.body };
  write('config.json', novo);
  res.json(novo);
});

module.exports = router;
