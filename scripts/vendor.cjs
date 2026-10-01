const { copyFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');
const target = join(__dirname, '..', 'assets', 'vendor');
mkdirSync(target, { recursive: true });
const root = join(__dirname, '..', 'node_modules');
for (const [source, destination] of [
    ['jszip/dist/jszip.min.js', 'jszip.min.js'],
    ['jszip/LICENSE.markdown', 'JSZip-LICENSE.md'],
    ['chart.js/dist/chart.umd.min.js', 'chart.umd.min.js'],
    ['chart.js/LICENSE.md', 'Chart-LICENSE.md'],
])
    copyFileSync(join(root, source), join(target, destination));
