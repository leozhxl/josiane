const router = require('express').Router();
const axios  = require('axios');
const { authAdmin } = require('../middleware/auth');
const { read, write } = require('../middleware/db');
const { isoBR, somaDias } = require('../middleware/datas');

const KIWIFY_API = 'https://public-api.kiwify.com/v1';

const getLeads   = () => read('leads.json');
const saveLeads  = leads => write('leads.json', leads);
const getStatus  = () => read('kiwify_status.json', {});
const saveStatus = s => write('kiwify_status.json', s);

/* Extrai os campos que interessam de qualquer formato de payload que a
   Kiwify mande (webhook ou API de vendas) — os nomes de campo variam
   conforme o evento, então tentamos vários caminhos possíveis.       */
function extrairDados(body) {
  const cliente  = body.Customer || body.customer || {};
  const produto  = body.Product || body.product || {};
  const comissao = body.Commissions || body.commissions || {};

  const nome  = cliente.full_name || cliente.name || body.customer_name || body.name || '';
  const email = cliente.email || body.customer_email || body.email || '';
  const tel   = cliente.mobile || cliente.phone || body.customer_mobile || body.phone || '';

  const nomeProduto = produto.product_name || produto.name || body.product_name || '';

  /* A Kiwify manda valores em centavos (Commissions.*, net_amount, charge_amount) */
  const centavos = comissao.charge_amount ?? comissao.product_base_price ?? body.charge_amount ?? body.net_amount;
  let valor = '';
  if (centavos != null && centavos !== '' && isFinite(Number(centavos))) {
    valor = (Number(centavos) / 100).toFixed(2);
  } else if (body.total_price != null && isFinite(Number(body.total_price))) {
    valor = Number(body.total_price).toFixed(2);
  }

  const status  = String(body.order_status || body.status || body.webhook_event_type || '').toLowerCase();
  const orderId = String(body.order_id || body.order_ref || body.id || '');

  return { nome, email, tel, nomeProduto, valor, status, orderId };
}

function statusParaStage(status) {
  if (['paid', 'approved', 'order_approved', 'completed'].includes(status)) return 'fechado';
  if (['refused', 'rejected', 'order_rejected', 'refunded', 'order_refunded', 'chargedback', 'chargeback',
       'canceled', 'cancelled', 'subscription_canceled'].includes(status)) return 'perdido';
  if (['waiting_payment', 'pending', 'processing', 'pix_created', 'boleto_created', 'billet_created'].includes(status)) return 'negociacao';
  return 'contato';
}

function dataBR() {
  return new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

/* cria ou atualiza o lead de uma venda; devolve true se criou */
function aplicarVenda(leads, dados, origemTxt, idExtra = 0) {
  const stage = statusParaStage(dados.status);
  const existente = dados.orderId ? leads.find(l => l.kiwifyOrderId === dados.orderId) : null;
  if (existente) {
    existente.stage = stage;
    existente.valor = dados.valor || existente.valor;
    existente.atualizadoEm = new Date().toISOString();
    return false;
  }
  leads.push({
    id:            Date.now() + idExtra,
    nome:          dados.nome || 'Cliente Kiwify',
    email:         dados.email,
    tel:           dados.tel,
    produto:       dados.nomeProduto,
    valor:         dados.valor,
    obs:           origemTxt + ' (status: ' + (dados.status || 'desconhecido') + ')',
    stage,
    origem:        'kiwify',
    kiwifyOrderId: dados.orderId,
    data:          dataBR(),
    atualizadoEm:  new Date().toISOString()
  });
  return true;
}

/* ── WEBHOOK KIWIFY ──────────────────────────────────────────
   Configure no painel da Kiwify (Configurações > Webhooks):
   URL: https://SEU-DOMINIO/api/kiwify/webhook?token=SEU_TOKEN
   (o token deve ser igual ao KIWIFY_WEBHOOK_TOKEN do .env)
   Processamos antes de responder: no Vercel a função é congelada
   assim que a resposta sai, então nada roda depois do res.send. */
router.post('/webhook', async (req, res) => {
  const tokenEsperado = process.env.KIWIFY_WEBHOOK_TOKEN;
  if (tokenEsperado && req.query.token !== tokenEsperado) {
    return res.status(401).json({ error: 'Token inválido.' });
  }

  try {
    const dados = extrairDados(req.body || {});
    const leads = await getLeads();
    aplicarVenda(leads, dados, 'Importado automaticamente da Kiwify');
    await saveLeads(leads);

    const s = await getStatus();
    await saveStatus({
      conectado: true,
      ultimoEvento: dados.status || 'desconhecido',
      ultimoRecebidoEm: new Date().toISOString(),
      totalRecebidos: (s.totalRecebidos || 0) + 1
    });
    console.log('Webhook Kiwify processado:', dados.status, dados.orderId);
  } catch (err) {
    console.error('Erro ao processar webhook Kiwify:', err.message);
    return res.sendStatus(500); // a Kiwify tenta de novo
  }
  res.sendStatus(200);
});

/* ── STATUS DA INTEGRAÇÃO (painel admin) ─────────────────── */
router.get('/status', authAdmin, async (req, res) => {
  const s = await getStatus();
  res.json({
    configurado: !!process.env.KIWIFY_WEBHOOK_TOKEN,
    token: process.env.KIWIFY_WEBHOOK_TOKEN || null,
    apiConfigurada: !!(process.env.KIWIFY_CLIENT_ID && process.env.KIWIFY_CLIENT_SECRET && process.env.KIWIFY_ACCOUNT_ID),
    ...s
  });
});

/* ══════════════════════════════════════════════════════════
   API DE VENDAS DA KIWIFY (public-api.kiwify.com)
   OAuth2 client_credentials — client_id e client_secret são
   gerados em Kiwify > Configurações > API do desenvolvedor.
   Diferente do webhook (push), aqui o servidor consulta (pull)
   o histórico — útil para conferência e para recuperar vendas
   caso algum webhook não tenha chegado.
═══════════════════════════════════════════════════════════ */
async function kiwifyAuth() {
  const { KIWIFY_CLIENT_ID, KIWIFY_CLIENT_SECRET } = process.env;
  if (!KIWIFY_CLIENT_ID || !KIWIFY_CLIENT_SECRET) {
    throw new Error('KIWIFY_CLIENT_ID / KIWIFY_CLIENT_SECRET não configurados no .env. Gere em Kiwify > Configurações > API do desenvolvedor.');
  }

  const cache = await read('kiwify_api_token.json', null);
  if (cache && cache.access_token && Date.now() - cache.salvoEm < ((cache.expires_in || 0) - 60) * 1000) {
    return cache.access_token;
  }

  const r = await axios.post(`${KIWIFY_API}/oauth/token`,
    new URLSearchParams({ client_id: KIWIFY_CLIENT_ID, client_secret: KIWIFY_CLIENT_SECRET, grant_type: 'client_credentials' }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 });
  await write('kiwify_api_token.json', { ...r.data, salvoEm: Date.now() });
  return r.data.access_token;
}

async function buscarVendas(token, params) {
  const { KIWIFY_ACCOUNT_ID } = process.env;
  if (!KIWIFY_ACCOUNT_ID) {
    const e = new Error('KIWIFY_ACCOUNT_ID não configurado no .env.'); e.status = 400; throw e;
  }
  const hoje = isoBR();
  const r = await axios.get(`${KIWIFY_API}/sales`, {
    headers: { Authorization: `Bearer ${token}`, 'x-kiwify-account-id': KIWIFY_ACCOUNT_ID },
    params: { start_date: somaDias(hoje, -89), end_date: hoje, page_size: 100, ...params },
    timeout: 15000
  });
  const d = r.data || {};
  return { vendas: d.data || d.sales || (Array.isArray(d) ? d : []), bruto: d };
}

function erroKiwify(err) {
  return err.response?.data?.message || err.response?.data?.error || err.message;
}

/* ── TESTAR CONEXÃO COM A API DA KIWIFY ──────────────────── */
router.get('/api-status', authAdmin, async (req, res) => {
  try {
    await kiwifyAuth();
    res.json({ conectado: true });
  } catch (err) {
    res.json({ conectado: false, erro: erroKiwify(err) });
  }
});

/* ── LISTAR VENDAS DIRETO DA KIWIFY ──────────────────────────
   GET /api/kiwify/vendas?page=1                                    */
router.get('/vendas', authAdmin, async (req, res) => {
  try {
    const token = await kiwifyAuth();
    const { bruto } = await buscarVendas(token, { page_number: Number(req.query.page) || 1 });
    res.json(bruto);
  } catch (err) {
    res.status(err.status || 500).json({ error: erroKiwify(err) });
  }
});

/* ── IMPORTAR VENDAS DA KIWIFY PARA O CRM (últimos 90 dias) ──
   POST /api/kiwify/importar-vendas                                  */
router.post('/importar-vendas', authAdmin, async (req, res) => {
  try {
    const token = await kiwifyAuth();
    const leads = await getLeads();
    let total = 0, importados = 0;

    for (let page = 1; page <= 20; page++) {
      const { vendas } = await buscarVendas(token, { page_number: page });
      vendas.forEach(venda => {
        const dados = extrairDados(venda);
        if (!dados.orderId) dados.orderId = String(venda.id || '');
        if (aplicarVenda(leads, dados, 'Importado da API da Kiwify', importados)) importados++;
      });
      total += vendas.length;
      if (vendas.length < 100) break;
    }

    await saveLeads(leads);
    res.json({ ok: true, total, importados });
  } catch (err) {
    res.status(err.status || 500).json({ error: erroKiwify(err) });
  }
});

module.exports = router;
