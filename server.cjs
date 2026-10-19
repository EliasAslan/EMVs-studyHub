const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const PORT = process.env.PORT || 8080;

// Canonical host: http://localhost:8080 (local dev)
// If deploying to Vercel, update this comment and the CSP connect-src accordingly.

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

const securityHeaders = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' https://esm.sh https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "connect-src 'self' https://*.supabase.co http://localhost:11434",
    "img-src 'self' data: blob:",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
};

const cacheHeaders = {
  // Short cache for static assets
  '.js': { 'Cache-Control': 'public, max-age=3600, must-revalidate' },
  '.css': { 'Cache-Control': 'public, max-age=3600, must-revalidate' },
  '.png': { 'Cache-Control': 'public, max-age=86400' },
  '.svg': { 'Cache-Control': 'public, max-age=86400' },
  '.json': { 'Cache-Control': 'no-cache' },
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  const relativePath = urlPath.startsWith('/') ? urlPath.slice(1) : urlPath;
  const file = path.resolve(root, relativePath);
  const relativeToRoot = path.relative(root, file);

  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    res.writeHead(403, { 'Content-Type': 'text/plain', ...securityHeaders });
    res.end('forbidden');
    return;
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain', ...securityHeaders });
      res.end('not found: ' + urlPath);
      return;
    }
    const ext = path.extname(file);
    const headers = {
      'Content-Type': types[ext] || 'application/octet-stream',
      ...securityHeaders,
      ...(cacheHeaders[ext] || {}),
    };
    res.writeHead(200, headers);
    res.end(data);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`EMVS Study Hub on http://localhost:${PORT}`);
});