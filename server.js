require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

/* ── MIDDLEWARES ────────────────────────────────────────────── */
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

/* ── ROTAS API ──────────────────────────────────────────────── */
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/produtos',  require('./routes/produtos'));
app.use('/api/pedidos',   require('./routes/pedidos'));
app.use('/api/clientes',  require('./routes/clientes'));
app.use('/api/anuncios',  require('./routes/anuncios'));
app.use('/api/config',    require('./routes/config'));
app.use('/api/pagamento', require('./routes/pagamento'));
app.use('/api/ml',        require('./routes/mercadolivre'));
app.use('/api/enderecos', require('./routes/enderecos'));
app.use('/api/leads',     require('./routes/leads'));
app.use('/api/kiwify',    require('./routes/kiwify'));

/* ── FALLBACK SPA ───────────────────────────────────────────── */
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Rota não encontrada.' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`Servidor rodando em http://localhost:${PORT}`));
}

module.exports = app;
