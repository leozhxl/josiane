/* Redefine a senha do painel admin.
   Uso: npm run reset-admin -- NOVA_SENHA [USUARIO]
   Funciona tanto com os arquivos locais quanto com o Redis
   (se KV_REST_API_URL / KV_REST_API_TOKEN estiverem no .env). */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { read, write, usaRedis } = require('../middleware/db');

(async () => {
  const [senha, usuario] = process.argv.slice(2);
  if (!senha || senha.length < 6) {
    console.error('Uso: npm run reset-admin -- NOVA_SENHA [USUARIO]   (mínimo 6 caracteres)');
    process.exit(1);
  }
  const creds = await read('admin.json', {});
  creds.user = usuario || creds.user || 'admin';
  creds.pass = await bcrypt.hash(senha, 10);
  await write('admin.json', creds);
  console.log(`Senha redefinida para o usuário "${creds.user}" (${usaRedis ? 'Redis' : 'arquivo local'}).`);
})().catch(err => { console.error(err.message); process.exit(1); });
