const router = require('express').Router();
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
const { read, write } = require('../middleware/db');
const { authAdmin } = require('../middleware/auth');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'public', 'uploads');
    try { fs.mkdirSync(dir, { recursive: true }); cb(null, dir); } catch (e) { cb(e); }
  },
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

/* GET /api/anuncios — público */
router.get('/', (req, res) => {
  let anuncios = read('anuncios.json');
  const { q, status } = req.query;
  if (status)  anuncios = anuncios.filter(a => a.status === status);
  if (q) { const s = q.toLowerCase(); anuncios = anuncios.filter(a => (a.titulo + (a.marca || '')).toLowerCase().includes(s)); }
  res.json(anuncios);
});

/* GET /api/anuncios/:id — público */
router.get('/:id', (req, res) => {
  const a = read('anuncios.json').find(x => String(x.id) === req.params.id);
  if (!a) return res.status(404).json({ error: 'Anúncio não encontrado.' });
  res.json(a);
});

/* POST /api/anuncios/upload — admin, sobe foto e devolve URL */
router.post('/upload', authAdmin, upload.single('foto'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
  res.json({ url: '/uploads/' + req.file.filename });
});

/* POST /api/anuncios — admin */
router.post('/', authAdmin, (req, res) => {
  const arr = read('anuncios.json');
  const novo = { id: Date.now(), criadoEm: new Date().toISOString(), ...req.body };
  arr.push(novo);
  write('anuncios.json', arr);
  res.status(201).json(novo);
});

/* PUT /api/anuncios/:id — admin */
router.put('/:id', authAdmin, (req, res) => {
  const arr = read('anuncios.json');
  const idx = arr.findIndex(x => String(x.id) === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Anúncio não encontrado.' });
  arr[idx] = { ...arr[idx], ...req.body, id: arr[idx].id, criadoEm: arr[idx].criadoEm };
  write('anuncios.json', arr);
  res.json(arr[idx]);
});

/* DELETE /api/anuncios/:id — admin */
router.delete('/:id', authAdmin, (req, res) => {
  const arr = read('anuncios.json');
  const novo = arr.filter(x => String(x.id) !== req.params.id);
  if (novo.length === arr.length) return res.status(404).json({ error: 'Anúncio não encontrado.' });
  write('anuncios.json', novo);
  res.json({ ok: true });
});

module.exports = router;
