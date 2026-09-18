// TEMPORÁRIO: expõe o erro de inicialização na resposta HTTP
let handler;
try {
  handler = require('./server');
} catch (e) {
  handler = (req, res) => {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('LOAD ERROR\n' + (e && e.stack || e));
  };
}
module.exports = handler;
