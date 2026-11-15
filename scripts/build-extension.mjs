// Copies the shared, tested modules from dist/ into extension/src/ so the unpacked extension is self-contained.
// dist/ stays the single source of truth for the parser, planner, logic, sample and catalog.
import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dist = new URL('../dist/', import.meta.url);
const out = new URL('../extension/src/', import.meta.url);
mkdirSync(new URL('vendor/', out), { recursive: true });
// Programs (catalogue snapshot) are copied below as a folder.
const shared = ['audit.js', 'planner.js', 'logic.js', 'catalog.js', 'sample.js', 'webreg.js', 'ge.js', 'programs.js', 'board.js', 'panel.js', 'panel.css', 'fixtures.js', 'ge-data.js', 'ai.js',
  'vendor/pdf.mjs', 'vendor/pdf.worker.mjs', 'vendor/dm-sans.woff2', 'vendor/LICENSE.pdfjs', 'vendor/LICENSE.dm-sans'];
for (const file of shared) copyFileSync(new URL(file, dist), new URL(file, out));
import { cpSync, existsSync } from 'node:fs';
if (existsSync(new URL('programs/', dist))) cpSync(new URL('programs/', dist), new URL('programs/', out), { recursive: true });
console.log(`Copied ${shared.length} shared files into ${fileURLToPath(out)}`);
