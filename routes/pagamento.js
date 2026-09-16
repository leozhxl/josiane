const router = require('express').Router();
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const { authUser } = require('../middleware/auth');
const { read, write } = require('../middleware/db');

function getMPClient() {
  return new MercadoPagoConfig({
    accessToken: process.env.MP_ACCESS_TOKEN || '',
    options: { timeout: 5000 }
  });
}

/* ── CRIAR PREFERÊNCIA DE PAGAMENTO ─────────────────────── */
/* POST /api/pagamento/criar
   Body: { itens: [{nome, qty, preco}], pedidoId }
   Retorna: { init_point, sandbox_init_point }
*/
router.post('/criar', authUser, async (req, res) => {
  try {
    const { itens, pedidoId } = req.body;
    if (!itens || !itens.length) return res.status(400).json({ error: 'Itens obrigatórios.' });

    const client = getMPClient();
    const preference = new Preference(client);

    const result = await preference.create({
      body: {
        items: itens.map(i => ({
          title:       i.nome,
          quantity:    i.qty,
          unit_price:  parseFloat(i.preco),
          currency_id: 'BRL'
        })),
        payer: {
          email: req.user.email,
          name:  req.user.nome
        },
        external_reference: pedidoId || '',
        notification_url: `${process.env.BASE_URL}/api/pagamento/webhook`
      }
    });

    res.json({
      preferenceId:       result.id,
      init_point:         result.init_point,
      sandbox_init_point: result.sandbox_init_point
    });
  } catch (err) {
    const detalhe = err?.cause?.message || err?.cause || err.message;
    console.error('MP criar preferência — detalhe:', JSON.stringify(err?.cause || err.message));
    res.status(500).json({ error: 'Erro MP: ' + detalhe });
  }
});

/* ── WEBHOOK MERCADO PAGO ─────────────────────────────────── */
/* POST /api/pagamento/webhook  (sem autenticação — chamado pelo MP) */
router.post('/webhook', async (req, res) => {
  res.sendStatus(200); // responde rápido para o MP

  try {
    const { type, data } = req.body;
    if (type !== 'payment' || !data?.id) return;

    const client  = getMPClient();
    const payment = new Payment(client);
    const info    = await payment.get({ id: data.id });

    if (info.status === 'approved') {
      const pedidoId = info.external_reference;
      if (!pedidoId) return;

      const pedidos = read('pedidos.json');
      const pedido  = pedidos.find(p => p.id === pedidoId);
      if (pedido) {
        pedido.status     = 'Confirmado';
        pedido.pagamentoId = String(info.id);
        pedido.metodoPagamento = info.payment_type_id;
        write('pedidos.json', pedidos);
        console.log(`Pedido ${pedidoId} confirmado via MP (payment ${info.id})`);
      }
    }
  } catch (err) {
    console.error('Webhook MP erro:', err.message);
  }
});

/* ── STATUS DE PAGAMENTO ─────────────────────────────────── */
/* GET /api/pagamento/status/:paymentId */
router.get('/status/:paymentId', authUser, async (req, res) => {
  try {
    const client  = getMPClient();
    const payment = new Payment(client);
    const info    = await payment.get({ id: req.params.paymentId });
    res.json({ status: info.status, status_detail: info.status_detail });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── PUBLIC KEY (para o frontend inicializar o SDK JS do MP) */
router.get('/public-key', (req, res) => {
  res.json({ publicKey: process.env.MP_PUBLIC_KEY || '' });
});

module.exports = router;
