const router = require('express').Router();
const multer = require('multer');
const path   = require('path');
const { read, write, saveImage } = require('../middleware/db');
const { authAdmin } = require('../middleware/auth');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\//.test(file.mimetype))
});

/* GET /api/anuncios — público */
router.get('/', async (req, res) => {
  let anuncios = await read('anuncios.json');
  const { q, status } = req.query;
  if (status)  anuncios = anuncios.filter(a => a.status === status);
  if (q) { const s = q.toLowerCase(); anuncios = anuncios.filter(a => ((a.titulo || '') + (a.marca || '')).toLowerCase().includes(s)); }
  res.json(anuncios);
});

/* GET /api/anuncios/:id — público */
router.get('/:id', async (req, res) => {
  const a = (await read('anuncios.json')).find(x => String(x.id) === req.params.id);
  if (!a) return res.status(404).json({ error: 'Anúncio não encontrado.' });
  res.json(a);
});

/* POST /api/anuncios/upload — admin, sobe foto e devolve URL */
router.post('/upload', authAdmin, upload.single('foto'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem válida enviada.' });
  const ext = path.extname(req.file.originalname || '').toLowerCase() || '.jpg';
  const url = await saveImage(req.file.buffer, req.file.mimetype, ext);
  res.json({ url });
});

/* POST /api/anuncios — admin */
router.post('/', authAdmin, async (req, res) => {
  if (!req.body.titulo) return res.status(400).json({ error: 'Título obrigatório.' });
  const arr = await read('anuncios.json');
  const novo = { id: Date.now(), criadoEm: new Date().toISOString(), ...req.body };
  arr.push(novo);
  await write('anuncios.json', arr);
  res.status(201).json(novo);
});

/* PUT /api/anuncios/:id — admin */
router.put('/:id', authAdmin, async (req, res) => {
  const arr = await read('anuncios.json');
  const idx = arr.findIndex(x => String(x.id) === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Anúncio não encontrado.' });
  arr[idx] = { ...arr[idx], ...req.body, id: arr[idx].id, criadoEm: arr[idx].criadoEm };
  await write('anuncios.json', arr);
  res.json(arr[idx]);
});

/* DELETE /api/anuncios/:id — admin */
router.delete('/:id', authAdmin, async (req, res) => {
  const arr = await read('anuncios.json');
  const novo = arr.filter(x => String(x.id) !== req.params.id);
  if (novo.length === arr.length) return res.status(404).json({ error: 'Anúncio não encontrado.' });
  await write('anuncios.json', novo);
  res.json({ ok: true });
});

module.exports = router;
