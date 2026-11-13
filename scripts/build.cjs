// Assemble the static deployment directory (dist/) for Cloudflare Workers Static Assets.
const { cpSync, mkdirSync, rmSync } = require('node:fs');
const { basename, join, resolve } = require('node:path');

const root = resolve(__dirname, '..');
const dist = join(root, 'dist');

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

cpSync(join(root, 'index.html'), join(dist, 'index.html'));
cpSync(join(root, '_headers'), join(dist, '_headers'));
cpSync(join(root, 'assets'), join(dist, 'assets'), {
    recursive: true,
    filter: (source) => basename(source) !== '.DS_Store',
});
