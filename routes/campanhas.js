const router     = require('express').Router();
const crypto     = require('crypto');
const nodemailer = require('nodemailer');
const { authAdmin, SECRET } = require('../middleware/auth');
const { read, write } = require('../middleware/db');
const { isoBR, somaDias } = require('../middleware/datas');

/* ── SMTP ────────────────────────────────────────────────────
   Configure no .env (ex.: Gmail com "senha de app"):
   SMTP_HOST=smtp.gmail.com  SMTP_PORT=465  SMTP_USER=...  SMTP_PASS=...
   SMTP_FROM="Nome <email@dominio>" (opcional, padrão = SMTP_USER)   */
function smtpConfigurado() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function transporte() {
  const port = Number(process.env.SMTP_PORT) || 465;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

/* ── DESCADASTRO (link no rodapé de cada e-mail) ─────────── */
function assinatura(email) {
  return crypto.createHmac('sha256', SECRET).update(String(email).toLowerCase()).digest('hex').slice(0, 24);
}

function baseUrl(req) {
  return (process.env.BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ── SEGMENTOS ───────────────────────────────────────────── */
async function segmentar() {
  const clientes = (await read('clientes.json')).filter(c => c.newsletter && c.email);
  const pedidos  = (await read('pedidos.json')).filter(p => p.status !== 'Cancelado');
  const hoje     = isoBR();
  const limNovo  = somaDias(hoje, -30);
  const limInat  = somaDias(hoje, -60);

  const ultimaCompra = {};
  pedidos.forEach(p => {
    const e = (p.email || '').toLowerCase();
    if (!ultimaCompra[e] || p.data > ultimaCompra[e]) ultimaCompra[e] = p.data;
  });

  return {
    todos:    clientes,
    novos:    clientes.filter(c => c.criadoEm && isoBR(new Date(c.criadoEm)) >= limNovo),
    inativos: clientes.filter(c => {
      const u = ultimaCompra[c.email.toLowerCase()];
      return u ? u < limInat : (c.criadoEm ? isoBR(new Date(c.criadoEm)) < limInat : true);
    })
  };
}

/* GET /api/campanhas — histórico + contagem por segmento */
router.get('/', authAdmin, async (req, res) => {
  const segs = await segmentar();
  const total = (await read('clientes.json')).length;
  res.json({
    campanhas: await read('campanhas.json'),
    smtpConfigurado: smtpConfigurado(),
    totalClientes: total,
    segmentos: { todos: segs.todos.length, novos: segs.novos.length, inativos: segs.inativos.length }
  });
});

/* POST /api/campanhas — dispara a campanha por e-mail */
router.post('/', authAdmin, async (req, res) => {
  const assunto  = String(req.body.assunto || '').trim();
  const corpo    = String(req.body.corpo || '').trim();
  const segmento = ['todos', 'novos', 'inativos'].includes(req.body.segmento) ? req.body.segmento : 'todos';
  if (!assunto) return res.status(400).json({ error: 'Informe o assunto da campanha.' });
  if (!corpo)   return res.status(400).json({ error: 'Escreva o conteúdo da mensagem.' });
  if (!smtpConfigurado()) {
    return res.status(400).json({ error: 'E-mail não configurado no servidor. Defina SMTP_HOST, SMTP_PORT, SMTP_USER e SMTP_PASS no .env / Vercel.' });
  }

  const destinatarios = (await segmentar())[segmento];
  if (!destinatarios.length) return res.status(400).json({ error: 'Nenhum cliente inscrito na newsletter neste segmento.' });

  const cfg  = await read('config.json', {});
  const loja = cfg.nomeLoja || 'Loja';
  const from = process.env.SMTP_FROM || `${loja} <${process.env.SMTP_USER}>`;
  const base = baseUrl(req);
  const tp   = transporte();

  let enviados = 0;
  const falhas = [];
  /* envia em lotes pequenos para não estourar limites do provedor */
  for (let i = 0; i < destinatarios.length; i += 5) {
    const lote = destinatarios.slice(i, i + 5);
    await Promise.all(lote.map(async c => {
      const primeiroNome = String(c.nome || '').split(' ')[0] || 'cliente';
      const texto = corpo.replace(/\{nome\}/g, primeiroNome);
      const sair  = `${base}/api/campanhas/descadastrar?e=${encodeURIComponent(c.email)}&t=${assinatura(c.email)}`;
      try {
        await tp.sendMail({
          from, to: c.email, subject: assunto.replace(/\{nome\}/g, primeiroNome),
          text: texto + `\n\n—\nPara não receber mais e-mails: ${sair}`,
          html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#222;max-width:600px">` +
                esc(texto).replace(/\n/g, '<br>') +
                `<hr style="border:none;border-top:1px solid #eee;margin:24px 0">` +
                `<p style="font-size:12px;color:#888">${esc(loja)} · <a href="${sair}" style="color:#888">Não quero mais receber e-mails</a></p></div>`,
          headers: { 'List-Unsubscribe': `<${sair}>` }
        });
        enviados++;
      } catch (err) {
        falhas.push({ email: c.email, erro: err.message });
      }
    }));
  }

  const campanhas = await read('campanhas.json');
  const nova = {
    id: Date.now(), assunto, corpo, segmento,
    destinatarios: destinatarios.length, enviados, falhas: falhas.length,
    data: new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
    criadoEm: new Date().toISOString()
  };
  campanhas.unshift(nova);
  await write('campanhas.json', campanhas);

  if (!enviados) {
    return res.status(502).json({ error: 'Nenhum e-mail foi enviado: ' + (falhas[0]?.erro || 'erro desconhecido'), campanha: nova });
  }
  res.status(201).json({ ...nova, erros: falhas.slice(0, 5) });
});

/* DELETE /api/campanhas/:id — remove do histórico */
router.delete('/:id', authAdmin, async (req, res) => {
  const campanhas = await read('campanhas.json');
  await write('campanhas.json', campanhas.filter(c => String(c.id) !== req.params.id));
  res.json({ ok: true });
});

/* GET /api/campanhas/descadastrar?e=email&t=assinatura — público */
router.get('/descadastrar', async (req, res) => {
  const email = String(req.query.e || '');
  const ok = email && req.query.t &&
    crypto.timingSafeEqual(Buffer.from(String(req.query.t).padEnd(24).slice(0, 24)), Buffer.from(assinatura(email)));
  if (!ok) return res.status(400).send('Link inválido.');

  const clientes = await read('clientes.json');
  const c = clientes.find(x => (x.email || '').toLowerCase() === email.toLowerCase());
  if (c && c.newsletter) { c.newsletter = false; await write('clientes.json', clientes); }
  res.send('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<div style="font-family:Arial,sans-serif;max-width:480px;margin:80px auto;text-align:center;padding:0 16px">' +
    '<h2>Pronto!</h2><p>Você não receberá mais nossos e-mails de campanha.</p><a href="/">Voltar para a loja</a></div>');
});

module.exports = router;
