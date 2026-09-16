const router = require('express').Router();
const axios  = require('axios');
const { authAdmin } = require('../middleware/auth');
const { read, write } = require('../middleware/db');

/* ── PROXY DE IMAGEM (evita CORS do mlstatic) ────────────── */
/* GET /api/ml/img?url=https://http2.mlstatic.com/... */
router.get('/img', async (req, res) => {
  const { url } = req.query;
  if (!url || !url.startsWith('https://http2.mlstatic.com')) {
    return res.status(400).send('URL inválida');
  }
  try {
    const r = await axios.get(url, { responseType: 'stream', timeout: 8000 });
    res.setHeader('Content-Type', r.headers['content-type'] || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    r.data.pipe(res);
  } catch {
    res.status(502).send('Erro ao carregar imagem');
  }
});

const ML_API  = 'https://api.mercadolibre.com';
const ML_AUTH = 'https://auth.mercadolivre.com.br';

/* ── TOKEN ML ────────────────────────────────────────────── */
function getMlToken() {
  try { return read('ml_token.json'); } catch { return null; }
}
function saveMlToken(data) {
  write('ml_token.json', { ...data, salvoEm: Date.now() });
}

async function mlToken() {
  const t = getMlToken();
  if (!t) throw new Error('Conta Mercado Livre não autorizada. Acesse o painel admin > Integrações.');

  /* renova se expirar em menos de 5 min */
  if (Date.now() - t.salvoEm > (t.expires_in - 300) * 1000) {
    const r = await axios.post(`${ML_API}/oauth/token`, {
      grant_type:    'refresh_token',
      client_id:     process.env.ML_APP_ID,
      client_secret: process.env.ML_CLIENT_SECRET,
      refresh_token: t.refresh_token
    });
    saveMlToken(r.data);
    return r.data.access_token;
  }
  return t.access_token;
}

/* ── OAUTH — GERA URL DE AUTORIZAÇÃO ────────────────────── */
router.get('/auth-url', authAdmin, (req, res) => {
  if (!process.env.ML_APP_ID) {
    return res.status(400).json({ error: 'ML_APP_ID não configurado no .env' });
  }
  const url = `${ML_AUTH}/authorization?response_type=code`
    + `&client_id=${process.env.ML_APP_ID}`
    + `&redirect_uri=${encodeURIComponent(process.env.ML_REDIRECT_URI)}`;
  res.json({ url });
});

/* ── OAUTH — CALLBACK ────────────────────────────────────── */
router.get('/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.redirect('/admin.html?ml=erro');
  try {
    const r = await axios.post(`${ML_API}/oauth/token`, {
      grant_type:    'authorization_code',
      client_id:     process.env.ML_APP_ID,
      client_secret: process.env.ML_CLIENT_SECRET,
      code,
      redirect_uri:  process.env.ML_REDIRECT_URI
    });
    saveMlToken(r.data);
    res.redirect('/admin.html?ml=ok');
  } catch (err) {
    console.error('ML callback erro:', err.response?.data || err.message);
    res.redirect('/admin.html?ml=erro');
  }
});

/* ── STATUS DA CONEXÃO ML ────────────────────────────────── */
router.get('/status', authAdmin, async (req, res) => {
  const t = getMlToken();
  if (!t) return res.json({ conectado: false });
  try {
    const token = await mlToken();
    const info  = await axios.get(`${ML_API}/users/me`, { headers: { Authorization: `Bearer ${token}` } });
    res.json({ conectado: true, usuario: info.data.nickname, id: info.data.id });
  } catch {
    res.json({ conectado: false });
  }
});

/* ── PUBLICAR PRODUTO NO ML ──────────────────────────────── */
/* POST /api/ml/publicar/:produtoId */
router.post('/publicar/:produtoId', authAdmin, async (req, res) => {
  try {
    const token    = await mlToken();
    const produtos = read('produtos.json');
    const produto  = produtos.find(p => p.id === +req.params.produtoId);
    if (!produto) return res.status(404).json({ error: 'Produto não encontrado.' });

    /* categoria padrão — em produção use GET /sites/MLB/domain_discovery/search */
    const categoriaML = req.body.categoriaML || 'MLB3530'; // Ventiladores

    const body = {
      title:          produto.nome,
      category_id:    categoriaML,
      price:          produto.desconto > 0 ? +(produto.preco * (1 - produto.desconto / 100)).toFixed(2) : produto.preco,
      currency_id:    'BRL',
      available_quantity: produto.estoque,
      buying_mode:    'buy_it_now',
      listing_type_id:'free',
      condition:      'new',
      description:    { plain_text: produto.descricao || produto.nome },
      sale_terms: [{ id:'WARRANTY_TYPE', value_name:'Garantia do fabricante' }, { id:'WARRANTY_TIME', value_name:'1 año' }]
    };

    /* adiciona foto se existir */
    if (produto.fotos && produto.fotos.length) {
      body.pictures = produto.fotos.map(url => ({ source: url }));
    }

    const r = await axios.post(`${ML_API}/items`, body, { headers: { Authorization: `Bearer ${token}` } });

    /* salva o mlId no produto */
    produto.mlId     = r.data.id;
    produto.mlStatus = r.data.status;
    write('produtos.json', produtos);

    res.json({ ok: true, mlId: r.data.id, permalink: r.data.permalink });
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    res.status(500).json({ error: 'Erro ao publicar no ML: ' + msg });
  }
});

/* ── ATUALIZAR PREÇO/ESTOQUE NO ML ───────────────────────── */
/* PUT /api/ml/atualizar/:produtoId */
router.put('/atualizar/:produtoId', authAdmin, async (req, res) => {
  try {
    const token    = await mlToken();
    const produtos = read('produtos.json');
    const produto  = produtos.find(p => p.id === +req.params.produtoId);
    if (!produto?.mlId) return res.status(400).json({ error: 'Produto não publicado no ML.' });

    await axios.put(`${ML_API}/items/${produto.mlId}`, {
      price:              produto.desconto > 0 ? +(produto.preco * (1 - produto.desconto / 100)).toFixed(2) : produto.preco,
      available_quantity: produto.estoque
    }, { headers: { Authorization: `Bearer ${token}` } });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.message || err.message });
  }
});

/* ── WEBHOOK ML (notificações de venda) ──────────────────── */
router.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  try {
    const { topic, resource } = req.body;
    if (topic !== 'orders_v2') return;

    const token = await mlToken();
    const order = await axios.get(`${ML_API}${resource}`, { headers: { Authorization: `Bearer ${token}` } });
    const o     = order.data;

    if (o.status !== 'paid') return;

    /* desconta estoque de cada item vendido */
    const produtos = read('produtos.json');
    (o.order_items || []).forEach(item => {
      const titulo = item.item?.title || '';
      const prod   = produtos.find(p => p.mlId === item.item?.id || p.nome === titulo);
      if (prod) prod.estoque = Math.max(0, prod.estoque - item.quantity);
    });
    write('produtos.json', produtos);
    console.log(`Venda ML ordem ${o.id} processada.`);
  } catch (err) {
    console.error('Webhook ML erro:', err.message);
  }
});

/* ── LISTAR ANÚNCIOS DO ML ───────────────────────────────── */
/* GET /api/ml/meus-anuncios?q=busca&offset=0 */
router.get('/meus-anuncios', authAdmin, async (req, res) => {
  try {
    const token = await mlToken();
    const me    = await axios.get(`${ML_API}/users/me`, { headers: { Authorization: `Bearer ${token}` } });
    const userId = me.data.id;

    const q      = req.query.q || '';
    const offset = parseInt(req.query.offset) || 0;
    const limit  = 20;

    /* busca itens do vendedor */
    const searchUrl = q
      ? `${ML_API}/sites/MLB/search?seller_id=${userId}&q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}`
      : `${ML_API}/users/${userId}/items/search?limit=${limit}&offset=${offset}`;

    const searchRes = await axios.get(searchUrl, { headers: { Authorization: `Bearer ${token}` } });

    let itens = [];

    if (q) {
      /* busca já retorna detalhes */
      const results = searchRes.data.results || [];
      itens = results.map(i => ({
        id:       i.id,
        titulo:   i.title,
        preco:    i.price,
        estoque:  i.available_quantity,
        fotos:    (i.thumbnail ? [i.thumbnail.replace('-I.jpg', '-O.jpg')] : []),
        permalink: i.permalink
      }));
    } else {
      /* lista só IDs → buscar em batch */
      const ids = (searchRes.data.results || []);
      if (ids.length === 0) return res.json({ itens: [], total: 0 });

      const batch = await axios.get(
        `${ML_API}/items?ids=${ids.join(',')}&attributes=id,title,price,available_quantity,thumbnail,permalink`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      itens = (batch.data || [])
        .filter(r => r.code === 200)
        .map(r => ({
          id:       r.body.id,
          titulo:   r.body.title,
          preco:    r.body.price,
          estoque:  r.body.available_quantity,
          fotos:    (r.body.thumbnail ? [r.body.thumbnail.replace('-I.jpg', '-O.jpg')] : []),
          permalink: r.body.permalink
        }));
    }

    const total = searchRes.data.paging?.total || searchRes.data.total || itens.length;
    res.json({ itens, total });
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.message || err.message });
  }
});

/* ── IMPORTAR ANÚNCIO DO ML ──────────────────────────────── */
/* POST /api/ml/importar  body: { mlId } */
router.post('/importar', authAdmin, async (req, res) => {
  try {
    const { mlId } = req.body;
    if (!mlId) return res.status(400).json({ error: 'mlId obrigatório.' });

    const token = await mlToken();

    const [itemRes, descRes] = await Promise.allSettled([
      axios.get(`${ML_API}/items/${mlId}`, { headers: { Authorization: `Bearer ${token}` } }),
      axios.get(`${ML_API}/items/${mlId}/description`, { headers: { Authorization: `Bearer ${token}` } })
    ]);

    if (itemRes.status === 'rejected') {
      return res.status(400).json({ error: 'Item não encontrado no Mercado Livre.' });
    }

    const item = itemRes.value.data;
    const descricao = descRes.status === 'fulfilled' ? descRes.value.data.plain_text || '' : '';

    const fotos = (item.pictures || []).map(p => p.secure_url || p.url).filter(Boolean);

    const novo = {
      id:        Date.now(),
      criadoEm: new Date().toISOString(),
      titulo:   item.title,
      preco:    item.price,
      desconto: 0,
      estoque:  item.available_quantity || 0,
      status:   'ativo',
      fotos,
      descricao,
      mlId:     item.id,
      mlPermalink: item.permalink
    };

    const anuncios = read('anuncios.json');
    anuncios.push(novo);
    write('anuncios.json', anuncios);

    res.status(201).json(novo);
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.message || err.message });
  }
});

/* ── DESCONECTAR ─────────────────────────────────────────── */
router.delete('/desconectar', authAdmin, (req, res) => {
  try { write('ml_token.json', {}); } catch {}
  res.json({ ok: true });
});

module.exports = router;
