const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 5174;
const PUBLIC_DIR = process.env.VIEWFINDER_DIR || path.join(__dirname, 'public/simple');

const options = {
  key: fs.readFileSync(path.join(__dirname, 'key.pem')),
  cert: fs.readFileSync(path.join(__dirname, 'cert.pem')),
};

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const server = https.createServer(options, (req, res) => {
  // Security: prevent directory traversal
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = filePath.split('?')[0]; // Remove query string
  const fullPath = path.join(PUBLIC_DIR, filePath);

  // Prevent directory traversal
  if (!fullPath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      // Fallback to index.html for SPA-like behavior
      if (!filePath.includes('.')) {
        fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (err2, data2) => {
          if (err2) {
            res.writeHead(404);
            res.end('Not found');
            return;
          }
          res.setHeader('Content-Type', 'text/html');
          res.end(data2);
        });
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
      return;
    }

    const ext = path.extname(fullPath);
    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Simple HTTPS server running at https://0.0.0.0:${PORT}/`);
  console.log(`Access on LAN: https://<your-ip>:${PORT}/`);
});