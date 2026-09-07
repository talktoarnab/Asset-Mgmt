#!/usr/bin/env node
/**
 * Local static server. Serves this folder on :5173 and proxies /v1 to the
 * Lambda harness on :4000 so the browser talks to one origin, same as CloudFront.
 */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 5173);
const API = process.env.API_URL ?? 'http://127.0.0.1:4000';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

const SKIP = new Set(['serve.mjs']);

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);

    if (url.pathname === '/v1' || url.pathname.startsWith('/v1/')) {
      const headers = {};
      for (const [key, value] of Object.entries(req.headers)) {
        if (!value || key === 'host' || key === 'connection') continue;
        headers[key] = Array.isArray(value) ? value.join(',') : value;
      }
      const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req);
      const upstream = await fetch(`${API}${url.pathname}${url.search}`, {
        method: req.method,
        headers,
        body: body && body.length ? body : undefined,
      });
      const out = { 'cache-control': 'no-store' };
      upstream.headers.forEach((value, key) => {
        if (key === 'transfer-encoding') return;
        out[key] = value;
      });
      res.writeHead(upstream.status, out);
      res.end(Buffer.from(await upstream.arrayBuffer()));
      return;
    }

    let filePath = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    if (url.pathname === '/' || !path.extname(url.pathname)) {
      filePath = path.join(ROOT, 'index.html');
    }
    const base = path.basename(filePath);
    if (SKIP.has(base) || base.startsWith('.')) {
      res.writeHead(404).end('Not found');
      return;
    }
    const data = await fs.readFile(filePath);
    res.writeHead(200, {
      'content-type': TYPES[path.extname(filePath)] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    res.end(data);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      const data = await fs.readFile(path.join(ROOT, 'index.html'));
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
      res.end(data);
      return;
    }
    console.error(error);
    res.writeHead(500).end('Server error');
  }
});

server.listen(PORT, () => {
  console.log(`Desk app on http://localhost:${PORT}  (API proxy → ${API})`);
});
