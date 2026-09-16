const router = require('express').Router();
const axios  = require('axios');
const { authAdmin } = require('../middleware/auth');
const { read, write } = require('../middleware/db');

const KIWIFY_API = 'https://public-api.kiwify.com/v1';

function getLeads() {
  return read('leads.json') || [];
}
function saveLeads(leads) {
  write('leads.json', leads);
}
function getStatus() {
  return read('kiwify_status.json') || { conectado: false };
}
function saveStatus(s) {
  write('kiwify_status.json', s);
}

/* Extrai os campos que interessam de qualquer formato de payload que a
   Kiwify mande — os nomes de campo variam um pouco conforme o evento,
   então tentamos vários caminhos possíveis antes de desistir. */
function extrairDados(body) {
  const cliente = body.Customer || body.customer || {};
  const produto = body.Product || body.product || {};
  const comissao = body.Commissions || body.commissions || {};

  const nome = cliente.full_name || cliente.name || body.customer_name || '';
  const email = cliente.email || body.customer_email || '';
  const tel = cliente.mobile || cliente.phone || body.customer_mobile || '';

  const nomeProduto = produto.product_name || produto.name || body.product_name || '';

  const valorCentavos = comissao.charge_amount ?? comissao.product_base_price ?? body.total_price ?? body.charge_amount;
  const valor = valorCentavos != null
    ? (Number(valorCentavos) > 1000 ? (Number(valorCentavos) / 100).toFixed(2) : Number(valorCentavos).toFixed(2))
    : '';

  const status = (body.order_status || body.status || body.webhook_event_type || '').toLowerCase();
  const orderId = body.order_id || body.order_ref || body.id || '';

  return { nome, email, tel, nomeProduto, valor, status, orderId };
}

function statusParaStage(status) {
  if (['paid', 'approved', 'order_approved', 'completed'].includes(status)) return 'fechado';
  if (['refused', 'refunded', 'chargedback', 'canceled', 'cancelled'].includes(status)) return 'perdido';
  if (['waiting_payment', 'pix_created', 'boleto_created', 'billet_created'].includes(status)) return 'negociacao';
  return 'contato';
}

/* ── WEBHOOK KIWIFY ──────────────────────────────────────────
   Configure no painel da Kiwify (Configurações > Webhooks):
   URL: https://SEU-DOMINIO/api/kiwify/webhook?token=SEU_TOKEN
   (o token deve ser igual ao KIWIFY_WEBHOOK_TOKEN do .env)          */
router.post('/webhook', (req, res) => {
  const tokenEsperado = process.env.KIWIFY_WEBHOOK_TOKEN;
  if (tokenEsperado && req.query.token !== tokenEsperado) {
    return res.status(401).json({ error: 'Token inválido.' });
  }

  res.sendStatus(200); // responde rápido, processa depois

  try {
    const dados = extrairDados(req.body || {});
    const stage = statusParaStage(dados.status);

    const leads = getLeads();
    let lead = dados.orderId ? leads.find(l => l.kiwifyOrderId === dados.orderId) : null;

    if (lead) {
      lead.stage = stage;
      lead.valor = dados.valor || lead.valor;
    } else {
      leads.push({
        id:            Date.now(),
        nome:          dados.nome || 'Cliente Kiwify',
        email:         dados.email,
        tel:           dados.tel,
        produto:       dados.nomeProduto,
        valor:         dados.valor,
        obs:           'Importado automaticamente da Kiwify (status: ' + (dados.status || 'desconhecido') + ')',
        stage:         stage,
        origem:        'kiwify',
        kiwifyOrderId: dados.orderId,
        data:          new Date().toLocaleDateString('pt-BR')
      });
    }
    saveLeads(leads);

    saveStatus({
      conectado: true,
      ultimoEvento: dados.status || 'desconhecido',
      ultimoRecebidoEm: new Date().toISOString(),
      totalRecebidos: (getStatus().totalRecebidos || 0) + 1
    });

    console.log('Webhook Kiwify processado:', dados.status, dados.orderId);
  } catch (err) {
    console.error('Erro ao processar webhook Kiwify:', err.message);
  }
});

/* ── STATUS DA INTEGRAÇÃO (painel admin) ─────────────────── */
router.get('/status', authAdmin, (req, res) => {
  const s = getStatus();
  res.json({
    configurado: !!process.env.KIWIFY_WEBHOOK_TOKEN,
    token: process.env.KIWIFY_WEBHOOK_TOKEN || null,
    apiConfigurada: !!(process.env.KIWIFY_CLIENT_ID && process.env.KIWIFY_CLIENT_SECRET && process.env.KIWIFY_ACCOUNT_ID),
    ...s
  });
});

/* ══════════════════════════════════════════════════════════
   API DE PAGAMENTOS/VENDAS DA KIWIFY (public-api.kiwify.com)
   Usa OAuth2 client_credentials — client_id e client_secret
   são gerados em Kiwify > Configurações > API do desenvolvedor.
   Diferente do webhook (que é "push"), aqui é o nosso servidor
   que consulta ("pull") o histórico e o status real das vendas
   direto na Kiwify — útil pra conferência e para reprocessar
   uma venda caso o webhook falhe.
═══════════════════════════════════════════════════════════ */
function getKiwifyToken() {
  try { return read('kiwify_api_token.json'); } catch { return null; }
}
function saveKiwifyToken(data) {
  write('kiwify_api_token.json', { ...data, salvoEm: Date.now() });
}

async function kiwifyAuth() {
  const { KIWIFY_CLIENT_ID, KIWIFY_CLIENT_SECRET } = process.env;
  if (!KIWIFY_CLIENT_ID || !KIWIFY_CLIENT_SECRET) {
    throw new Error('KIWIFY_CLIENT_ID / KIWIFY_CLIENT_SECRET não configurados no .env. Gere em Kiwify > Configurações > API do desenvolvedor.');
  }

  const cache = getKiwifyToken();
  if (cache && Date.now() - cache.salvoEm < (cache.expires_in - 60) * 1000) {
    return cache.access_token;
  }

  const r = await axios.post(`${KIWIFY_API}/oauth/token`, {
    client_id:     KIWIFY_CLIENT_ID,
    client_secret: KIWIFY_CLIENT_SECRET,
    grant_type:    'client_credentials'
  });
  saveKiwifyToken(r.data);
  return r.data.access_token;
}

/* ── TESTAR CONEXÃO COM A API DA KIWIFY ──────────────────── */
router.get('/api-status', authAdmin, async (req, res) => {
  try {
    await kiwifyAuth();
    res.json({ conectado: true });
  } catch (err) {
    res.json({ conectado: false, erro: err.response?.data?.message || err.message });
  }
});

/* ── LISTAR VENDAS DIRETO DA KIWIFY (conferência/reconciliação) ──
   GET /api/kiwify/vendas?page=1                                    */
router.get('/vendas', authAdmin, async (req, res) => {
  try {
    const token = await kiwifyAuth();
    const { KIWIFY_ACCOUNT_ID } = process.env;
    if (!KIWIFY_ACCOUNT_ID) {
      return res.status(400).json({ error: 'KIWIFY_ACCOUNT_ID não configurado no .env.' });
    }

    const r = await axios.get(`${KIWIFY_API}/sales`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-kiwify-account-id': KIWIFY_ACCOUNT_ID
      },
      params: { page: req.query.page || 1 }
    });

    res.json(r.data);
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.message || err.message });
  }
});

/* ── IMPORTAR VENDAS DA KIWIFY PARA O CRM (backfill) ─────────
   POST /api/kiwify/importar-vendas
   Puxa as vendas recentes da API e cria/atualiza leads, exatamente
   como o webhook faz — útil pra trazer vendas de antes de configurar
   o webhook, ou se algum evento não chegou.                        */
router.post('/importar-vendas', authAdmin, async (req, res) => {
  try {
    const token = await kiwifyAuth();
    const { KIWIFY_ACCOUNT_ID } = process.env;
    if (!KIWIFY_ACCOUNT_ID) {
      return res.status(400).json({ error: 'KIWIFY_ACCOUNT_ID não configurado no .env.' });
    }

    const r = await axios.get(`${KIWIFY_API}/sales`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-kiwify-account-id': KIWIFY_ACCOUNT_ID
      },
      params: { page: req.query.page || 1 }
    });

    const vendas = r.data?.data || r.data?.sales || r.data || [];
    const leads  = getLeads();
    let importados = 0;

    vendas.forEach(venda => {
      const dados = extrairDados(venda);
      const stage = statusParaStage(dados.status);
      const orderId = dados.orderId || venda.id;
      const existente = leads.find(l => l.kiwifyOrderId === orderId);
      if (existente) {
        existente.stage = stage;
        existente.valor = dados.valor || existente.valor;
      } else {
        leads.push({
          id: Date.now() + importados,
          nome: dados.nome || 'Cliente Kiwify',
          email: dados.email,
          tel: dados.tel,
          produto: dados.nomeProduto,
          valor: dados.valor,
          obs: 'Importado da API da Kiwify (status: ' + (dados.status || 'desconhecido') + ')',
          stage,
          origem: 'kiwify',
          kiwifyOrderId: orderId,
          data: new Date().toLocaleDateString('pt-BR')
        });
        importados++;
      }
    });

    saveLeads(leads);
    res.json({ ok: true, total: vendas.length, importados });
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.message || err.message });
  }
});

module.exports = router;
