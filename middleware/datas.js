/* Datas no fuso de Brasília (o servidor do Vercel roda em UTC) */
const TZ = 'America/Sao_Paulo';

/* YYYY-MM-DD de uma data no fuso de Brasília */
function isoBR(d = new Date()) {
  return d.toLocaleDateString('en-CA', { timeZone: TZ });
}

/* soma dias a uma string YYYY-MM-DD */
function somaDias(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

module.exports = { isoBR, somaDias };
