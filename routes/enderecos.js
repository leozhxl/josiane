const router = require('express').Router();
const { read, write } = require('../middleware/db');
const { authUser } = require('../middleware/auth');

function getEnderecos(userId) {
  try {
    var all = read('enderecos.json');
    return all.filter(function (e) { return e.userId === userId; });
  } catch { return []; }
}

function saveEndereco(userId, endereco) {
  var all = [];
  try { all = read('enderecos.json'); } catch {}

  /* se marcou como predefinido, desmarca os outros */
  if (endereco.predefinido) {
    all.forEach(function (e) { if (e.userId === userId) e.predefinido = false; });
  }

  if (endereco.id) {
    var idx = all.findIndex(function (e) { return e.id === endereco.id && e.userId === userId; });
    if (idx > -1) { all[idx] = { ...all[idx], ...endereco }; }
    else all.push(endereco);
  } else {
    endereco.id = Date.now();
    /* primeiro endereço é predefinido automaticamente */
    if (!all.filter(function (e) { return e.userId === userId; }).length) endereco.predefinido = true;
    all.push(endereco);
  }
  write('enderecos.json', all);
  return endereco;
}

/* GET /api/enderecos */
router.get('/', authUser, function (req, res) {
  res.json(getEnderecos(req.user.id));
});

/* POST /api/enderecos */
router.post('/', authUser, function (req, res) {
  var { cep, rua, numero, semNumero, complemento, nome, telefone, predefinido } = req.body;
  if (!cep || !rua || !nome) return res.status(400).json({ error: 'CEP, rua e nome são obrigatórios.' });
  var salvo = saveEndereco(req.user.id, {
    userId: req.user.id, cep, rua, numero: semNumero ? 'S/N' : numero,
    complemento, nome, telefone, predefinido: !!predefinido
  });
  res.status(201).json(salvo);
});

/* PUT /api/enderecos/:id */
router.put('/:id', authUser, function (req, res) {
  var id = +req.params.id;
  var salvo = saveEndereco(req.user.id, { ...req.body, id, userId: req.user.id });
  res.json(salvo);
});

/* DELETE /api/enderecos/:id */
router.delete('/:id', authUser, function (req, res) {
  var all = read('enderecos.json');
  var novo = all.filter(function (e) { return !(e.id === +req.params.id && e.userId === req.user.id); });
  write('enderecos.json', novo);
  res.json({ ok: true });
});

module.exports = router;
