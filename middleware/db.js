const fs    = require('fs');
const path  = require('path');
const axios = require('axios');

const DIR = path.join(__dirname, '..', 'data');

/* ── BACKEND ─────────────────────────────────────────────────
   Localmente os dados ficam em data/*.json.
   No Vercel o disco é somente leitura, então usamos o Upstash Redis
   (Vercel > Storage > Upstash for Redis). A integração cria as
   variáveis KV_REST_API_URL e KV_REST_API_TOKEN automaticamente.
   Os arquivos de data/ servem de semente: enquanto uma chave não
   existir no Redis, o conteúdo do arquivo é usado.               */
const REDIS_URL   = process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL   || '';
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
const usaRedis    = !!(REDIS_URL && REDIS_TOKEN);

async function redis(cmd) {
  const r = await axios.post(REDIS_URL, cmd, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    timeout: 8000,
    maxBodyLength: Infinity
  });
  return r.data.result;
}

function lerArquivo(file) {
  const p = path.join(DIR, file);
  if (!fs.existsSync(p)) return undefined;
  try {
    const txt = fs.readFileSync(p, 'utf8').trim();
    return txt ? JSON.parse(txt) : undefined;
  } catch { return undefined; }
}

/* read(file, padrao) — devolve o conteúdo ou `padrao` ([] por padrão) */
async function read(file, padrao = []) {
  if (usaRedis) {
    const raw = await redis(['GET', 'data:' + file]);
    if (raw != null) {
      try { return JSON.parse(raw); } catch { return padrao; }
    }
  }
  const v = lerArquivo(file);
  return v === undefined || v === null ? padrao : v;
}

async function write(file, data) {
  if (usaRedis) {
    await redis(['SET', 'data:' + file, JSON.stringify(data)]);
    return;
  }
  try {
    fs.writeFileSync(path.join(DIR, file), JSON.stringify(data, null, 2));
  } catch (err) {
    if (err.code === 'EROFS' || err.code === 'EACCES') {
      throw new Error('Servidor sem armazenamento gravável. Conecte o Upstash Redis no Vercel (KV_REST_API_URL / KV_REST_API_TOKEN).');
    }
    throw err;
  }
}

/* ── IMAGENS ─────────────────────────────────────────────── */
async function saveImage(buffer, mime, ext) {
  const id = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  if (usaRedis) {
    await redis(['SET', 'img:' + id, JSON.stringify({ mime, b64: buffer.toString('base64') })]);
    return '/api/imagens/' + id;
  }
  const dir = path.join(__dirname, '..', 'public', 'uploads');
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, id + ext), buffer);
  } catch (err) {
    if (err.code === 'EROFS' || err.code === 'EACCES') {
      throw new Error('Servidor sem armazenamento gravável para imagens. Conecte o Upstash Redis no Vercel.');
    }
    throw err;
  }
  return '/uploads/' + id + ext;
}

async function getImage(id) {
  if (!usaRedis) return null;
  const raw = await redis(['GET', 'img:' + id]);
  if (!raw) return null;
  const { mime, b64 } = JSON.parse(raw);
  return { mime, buffer: Buffer.from(b64, 'base64') };
}

module.exports = { read, write, saveImage, getImage, usaRedis };
