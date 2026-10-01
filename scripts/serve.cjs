// Small dependency-free server for local development and browser tests.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const types = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.svg': 'image/svg+xml',
};
http.createServer((req, res) => {
    let name;
    try {
        name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
        res.writeHead(400).end();
        return;
    }
    const file = path.resolve(root, `.${name === '/' ? '/index.html' : name}`);
    const publicAsset = file.startsWith(path.join(root, 'assets') + path.sep);
    if (file !== path.join(root, 'index.html') && !publicAsset) {
        res.writeHead(403).end();
        return;
    }
    fs.readFile(file, (error, data) => {
        if (error) {
            res.writeHead(404).end('Not found');
            return;
        }
        res.writeHead(200, {
            'Content-Type': types[path.extname(file)] || 'application/octet-stream',
        });
        res.end(data);
    });
}).listen(4173, '127.0.0.1', () => console.log('Music History Analyzer: http://127.0.0.1:4173'));
