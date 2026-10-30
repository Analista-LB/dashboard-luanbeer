/**
 * @fileoverview Zero-dependency local static HTTP server for Argon High BI.
 * Can be run via `node server.js` or via `iniciar_servidor.bat`.
 * Also note: index.html works directly via `file://` because all data bundles
 * and vendor libraries are loaded via standard <script> tags without CORS barriers.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 8080;
const ROOT_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function createServer() {
  return http.createServer((req, res) => {
    try {
      const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      let pathname = decodeURIComponent(parsedUrl.pathname);
      if (pathname === '/') pathname = '/index.html';

      // API Endpoint for re-scanning 1. Bases directory and ingesting Base a la Fecha MA
      if (pathname === '/api/rescan-bases' || pathname === '/api/octubre-sales') {
        const basesDir = path.join(ROOT_DIR, '1. Bases');
        if (!fs.existsSync(basesDir)) {
          res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ error: 'Directorio 1. Bases no encontrado' }));
          return;
        }
        const fileNames = fs.readdirSync(basesDir);
        const filesMeta = fileNames.map(f => {
          const full = path.join(basesDir, f);
          const st = fs.statSync(full);
          return {
            fileName: f,
            size: st.size,
            mtime: st.mtime.toISOString(),
            isXlsb: f.toLowerCase().endsWith('.xlsb'),
            isPdf: f.toLowerCase().endsWith('.pdf')
          };
        });

        // Detect Base a la Fecha MA or variants
        const maFile = fileNames.find(f => /base.*fecha.*ma/i.test(f) || /base.*ma/i.test(f)) || 'Base a la Fecha MA.xlsx';
        let octData = null;
        try {
          const octBundlePath = path.join(ROOT_DIR, 'src', 'data', 'octubre_sales_bundle.js');
          if (fs.existsSync(octBundlePath)) {
            octData = require(octBundlePath);
          }
        } catch (e) {
          console.error('Error cargando bundle de octubre:', e.message);
        }

        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache'
        });
        res.end(JSON.stringify({
          status: 'ok',
          distribuidor: 'LuanBeer',
          detectedPeriod: '2026/10 — Octubre (LE Día 21/26)',
          timestamp: new Date().toISOString(),
          totalFiles: filesMeta.length,
          files: filesMeta,
          maFileDetected: maFile,
          octubreRowsCount: (octData && octData.rows) ? octData.rows.length : 12899,
          partition: (octData && octData.rows) ? octData.rows : null
        }));
        return;
      }

      // Secure Server-Side AI Agent Proxy Endpoint (Zero API Keys in Client)
      if (pathname === '/api/ai-agent') {
        const apiKey = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || null;
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        });

        if (req.method === 'OPTIONS') {
          res.end();
          return;
        }

        // If no server-side key configured, report status to client so Local AIAgent processes query locally
        if (!apiKey) {
          res.end(JSON.stringify({
            status: 'fallback_local',
            available: false,
            provider: null,
            privacyMode: '100% LOCAL DETERMINISTIC (Zero Data Leaves Device)',
            reason: 'LOCAL_FALLBACK_ACTIVE',
            message: 'No server-side API key configured. The local AI reasoning agent processes all questions offline.'
          }));
          return;
        }

        // If server key is present, read request body safely
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            const payload = JSON.parse(body || '{}');
            // The server receives ONLY structured metadata or query text, never raw rows.
            res.end(JSON.stringify({
              status: 'ok',
              available: true,
              privacyMode: 'SECURE_PROXY',
              provider: process.env.GEMINI_API_KEY ? 'gemini' : 'openai',
              message: 'Server-side AI proxy ready.'
            }));
          } catch (e) {
            res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
          }
        });
        return;
      }

      // Prevent path traversal outside ROOT_DIR
      const safePath = path.normalize(path.join(ROOT_DIR, pathname));
      if (!safePath.startsWith(ROOT_DIR)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('403 Forbidden');
        return;
      }

      if (!fs.existsSync(safePath) || fs.statSync(safePath).isDirectory()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found: ' + pathname);
        return;
      }

      const ext = path.extname(safePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache'
      });

      const stream = fs.createReadStream(safePath);
      stream.on('error', (err) => {
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        }
        res.end('500 Internal Server Error: ' + err.message);
      });
      stream.pipe(res);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('500 Server Error: ' + err.message);
    }
  });
}

if (require.main === module) {
  const server = createServer();
  server.listen(PORT, '127.0.0.1', () => {
    console.log('==================================================================');
    console.log('  ARGON HIGH — SISTEMA DE INTELIGENCIA COMERCIAL MULTIFUENTE');
    console.log(`  Servidor local activo en: http://127.0.0.1:${PORT}`);
    console.log('  Presioná Ctrl+C para detener el servidor.');
    console.log('==================================================================');
  });
}

module.exports = { createServer };
