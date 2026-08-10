/**
 * Minimal static file server. Written by hand rather than pulled from npm so
 * the project keeps its zero-dependency promise even for tooling.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

/**
 * @param {string} root directory to serve
 * @param {number} [port] 0 picks a free port
 * @returns {Promise<{url:string, port:number, close:()=>Promise<void>}>}
 */
export function serveDir(root, port = 0) {
  const abs = path.resolve(root);
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
    let filePath = path.join(abs, urlPath === '/' ? '/index.html' : urlPath);
    // Never escape the served root.
    if (!filePath.startsWith(abs)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    fs.stat(filePath, (err, stat) => {
      if (!err && stat.isDirectory()) filePath = path.join(filePath, 'index.html');
      fs.readFile(filePath, (err2, data) => {
        if (err2) {
          res.writeHead(404).end('not found');
          return;
        }
        res.writeHead(200, {
          'content-type': MIME[path.extname(filePath)] ?? 'application/octet-stream',
          'cache-control': 'no-store',
        });
        res.end(data);
      });
    });
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const addr = /** @type {any} */ (server.address());
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        port: addr.port,
        close: () => new Promise((r) => server.close(() => r(undefined))),
      });
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] ?? 'src';
  const port = Number(process.argv[3] ?? 8080);
  serveDir(root, port).then((s) => console.log(`serving ${root} at ${s.url}`));
}
