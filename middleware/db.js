const fs   = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'data');

function read(file) {
  try { return JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8')); }
  catch { return file.endsWith('.json') && fs.existsSync(path.join(DIR, file)) ? null : []; }
}

function write(file, data) {
  fs.writeFileSync(path.join(DIR, file), JSON.stringify(data, null, 2));
}

module.exports = { read, write };
