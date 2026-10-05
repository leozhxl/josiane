const router = require('express').Router();
const { getImage } = require('../middleware/db');

/* GET /api/imagens/:id — serve imagens enviadas quando o armazenamento é o Redis */
router.get('/:id', async (req, res) => {
  const img = await getImage(req.params.id);
  if (!img) return res.status(404).send('Imagem não encontrada');
  res.setHeader('Content-Type', img.mime || 'image/jpeg');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.send(img.buffer);
});

module.exports = router;
