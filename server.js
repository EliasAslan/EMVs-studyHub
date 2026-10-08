const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const PORT = process.env.PORT || 8080;

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  const relativePath = urlPath.startsWith('/') ? urlPath.slice(1) : urlPath;
  const file = path.resolve(root, relativePath);
  const relativeToRoot = path.relative(root, file);

  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('forbidden');
    return;
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found: ' + urlPath);
      return;
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`EMVS Study Hub on http://localhost:${PORT}`);
});
