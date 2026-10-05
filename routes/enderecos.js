const router = require('express').Router();
const { read, write } = require('../middleware/db');
const { authUser } = require('../middleware/auth');

async function saveEndereco(userId, endereco) {
  const all = await read('enderecos.json');

  /* se marcou como predefinido, desmarca os outros */
  if (endereco.predefinido) {
    all.forEach(e => { if (e.userId === userId) e.predefinido = false; });
  }

  if (endereco.id) {
    const idx = all.findIndex(e => e.id === endereco.id && e.userId === userId);
    if (idx > -1) all[idx] = { ...all[idx], ...endereco };
    else all.push(endereco);
  } else {
    endereco.id = Date.now();
    /* primeiro endereço é predefinido automaticamente */
    if (!all.some(e => e.userId === userId)) endereco.predefinido = true;
    all.push(endereco);
  }
  await write('enderecos.json', all);
  return endereco;
}

/* GET /api/enderecos */
router.get('/', authUser, async (req, res) => {
  res.json((await read('enderecos.json')).filter(e => e.userId === req.user.id));
});

/* POST /api/enderecos */
router.post('/', authUser, async (req, res) => {
  const { cep, rua, numero, semNumero, complemento, nome, telefone, predefinido } = req.body;
  if (!cep || !rua || !nome) return res.status(400).json({ error: 'CEP, rua e nome são obrigatórios.' });
  const salvo = await saveEndereco(req.user.id, {
    userId: req.user.id, cep, rua, numero: semNumero ? 'S/N' : numero,
    complemento, nome, telefone, predefinido: !!predefinido
  });
  res.status(201).json(salvo);
});

/* PUT /api/enderecos/:id */
router.put('/:id', authUser, async (req, res) => {
  const salvo = await saveEndereco(req.user.id, { ...req.body, id: +req.params.id, userId: req.user.id });
  res.json(salvo);
});

/* DELETE /api/enderecos/:id */
router.delete('/:id', authUser, async (req, res) => {
  const all  = await read('enderecos.json');
  const novo = all.filter(e => !(e.id === +req.params.id && e.userId === req.user.id));
  await write('enderecos.json', novo);
  res.json({ ok: true });
});

module.exports = router;
