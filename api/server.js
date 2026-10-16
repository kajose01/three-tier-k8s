const http = require('http');
const fs = require('fs');
const mysql = require('mysql2/promise');

const VERSION = process.env.APP_VERSION || 'dev';
const LOG = '/var/log/app/access.log';   // shared volume, read by the log-sidecar container

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'mysql',
  user: process.env.DB_USER || 'app',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'appdb',
  waitForConnections: true,
  connectionLimit: 5,
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function initDb() {
  for (let i = 1; i <= 30; i++) {
    try {
      await pool.query('CREATE TABLE IF NOT EXISTS items (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
      console.log('database ready');
      return;
    } catch (e) {
      console.log(`database not ready (attempt ${i}/30): ${e.code || e.message}`);
      await sleep(2000);
    }
  }
  throw new Error('database never became ready');
}

function logAccess(req, code) {
  try { fs.appendFileSync(LOG, `${new Date().toISOString()} ${req.method} ${req.url} ${code}\n`); } catch (_) {}
}

function send(req, res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
  logAccess(req, code);
}

const readBody = (req) => new Promise((resolve) => {
  let d = '';
  req.on('data', (c) => { d += c; if (d.length > 10000) req.destroy(); });
  req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch { resolve({}); } });
});

const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  try {
    if (url === '/health') return send(req, res, 200, { status: 'ok' });
    if (url === '/ready') { await pool.query('SELECT 1'); return send(req, res, 200, { status: 'ready' }); }
    if (url === '/api/info') return send(req, res, 200, { version: VERSION, pod: process.env.HOSTNAME });
    if (url === '/api/items' && req.method === 'GET') {
      const [rows] = await pool.query('SELECT id, name, created_at FROM items ORDER BY id DESC LIMIT 50');
      return send(req, res, 200, rows);
    }
    if (url === '/api/items' && req.method === 'POST') {
      const { name } = await readBody(req);
      if (!name || typeof name !== 'string') return send(req, res, 400, { error: 'name is required' });
      const [r] = await pool.query('INSERT INTO items (name) VALUES (?)', [name.slice(0, 100)]);
      return send(req, res, 201, { id: r.insertId, name });
    }
    if (url === '/api/items/count') {
      const [r] = await pool.query('SELECT COUNT(*) AS n FROM items');
      return send(req, res, 200, { count: r[0].n });
    }
    send(req, res, 404, { error: 'not found' });
  } catch (e) {
    console.error(e.message);
    send(req, res, 500, { error: 'server error' });
  }
});

initDb().then(() => server.listen(3000, () => console.log(`api ${VERSION} listening on 3000`)))
        .catch((e) => { console.error(e.message); process.exit(1); });
